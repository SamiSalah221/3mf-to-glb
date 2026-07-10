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

    const objLines: string[] = [
      '# Exported by 3mf-to-glb (Printproof)',
      `# units: millimeters (1 unit = ${(unitsPerMeter / MM_PER_METER).toFixed(3)} mm)`,
      `mtllib ${mtlFilename}`,
    ];
    const mtlLines: string[] = ['# Exported by 3mf-to-glb (Printproof)'];

    // OBJ face indices are 1-based and global across the whole file.
    let vertexOffset = 1;
    let normalOffset = 1;

    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();

    for (const filamentIndex of [...byFilament.keys()].sort((a, b) => a - b)) {
      const meshes = byFilament.get(filamentIndex)!;
      const materialName = `filament_${filamentIndex}`;

      mtlLines.push('', `newmtl ${materialName}`, ...materialBody(meshes[0]));

      objLines.push('', `g ${materialName}`, `usemtl ${materialName}`);

      for (const mesh of meshes) {
        const geometry = mesh.geometry;
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        const index = geometry.getIndex();
        normalMatrix.getNormalMatrix(mesh.matrixWorld);

        for (let i = 0; i < positions.count; i++) {
          position.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          objLines.push(
            `v ${fmt(position.x * unitsPerMeter, POSITION_PRECISION)} ` +
              `${fmt(position.y * unitsPerMeter, POSITION_PRECISION)} ` +
              `${fmt(position.z * unitsPerMeter, POSITION_PRECISION)}`,
          );
        }

        if (normals) {
          for (let i = 0; i < normals.count; i++) {
            normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
            objLines.push(
              `vn ${fmt(normal.x, NORMAL_PRECISION)} ` +
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
          objLines.push(normals
            ? `f ${face(a, vertexOffset, normalOffset)} ${face(b, vertexOffset, normalOffset)} ${face(c, vertexOffset, normalOffset)}`
            : `f ${a + vertexOffset} ${b + vertexOffset} ${c + vertexOffset}`);
        }

        vertexOffset += positions.count;
        if (normals) normalOffset += normals.count;
      }
    }

    return { obj: objLines.join('\n') + '\n', mtl: mtlLines.join('\n') + '\n' };
  } finally {
    // reorientCloneToYUp cloned each geometry; clone(true) shared the materials.
    exportScene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}

/** `v//vn` reference; OBJ carries no UVs here so the middle slot stays empty. */
function face(i: number, vertexOffset: number, normalOffset: number): string {
  return `${i + vertexOffset}//${i + normalOffset}`;
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
