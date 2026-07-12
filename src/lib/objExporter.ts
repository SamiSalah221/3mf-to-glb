import * as THREE from 'three';
import JSZip from 'jszip';
import { BUILD_UP_AXIS, reorientCloneToYUp } from './glbBuilder.js';
import { linearToSrgb } from './colorConvert.js';

/** Millimeters per meter. OBJ carries no unit declaration, so we pick one. */
const MM_PER_METER = 1000;

/** Decimal places for positions. In millimeters this is 0.1 micron. */
const POSITION_PRECISION = 4;
const NORMAL_PRECISION = 6;

export interface OBJBuildOptions {
  /** Name written into the .obj `mtllib` line. Defaults to `model.mtl`. */
  mtlFilename?: string;
  /**
   * Output units per scene meter. The scene is baked in meters (see
   * `buildSceneFromPlate`), but OBJ has no unit declaration and every 3D
   * printing consumer treats one unit as one millimeter. Defaults to 1000.
   */
  unitsPerMeter?: number;
}

export interface OBJBuildResult {
  obj: string;
  mtl: string;
}

/**
 * Serialize a THREE scene/group to Wavefront OBJ + MTL.
 *
 * Portable: no DOM, no WebGL. Returns both file bodies as strings; the caller
 * decides how to package them.
 *
 * Three's own OBJExporter addon is not usable here because it writes geometry
 * only and drops materials entirely, which would throw away the whole point of
 * this app. So the writer is by hand.
 *
 * Mirrors `buildGLBBytes`: the scene is cloned, the clone is reoriented Z-up to
 * Y-up so OBJ and GLB agree on orientation, and the cloned geometries are
 * disposed afterwards. Materials are NOT disposed: `clone(true)` shares
 * material instances with the live viewer scene and we only read their colors.
 */
export function buildOBJ(scene: THREE.Object3D, options: OBJBuildOptions = {}): OBJBuildResult {
  const mtlFilename = options.mtlFilename ?? 'model.mtl';
  const unitsPerMeter = options.unitsPerMeter ?? MM_PER_METER;

  const exportScene = scene.clone(true);
  if (BUILD_UP_AXIS === 'z') reorientCloneToYUp(exportScene);

  try {
    exportScene.updateMatrixWorld(true);

    // Group meshes by filament so the OBJ carries one material per color zone
    // rather than one per chunk. Meshes without a filament tag land in group 0.
    const byFilament = new Map<number, THREE.Mesh[]>();
    exportScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.geometry?.getAttribute('position')) return;
      const filamentIndex = Number(child.userData?.filamentIndex ?? 0);
      const list = byFilament.get(filamentIndex);
      if (list) list.push(child);
      else byFilament.set(filamentIndex, [child]);
    });

    // Weld coincident vertices/normals into global lists so faces share
    // indices. The chunks handed to us are non-indexed triangle soup (three
    // private corners per triangle), so without welding every edge reads as
    // "open" to an editor and coincident color-zone boundaries never join.
    // The key is the formatted line payload: at POSITION_PRECISION (0.1 micron
    // in mm) genuinely coincident corners collapse to one vertex, while the
    // rounding also welds the last-bit differences the layer-clip path leaves.
    // OBJ allows cross-group vertex sharing and independent v/vn index streams,
    // so flat per-face normals survive and coincident boundaries close.
    const vertexLines: string[] = [];
    const vertexIndex = new Map<string, number>();
    const normalLines: string[] = [];
    const normalIndex = new Map<string, number>();

    const internVertex = (payload: string): number => {
      let idx = vertexIndex.get(payload);
      if (idx === undefined) {
        idx = vertexLines.length + 1; // OBJ indices are 1-based
        vertexLines.push(`v ${payload}`);
        vertexIndex.set(payload, idx);
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

    const mtlLines: string[] = ['# Exported by 3mf-to-glb (Printproof)'];
    // Face blocks, one per filament group, assembled after all v/vn lines.
    const groupBlocks: string[] = [];

    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();

    for (const filamentIndex of [...byFilament.keys()].sort((a, b) => a - b)) {
      const meshes = byFilament.get(filamentIndex)!;
      const materialName = `filament_${filamentIndex}`;

      mtlLines.push('', `newmtl ${materialName}`, ...materialBody(meshes[0]));

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
          vertRemap[i] = internVertex(
            `${fmt(position.x * unitsPerMeter, POSITION_PRECISION)} ` +
              `${fmt(position.y * unitsPerMeter, POSITION_PRECISION)} ` +
              `${fmt(position.z * unitsPerMeter, POSITION_PRECISION)}`,
          );
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
          // Two corners welded to one vertex means the triangle is zero-area at
          // output precision; such degenerate faces trip strict importers and
          // add nothing, so drop them. Neighbors quantize identically, so this
          // cannot open a hole.
          if (va === vb || vb === vc || vc === va) continue;
          faceLines.push(normRemap
            ? `f ${va}//${normRemap[a]} ${vb}//${normRemap[b]} ${vc}//${normRemap[c]}`
            : `f ${va} ${vb} ${vc}`);
        }
      }

      if (faceLines.length === 0) continue;
      // Join each group into one string. Spreading faceLines (up to ~1M lines on
      // dense models) into push() would overflow the argument stack.
      groupBlocks.push(`g ${materialName}\nusemtl ${materialName}\n${faceLines.join('\n')}`);
    }

    // Assemble section by section. Every section is join()ed rather than spread
    // for the same argument-stack reason: vertexLines alone reaches millions of
    // entries on the reporter file.
    const header =
      '# Exported by 3mf-to-glb (Printproof)\n' +
      `# units: millimeters (1 unit = ${(unitsPerMeter / MM_PER_METER).toFixed(3)} mm)\n` +
      `mtllib ${mtlFilename}`;
    const obj =
      [header, vertexLines.join('\n'), normalLines.join('\n'), groupBlocks.join('\n')]
        .filter((section) => section.length > 0)
        .join('\n') + '\n';

    return { obj, mtl: mtlLines.join('\n') + '\n' };
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

function materialBody(mesh: THREE.Mesh): string[] {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const color = (material as THREE.MeshStandardMaterial | undefined)?.color;

  // The scene's material colors are LINEAR (set through hexToLinearRGBA), but
  // MTL Kd is read as sRGB by every mainstream viewer. Writing linear values
  // straight out renders every color visibly dark. Convert back.
  const kd = color
    ? [color.r, color.g, color.b].map((c) => clamp01(linearToSrgb(c)))
    : [0.5, 0.5, 0.5];

  return [
    `Kd ${kd.map((c) => fmt(c, 6)).join(' ')}`,
    'Ka 0.000000 0.000000 0.000000',
    'Ks 0.000000 0.000000 0.000000',
    'd 1.000000',
    'illum 1',
  ];
}

function clamp01(c: number): number {
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

/**
 * Package an OBJ + its MTL into a single zip.
 *
 * The two files must travel together (the .obj references the .mtl by name and
 * carries no colors of its own), and browsers handle one download far more
 * predictably than two in a row.
 */
export async function buildOBJZipBytes(scene: THREE.Object3D, baseName: string): Promise<Uint8Array> {
  const mtlFilename = `${baseName}.mtl`;
  const { obj, mtl } = buildOBJ(scene, { mtlFilename });

  const zip = new JSZip();
  zip.file(`${baseName}.obj`, obj);
  zip.file(mtlFilename, mtl);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
