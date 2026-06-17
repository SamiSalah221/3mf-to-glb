import * as THREE from 'three';
import type { MeshChunk, FilamentSlot, Dimensions, SourceUnit } from '../types/index.js';
import { hexToLinearRGBA } from './colorConvert.js';

export interface BuildSceneOptions {
  /**
   * Meters-per-unit conversion factor for the source 3MF coordinates.
   * Defaults to 0.001 (millimeter). The factor is baked into the emitted
   * vertex positions so the resulting GLB is self-contained and in meters,
   * which is what Apple Quick Look, Scene Viewer, model-viewer, and glTF
   * consumers in general assume.
   */
  unitToMeters?: number;
  /** Source unit string for downstream metadata (e.g. asset.extras.source_unit). */
  sourceUnit?: SourceUnit;
}

export interface BuiltSceneUserData {
  /** Thinnest axis after centering, used by the viewer for face-on camera placement. */
  thinAxis: 'x' | 'y' | 'z';
  /** Conversion factor baked into the positions; mirrors the input option. */
  unitToMeters: number;
  /** Source unit declared on the 3MF root <model>. */
  sourceUnit: SourceUnit;
  /** AABB in real-world units, after the unit-to-meters bake and origin recenter. */
  dimensions: Dimensions;
}

/**
 * Build a viewer/export scene from a plate's mesh chunks.
 *
 * Positions are baked into meters (vertex coordinates × `unitToMeters`) and
 * recentred at the bounding-box origin. The returned group has identity
 * transform, so the bytes that hit the GLB exporter are physically accurate
 * with no scene-graph scale to interpret. The web viewport can apply its own
 * cosmetic display scale to fit the camera frame.
 */
export function buildSceneFromPlate(
  meshChunks: MeshChunk[],
  filaments: FilamentSlot[],
  options: BuildSceneOptions = {},
): THREE.Group {
  const unitToMeters = options.unitToMeters ?? 0.001;
  const sourceUnit: SourceUnit = options.sourceUnit ?? 'millimeter';

  const group = new THREE.Group();
  const filamentMap = new Map(filaments.map((f) => [f.index, f.currentColor]));

  // Compute bbox in source units first (one pass over the input data), so the
  // recenter offset can be applied during the position bake without a second
  // scene traversal.
  const minSrc = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maxSrc = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const chunk of meshChunks) {
    const p = chunk.positions;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < minSrc.x) minSrc.x = p[i];
      if (p[i + 1] < minSrc.y) minSrc.y = p[i + 1];
      if (p[i + 2] < minSrc.z) minSrc.z = p[i + 2];
      if (p[i] > maxSrc.x) maxSrc.x = p[i];
      if (p[i + 1] > maxSrc.y) maxSrc.y = p[i + 1];
      if (p[i + 2] > maxSrc.z) maxSrc.z = p[i + 2];
    }
  }
  const sizeSrc = new THREE.Vector3().subVectors(maxSrc, minSrc);
  const centerSrc = new THREE.Vector3()
    .addVectors(minSrc, maxSrc)
    .multiplyScalar(0.5);

  for (const chunk of meshChunks) {
    const baked = new Float32Array(chunk.positions.length);
    for (let i = 0; i < chunk.positions.length; i += 3) {
      baked[i] = (chunk.positions[i] - centerSrc.x) * unitToMeters;
      baked[i + 1] = (chunk.positions[i + 1] - centerSrc.y) * unitToMeters;
      baked[i + 2] = (chunk.positions[i + 2] - centerSrc.z) * unitToMeters;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(baked, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(chunk.normals, 3));

    const colorHex = filamentMap.get(chunk.filamentIndex) || '#808080';
    const [r, g, b] = hexToLinearRGBA(colorHex);

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(r, g, b),
      metalness: 0,
      roughness: 0.8,
      // FrontSide + back-face culling: 3MF meshes are prepared for 3D printing
      // (watertight, CCW winding), so the interior should never be visible.
      // DoubleSide caused painted-region back faces to bleed through at oblique
      // camera angles — see docs/ARCHITECTURE.md for the diagnostic story.
      side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${chunk.name}_fil${chunk.filamentIndex}`;
    mesh.userData.filamentIndex = chunk.filamentIndex;
    mesh.userData.chunkName = chunk.name;
    group.add(mesh);
  }

  // Sizes in real-world units. dimensions.m is what AR runtimes show; mm is
  // the meaningful unit for a 3D-print readout in the UI.
  const sizeM = sizeSrc.clone().multiplyScalar(unitToMeters);
  const sizeMm = sizeM.clone().multiplyScalar(1000);
  const halfM = sizeM.clone().multiplyScalar(0.5);

  const thinAxis: 'x' | 'y' | 'z' =
    sizeM.x <= sizeM.y && sizeM.x <= sizeM.z
      ? 'x'
      : sizeM.y <= sizeM.z
        ? 'y'
        : 'z';

  const dimensions: Dimensions = {
    mm: { x: sizeMm.x, y: sizeMm.y, z: sizeMm.z },
    m: { x: sizeM.x, y: sizeM.y, z: sizeM.z },
    bboxMinM: [-halfM.x, -halfM.y, -halfM.z],
    bboxMaxM: [halfM.x, halfM.y, halfM.z],
  };

  const userData: BuiltSceneUserData = {
    thinAxis,
    unitToMeters,
    sourceUnit,
    dimensions,
  };
  Object.assign(group.userData, userData);

  return group;
}
