import * as THREE from 'three';
import { BUILD_UP_AXIS, reorientCloneToYUp } from './glbBuilder.js';
import { linearToSrgb } from './colorConvert.js';

/** Millimeters per meter. OBJ carries no unit declaration, so we pick one. */
const MM_PER_METER = 1000;

/** Decimal places for positions. In millimeters this is 0.1 micron. */
const POSITION_PRECISION = 4;
const NORMAL_PRECISION = 6;
/** Integer grid step matching POSITION_PRECISION (10^4 = 0.1 micron in mm). */
const POSITION_GRID = 10 ** POSITION_PRECISION;

/**
 * Marker written into the OBJ header so a future bug report identifies the
 * export format. The first OBJ export (v1) wrote geometry plus a companion MTL
 * with usemtl polygroups; importers that read an MTL ignore vertex colors, and
 * a build predating the T-junction repair left open edges. v2 is the current
 * format: per-vertex sRGB colors on the `v` lines, no MTL at all.
 */
const OBJ_FORMAT = 'printproof-obj-vertexcolor-v2';

export interface OBJBuildOptions {
  /**
   * Output units per scene meter. The scene is baked in meters (see
   * `buildSceneFromPlate`), but OBJ has no unit declaration and every 3D
   * printing consumer treats one unit as one millimeter. Defaults to 1000.
   */
  unitsPerMeter?: number;
}

export interface OBJBuildResult {
  obj: string;
  /** Degenerate faces skipped: both counts should stay near zero. */
  stats: {
    /** All three corners welded to one vertex (a true zero-area face). */
    droppedNull: number;
    /** Exactly two corners welded to one vertex (a sub-precision sliver). */
    droppedSliver: number;
  };
}

/**
 * Serialize a THREE scene/group to a per-vertex-color Wavefront OBJ.
 *
 * Color rides on the vertices: every `v` line is `x y z r g b` (sRGB, 0..1),
 * the extension MeshMixer's coloring mode and Bambu Studio's OBJ import read.
 * There is deliberately no MTL: when an OBJ ships both an MTL and vertex
 * colors, importers honor the MTL and drop the colors, which was the whole
 * reported defect. Filament zones are still emitted as `g filament_N` groups
 * (useful for modeling, and they coexist with vertex colors), just without any
 * `usemtl`.
 *
 * Three's own OBJExporter addon is not usable here: it writes geometry only.
 *
 * Mirrors `buildGLBBytes`: the scene is cloned, the clone is reoriented Z-up to
 * Y-up so OBJ and GLB agree on orientation, and the cloned geometries are
 * disposed afterwards. Materials are NOT disposed: `clone(true)` shares
 * material instances with the live viewer scene and we only read their colors,
 * so the exported colors always match what the user currently sees.
 */
export function buildOBJ(scene: THREE.Object3D, options: OBJBuildOptions = {}): OBJBuildResult {
  const unitsPerMeter = options.unitsPerMeter ?? MM_PER_METER;

  const exportScene = scene.clone(true);
  if (BUILD_UP_AXIS === 'z') reorientCloneToYUp(exportScene);

  try {
    exportScene.updateMatrixWorld(true);

    // Group meshes by filament so the OBJ carries one color per zone and one
    // `g filament_N` group. Meshes without a filament tag land in group 0.
    const byFilament = new Map<number, THREE.Mesh[]>();
    exportScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.geometry?.getAttribute('position')) return;
      const filamentIndex = Number(child.userData?.filamentIndex ?? 0);
      const list = byFilament.get(filamentIndex);
      if (list) list.push(child);
      else byFilament.set(filamentIndex, [child]);
    });

    // Weld coincident corners into a shared vertex pool so faces reference the
    // same vertex and the mesh reads as watertight. The chunks handed to us are
    // non-indexed triangle soup (three private corners per triangle), so without
    // welding every edge reads as "open" to an editor.
    //
    // The weld key is POSITION ONLY, on an integer grid (0.1 micron in mm). It
    // must never include color: a vertex on a color boundary is shared by faces
    // of two filaments, and folding color into the key would split it back into
    // two coincident vertices and reopen the edge. The boundary vertex instead
    // takes ONE color by first-writer: filament groups are visited in ascending
    // index order, so the lowest incident filament wins. The seam is at most one
    // subdivided-leaf triangle wide, which is sub-printable, and this matches how
    // MeshMixer stores a painted boundary.
    //
    // The emitted coordinate text is derived from the same grid integers as the
    // key, so the stored line and the key can never disagree.
    const vertexLines: string[] = [];
    const vertexIndex = new Map<string, number>();
    const normalLines: string[] = [];
    const normalIndex = new Map<string, number>();

    const gridText = (n: number): string => {
      // n is already a grid integer; -0 formats as 0.
      const v = n / POSITION_GRID;
      return (Object.is(v, -0) ? 0 : v).toFixed(POSITION_PRECISION);
    };
    const internVertex = (kx: number, ky: number, kz: number, colorPayload: string): number => {
      const key = `${kx},${ky},${kz}`;
      let idx = vertexIndex.get(key);
      if (idx === undefined) {
        idx = vertexLines.length + 1; // OBJ indices are 1-based
        vertexLines.push(`v ${gridText(kx)} ${gridText(ky)} ${gridText(kz)} ${colorPayload}`);
        vertexIndex.set(key, idx);
      }
      return idx;
    };
    const internNormal = (payload: string): number => {
      let idx = normalIndex.get(payload);
      if (idx === undefined) {
        idx = normalLines.length + 1;
        normalLines.push(`vn ${payload}`);
        normalIndex.set(payload, idx);
      }
      return idx;
    };

    // Face blocks, one per filament group, assembled after all v/vn lines.
    const groupBlocks: string[] = [];

    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    let droppedNull = 0;
    let droppedSliver = 0;

    for (const filamentIndex of [...byFilament.keys()].sort((a, b) => a - b)) {
      const meshes = byFilament.get(filamentIndex)!;
      const materialName = `filament_${filamentIndex}`;
      const colorPayload = colorPayloadOf(meshes[0]);

      const faceLines: string[] = [];

      for (const mesh of meshes) {
        const geometry = mesh.geometry;
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        const index = geometry.getIndex();
        normalMatrix.getNormalMatrix(mesh.matrixWorld);

        // Map this mesh's local attribute indices to the shared global indices.
        const vertRemap = new Int32Array(positions.count);
        for (let i = 0; i < positions.count; i++) {
          position.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          const kx = Math.round(position.x * unitsPerMeter * POSITION_GRID);
          const ky = Math.round(position.y * unitsPerMeter * POSITION_GRID);
          const kz = Math.round(position.z * unitsPerMeter * POSITION_GRID);
          vertRemap[i] = internVertex(kx, ky, kz, colorPayload);
        }

        let normRemap: Int32Array | null = null;
        if (normals) {
          normRemap = new Int32Array(normals.count);
          for (let i = 0; i < normals.count; i++) {
            normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
            normRemap[i] = internNormal(
              `${fmt(normal.x, NORMAL_PRECISION)} ` +
                `${fmt(normal.y, NORMAL_PRECISION)} ` +
                `${fmt(normal.z, NORMAL_PRECISION)}`,
            );
          }
        }

        const faceCount = index ? index.count / 3 : positions.count / 3;
        for (let f = 0; f < faceCount; f++) {
          const a = index ? index.getX(f * 3) : f * 3;
          const b = index ? index.getX(f * 3 + 1) : f * 3 + 1;
          const c = index ? index.getX(f * 3 + 2) : f * 3 + 2;
          const va = vertRemap[a], vb = vertRemap[b], vc = vertRemap[c];
          // A triangle whose corners collapsed under the weld is zero-area at
          // output precision; such faces trip strict importers and add nothing.
          // Neighbors quantize identically, so dropping them cannot open a hole
          // (when corners a,b merge to one vertex the neighbor across edge (a,b)
          // degenerates too, and the outer neighbors re-pair across the merged
          // edge). Count the two shapes so a regression can be spotted.
          if (va === vb && vb === vc) { droppedNull++; continue; }
          if (va === vb || vb === vc || vc === va) { droppedSliver++; continue; }
          faceLines.push(normRemap
            ? `f ${va}//${normRemap[a]} ${vb}//${normRemap[b]} ${vc}//${normRemap[c]}`
            : `f ${va} ${vb} ${vc}`);
        }
      }

      if (faceLines.length === 0) continue;
      // Join each group into one string. Spreading faceLines (up to ~1M lines on
      // dense models) into push() would overflow the argument stack.
      groupBlocks.push(`g ${materialName}\n${faceLines.join('\n')}`);
    }

    // Assemble section by section. Every section is join()ed rather than spread
    // for the same argument-stack reason: vertexLines alone reaches millions of
    // entries on the reporter file.
    const header =
      '# Exported by 3mf-to-glb (Printproof)\n' +
      `# format: ${OBJ_FORMAT}\n` +
      '# vertex colors: v x y z r g b (sRGB, 0..1)\n' +
      `# units: millimeters (1 unit = ${(unitsPerMeter / MM_PER_METER).toFixed(3)} mm)`;
    const obj =
      [header, vertexLines.join('\n'), normalLines.join('\n'), groupBlocks.join('\n')]
        .filter((section) => section.length > 0)
        .join('\n') + '\n';

    return { obj, stats: { droppedNull, droppedSliver } };
  } finally {
    // reorientCloneToYUp cloned each geometry; clone(true) shared the materials.
    exportScene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}

function fmt(n: number, precision: number): string {
  // Avoid "-0.0000" and exponent notation, both of which trip strict parsers.
  const rounded = Number(n.toFixed(precision));
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(precision);
}

/**
 * The `r g b` payload for a filament group's `v` lines. The scene's material
 * colors are LINEAR (set through hexToLinearRGBA) and, because `clone(true)`
 * shares material instances, this is the live recolored value. Vertex-color
 * consumers read the values as sRGB, so convert back.
 */
function colorPayloadOf(mesh: THREE.Mesh): string {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const color = (material as THREE.MeshStandardMaterial | undefined)?.color;
  const rgb = color
    ? [color.r, color.g, color.b].map((c) => clamp01(linearToSrgb(c)))
    : [0.5, 0.5, 0.5];
  return rgb.map((c) => fmt(c, POSITION_PRECISION)).join(' ');
}

function clamp01(c: number): number {
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

/** Serialize the scene straight to OBJ bytes for download. */
export function buildOBJBytes(scene: THREE.Object3D): Uint8Array {
  return new TextEncoder().encode(buildOBJ(scene).obj);
}
