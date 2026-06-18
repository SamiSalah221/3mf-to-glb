import * as THREE from 'three';
import type { MeshChunk, FilamentSlot, Dimensions, SourceUnit, PivotMode } from '../types/index.js';
import { hexToLinearRGBA } from './colorConvert.js';

/**
 * The up axis of the export coordinate system.
 *
 * The current pipeline emits geometry in the source 3MF's native frame,
 * which the spec defines as Z-up (the print direction). We do not yet apply
 * a Y-up rotation for glTF, so the GLB inherits Z-up. Presets are defined
 * relative to this value so swapping the up axis later only requires
 * updating this constant.
 */
export const EXPORT_UP_AXIS: 'y' | 'z' = 'z';

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
  /**
   * Which point of the model should land at (0,0,0) in the exported scene.
   * Defaults to 'base-center', which puts the model on the floor in AR.
   */
  pivotMode?: PivotMode;
  /**
   * For pivotMode='custom', a translation in millimeters applied AFTER the
   * bbox-center bake. So a custom value of (10, 0, 0) shifts the origin
   * 10 mm along +X relative to the bbox-center default.
   */
  customPivotMm?: [number, number, number];
}

export interface BuiltSceneUserData {
  /** Thinnest axis after centering, used by the viewer for face-on camera placement. */
  thinAxis: 'x' | 'y' | 'z';
  /** Conversion factor baked into the positions; mirrors the input option. */
  unitToMeters: number;
  /** Source unit declared on the 3MF root <model>. */
  sourceUnit: SourceUnit;
  /** Up axis of the exported coordinate system. Mirrors EXPORT_UP_AXIS. */
  upAxis: 'y' | 'z';
  /** AABB sizes (mm + meters) post-bake. Same on every pivot mode — only the position shifts. */
  dimensions: Dimensions;
  /** Pivot mode used to bake the positions. */
  pivotMode: PivotMode;
  /**
   * The translation, in meters, baked into vertex positions.
   * `final_position = (source_position * unitToMeters) + pivotOffsetM`.
   * This is the value surfaced on glTF asset.extras.pivot_offset_m.
   */
  pivotOffsetM: [number, number, number];
  /** Bbox center in the final exported space; OrbitControls target sits here. */
  bboxCenterM: [number, number, number];
}

/**
 * Build a viewer/export scene from a plate's mesh chunks.
 *
 * Positions are baked into meters (vertex coordinates × `unitToMeters`) and
 * translated so the chosen pivot lands at (0,0,0). The returned group has
 * identity transform so the bytes that hit GLTFExporter / USDZExporter are
 * physically accurate with no scene-graph transform to interpret.
 */
export function buildSceneFromPlate(
  meshChunks: MeshChunk[],
  filaments: FilamentSlot[],
  options: BuildSceneOptions = {},
): THREE.Group {
  const unitToMeters = options.unitToMeters ?? 0.001;
  const sourceUnit: SourceUnit = options.sourceUnit ?? 'millimeter';
  const pivotMode: PivotMode = options.pivotMode ?? 'base-center';
  const customPivotMm = options.customPivotMm ?? [0, 0, 0];

  const group = new THREE.Group();
  const filamentMap = new Map(filaments.map((f) => [f.index, f.currentColor]));

  // Bbox + (when needed) centroid in source units. One pass over the data.
  const minSrc = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maxSrc = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const centroidAccum = new THREE.Vector3();
  let totalArea = 0;
  const wantCentroid = pivotMode === 'centroid';

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
    if (wantCentroid) {
      for (let i = 0; i < p.length; i += 9) {
        const cx = (p[i] + p[i + 3] + p[i + 6]) / 3;
        const cy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
        const cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
        const ex = p[i + 3] - p[i],     ey = p[i + 4] - p[i + 1], ez = p[i + 5] - p[i + 2];
        const fx = p[i + 6] - p[i],     fy = p[i + 7] - p[i + 1], fz = p[i + 8] - p[i + 2];
        const nxv = ey * fz - ez * fy;
        const nyv = ez * fx - ex * fz;
        const nzv = ex * fy - ey * fx;
        const area = 0.5 * Math.sqrt(nxv * nxv + nyv * nyv + nzv * nzv);
        centroidAccum.x += cx * area;
        centroidAccum.y += cy * area;
        centroidAccum.z += cz * area;
        totalArea += area;
      }
    }
  }

  // Convert all the source-space values into meters before computing pivot.
  const minM = minSrc.clone().multiplyScalar(unitToMeters);
  const maxM = maxSrc.clone().multiplyScalar(unitToMeters);
  const sizeM = maxM.clone().sub(minM);
  const centerM = minM.clone().add(maxM).multiplyScalar(0.5);
  const centroidM =
    wantCentroid && totalArea > 0
      ? centroidAccum.clone().multiplyScalar(unitToMeters / totalArea)
      : centerM.clone();

  // pivotOffsetM is the translation we'll ADD to every vertex (in meters)
  // so the chosen pivot ends up at (0,0,0). final = src*u + pivotOffsetM.
  const pivotOffsetM = computePivotOffset(
    pivotMode,
    minM,
    centerM,
    centroidM,
    customPivotMm,
    EXPORT_UP_AXIS,
  );

  for (const chunk of meshChunks) {
    const baked = new Float32Array(chunk.positions.length);
    for (let i = 0; i < chunk.positions.length; i += 3) {
      baked[i]     = chunk.positions[i]     * unitToMeters + pivotOffsetM[0];
      baked[i + 1] = chunk.positions[i + 1] * unitToMeters + pivotOffsetM[1];
      baked[i + 2] = chunk.positions[i + 2] * unitToMeters + pivotOffsetM[2];
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
      // FrontSide + back-face culling: 3MF meshes are watertight CCW.
      // DoubleSide causes back faces to bleed at oblique camera angles.
      side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${chunk.name}_fil${chunk.filamentIndex}`;
    mesh.userData.filamentIndex = chunk.filamentIndex;
    mesh.userData.chunkName = chunk.name;
    group.add(mesh);
  }

  // Post-bake bbox in meters.
  const finalMin: [number, number, number] = [
    minM.x + pivotOffsetM[0],
    minM.y + pivotOffsetM[1],
    minM.z + pivotOffsetM[2],
  ];
  const finalMax: [number, number, number] = [
    maxM.x + pivotOffsetM[0],
    maxM.y + pivotOffsetM[1],
    maxM.z + pivotOffsetM[2],
  ];
  const bboxCenterM: [number, number, number] = [
    (finalMin[0] + finalMax[0]) / 2,
    (finalMin[1] + finalMax[1]) / 2,
    (finalMin[2] + finalMax[2]) / 2,
  ];

  const sizeMm = sizeM.clone().multiplyScalar(1000);

  const dimensions: Dimensions = {
    mm: { x: sizeMm.x, y: sizeMm.y, z: sizeMm.z },
    m: { x: sizeM.x, y: sizeM.y, z: sizeM.z },
    bboxMinM: finalMin,
    bboxMaxM: finalMax,
  };

  const thinAxis: 'x' | 'y' | 'z' =
    sizeM.x <= sizeM.y && sizeM.x <= sizeM.z
      ? 'x'
      : sizeM.y <= sizeM.z
        ? 'y'
        : 'z';

  const userData: BuiltSceneUserData = {
    thinAxis,
    unitToMeters,
    sourceUnit,
    upAxis: EXPORT_UP_AXIS,
    dimensions,
    pivotMode,
    pivotOffsetM: [pivotOffsetM[0], pivotOffsetM[1], pivotOffsetM[2]],
    bboxCenterM,
  };
  Object.assign(group.userData, userData);

  return group;
}

function computePivotOffset(
  mode: PivotMode,
  minM: THREE.Vector3,
  centerM: THREE.Vector3,
  centroidM: THREE.Vector3,
  customPivotMm: [number, number, number],
  upAxis: 'y' | 'z',
): [number, number, number] {
  switch (mode) {
    case 'original':
      // No translation. Vertex positions stay where the source 3MF puts them
      // (in meters). bbox will not generally be centered at origin.
      return [0, 0, 0];

    case 'bbox-center':
      return [-centerM.x, -centerM.y, -centerM.z];

    case 'centroid':
      return [-centroidM.x, -centroidM.y, -centroidM.z];

    case 'base-center': {
      // Center the two non-up axes; put the MIN of the up axis at zero so
      // the model rests on the AR floor.
      const offset: [number, number, number] = [-centerM.x, -centerM.y, -centerM.z];
      if (upAxis === 'y') offset[1] = -minM.y;
      else offset[2] = -minM.z;
      return offset;
    }

    case 'custom': {
      // Start from bbox-center, then apply the user's mm offset.
      return [
        -centerM.x + customPivotMm[0] * 0.001,
        -centerM.y + customPivotMm[1] * 0.001,
        -centerM.z + customPivotMm[2] * 0.001,
      ];
    }
  }
}
