import * as THREE from 'three';
import type {
  MeshChunk,
  FilamentSlot,
  Dimensions,
  SourceUnit,
  PivotMode,
  RotationQuat,
} from '../types/index.js';
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
  /**
   * Optional user orientation as a unit quaternion [x, y, z, w]. Identity
   * (`[0, 0, 0, 1]`) leaves geometry untouched.
   *
   * Order of operations is load-bearing and MUST be: scale to meters →
   * rotate → recompute AABB → pivot translation. If pivot is computed
   * before rotation the model floats or sinks in AR. The rotation is
   * baked into positions AND normals so the exported GLB carries an
   * identity node transform and is self-contained.
   */
  rotationQuat?: RotationQuat;
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
   * `final_position = quat * (source_position * unitToMeters) + pivotOffsetM`.
   * This is the value surfaced on glTF asset.extras.pivot_offset_m.
   */
  pivotOffsetM: [number, number, number];
  /** Bbox center in the final exported space; OrbitControls target sits here. */
  bboxCenterM: [number, number, number];
  /**
   * Rotation that was baked into positions + normals. Identity if the user
   * never rotated. Mirrored to glTF asset.extras so AR consumers can read
   * what orientation was applied.
   */
  appliedRotationQuat: RotationQuat;
  /** Same rotation expressed as XYZ Euler degrees for human-readable metadata. */
  appliedRotationEulerDeg: [number, number, number];
}

/**
 * Reorient the geometry inside an already-cloned export scene from the native
 * Z-up frame (3MF / print bed convention) to the Y-up frame required by
 * glTF, USDZ, and all AR runtimes (iOS Quick Look, Android Scene Viewer,
 * model-viewer / WebXR).
 *
 * Call this on the `scene.clone(true)` BEFORE serialising — never on the live
 * preview group. The function clones each mesh's BufferGeometry so that
 * `applyMatrix4` and the export's `finally` disposal cannot touch the shared
 * live-preview buffers.
 *
 * Rotation applied: −90° about X  →  (x, y, z) → (x, z, −y)
 * This maps the print-bed Z+ axis onto the glTF Y+ ("up") axis.
 */
export function reorientCloneToYUp(clone: THREE.Object3D): void {
  const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry = child.geometry.clone();
      child.geometry.applyMatrix4(m);
    }
  });
}

/**
 * Build a viewer/export scene from a plate's mesh chunks.
 *
 * Positions are baked into meters (vertex coordinates × `unitToMeters`) and
 * translated so the chosen pivot lands at (0,0,0). The returned group has
 * identity transform so the bytes that hit GLTFExporter / USDZExporter are
 * physically accurate with no scene-graph transform to interpret.
 */
const IDENTITY_QUAT: RotationQuat = [0, 0, 0, 1];

function isIdentityQuat(q: RotationQuat): boolean {
  // Tolerate tiny floating drift from accumulating snaps.
  return (
    Math.abs(q[0]) < 1e-9 &&
    Math.abs(q[1]) < 1e-9 &&
    Math.abs(q[2]) < 1e-9 &&
    Math.abs(q[3] - 1) < 1e-9
  );
}

export function buildSceneFromPlate(
  meshChunks: MeshChunk[],
  filaments: FilamentSlot[],
  options: BuildSceneOptions = {},
): THREE.Group {
  const unitToMeters = options.unitToMeters ?? 0.001;
  const sourceUnit: SourceUnit = options.sourceUnit ?? 'millimeter';
  const pivotMode: PivotMode = options.pivotMode ?? 'base-center';
  const customPivotMm = options.customPivotMm ?? [0, 0, 0];
  const rotationInput = options.rotationQuat ?? IDENTITY_QUAT;

  // Normalize the quaternion once. Accumulated snap rotations can drift; a
  // non-unit quaternion silently scales the geometry.
  const quat = new THREE.Quaternion(
    rotationInput[0],
    rotationInput[1],
    rotationInput[2],
    rotationInput[3],
  ).normalize();
  const hasRotation = !isIdentityQuat([quat.x, quat.y, quat.z, quat.w]);

  const group = new THREE.Group();
  const filamentMap = new Map(filaments.map((f) => [f.index, f.currentColor]));

  // Pass 1: bake each chunk's positions into (rotated, meters) space and
  // accumulate AABB + (optional) centroid in THAT space. Pivot must be
  // computed from the rotated bbox, so we cannot do this in source units.
  const wantCentroid = pivotMode === 'centroid';
  const bakedPositionsPerChunk: Float32Array[] = new Array(meshChunks.length);

  const minR = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maxR = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const centroidAccum = new THREE.Vector3();
  let totalArea = 0;
  const tmp = new THREE.Vector3();

  for (let c = 0; c < meshChunks.length; c++) {
    const chunk = meshChunks[c];
    const src = chunk.positions;
    const baked = new Float32Array(src.length);

    for (let i = 0; i < src.length; i += 3) {
      tmp.set(src[i] * unitToMeters, src[i + 1] * unitToMeters, src[i + 2] * unitToMeters);
      if (hasRotation) tmp.applyQuaternion(quat);
      baked[i] = tmp.x;
      baked[i + 1] = tmp.y;
      baked[i + 2] = tmp.z;
      if (tmp.x < minR.x) minR.x = tmp.x;
      if (tmp.y < minR.y) minR.y = tmp.y;
      if (tmp.z < minR.z) minR.z = tmp.z;
      if (tmp.x > maxR.x) maxR.x = tmp.x;
      if (tmp.y > maxR.y) maxR.y = tmp.y;
      if (tmp.z > maxR.z) maxR.z = tmp.z;
    }

    if (wantCentroid) {
      for (let i = 0; i < baked.length; i += 9) {
        const cx = (baked[i] + baked[i + 3] + baked[i + 6]) / 3;
        const cy = (baked[i + 1] + baked[i + 4] + baked[i + 7]) / 3;
        const cz = (baked[i + 2] + baked[i + 5] + baked[i + 8]) / 3;
        const ex = baked[i + 3] - baked[i];
        const ey = baked[i + 4] - baked[i + 1];
        const ez = baked[i + 5] - baked[i + 2];
        const fx = baked[i + 6] - baked[i];
        const fy = baked[i + 7] - baked[i + 1];
        const fz = baked[i + 8] - baked[i + 2];
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

    bakedPositionsPerChunk[c] = baked;
  }

  const sizeM = maxR.clone().sub(minR);
  const centerM = minR.clone().add(maxR).multiplyScalar(0.5);
  const centroidM =
    wantCentroid && totalArea > 0
      ? centroidAccum.clone().multiplyScalar(1 / totalArea)
      : centerM.clone();

  // pivotOffsetM is the translation we'll ADD to every (rotated) vertex
  // (in meters) so the chosen pivot ends up at (0,0,0).
  // final = quat * (src * u) + pivotOffsetM.
  const pivotOffsetM = computePivotOffset(
    pivotMode,
    minR,
    centerM,
    centroidM,
    customPivotMm,
    EXPORT_UP_AXIS,
  );

  // Pass 2: emit geometry. Apply pivot offset to cached positions and
  // rotate the (already-unit-length) normals by the same quaternion so
  // shading and downstream PBR consumers stay correct.
  const tmpN = new THREE.Vector3();
  for (let c = 0; c < meshChunks.length; c++) {
    const chunk = meshChunks[c];
    const positions = bakedPositionsPerChunk[c];

    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += pivotOffsetM[0];
      positions[i + 1] += pivotOffsetM[1];
      positions[i + 2] += pivotOffsetM[2];
    }

    let normals: Float32Array;
    if (hasRotation) {
      normals = new Float32Array(chunk.normals.length);
      for (let i = 0; i < chunk.normals.length; i += 3) {
        tmpN.set(chunk.normals[i], chunk.normals[i + 1], chunk.normals[i + 2]);
        tmpN.applyQuaternion(quat);
        normals[i] = tmpN.x;
        normals[i + 1] = tmpN.y;
        normals[i + 2] = tmpN.z;
      }
    } else {
      normals = chunk.normals;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

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
    minR.x + pivotOffsetM[0],
    minR.y + pivotOffsetM[1],
    minR.z + pivotOffsetM[2],
  ];
  const finalMax: [number, number, number] = [
    maxR.x + pivotOffsetM[0],
    maxR.y + pivotOffsetM[1],
    maxR.z + pivotOffsetM[2],
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

  const appliedRotationQuat: RotationQuat = [quat.x, quat.y, quat.z, quat.w];
  const eulerRad = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  const appliedRotationEulerDeg: [number, number, number] = [
    THREE.MathUtils.radToDeg(eulerRad.x),
    THREE.MathUtils.radToDeg(eulerRad.y),
    THREE.MathUtils.radToDeg(eulerRad.z),
  ];

  const userData: BuiltSceneUserData = {
    thinAxis,
    unitToMeters,
    sourceUnit,
    upAxis: EXPORT_UP_AXIS,
    dimensions,
    pivotMode,
    pivotOffsetM: [pivotOffsetM[0], pivotOffsetM[1], pivotOffsetM[2]],
    bboxCenterM,
    appliedRotationQuat,
    appliedRotationEulerDeg,
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
