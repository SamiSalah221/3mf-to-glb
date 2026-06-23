import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { BUILD_UP_AXIS, reorientCloneToYUp } from './glbBuilder.js';
import type { BuiltSceneUserData } from './glbBuilder.js';

interface GLTFWriterLike {
  json: {
    asset?: { extras?: Record<string, unknown> } & Record<string, unknown>;
  };
}

/** Asset-level extras injected on every GLB so AR runtimes can read true size. */
export interface GLBAssetExtras {
  source_unit: string;
  dimensions_mm: { x: number; y: number; z: number };
  dimensions_m: { x: number; y: number; z: number };
  bbox_min_m: [number, number, number];
  bbox_max_m: [number, number, number];
  up_axis: 'y' | 'z';
  pivot_mode: string;
  pivot_offset_m: [number, number, number];
  /**
   * User-applied rotation that was baked into vertex positions + normals.
   * Identity ([0,0,0] / [0,0,0,1]) when no rotation was applied. Recorded
   * so downstream tools can recover the orientation.
   */
  applied_rotation_euler_deg: [number, number, number];
  applied_rotation_quat: [number, number, number, number];
  generator: string;
}

/**
 * Build a binary glTF (GLB) from a THREE scene/group.
 *
 * Portable: works in both browsers and Node (three's GLTFExporter does not
 * require WebGL when called with `binary: true`). Returns the raw bytes; the
 * caller decides whether to download, write to disk, upload, etc.
 *
 * The scene is cloned and the clone is disposed after export, so the live
 * viewer scene is never mutated and no GPU resources leak.
 *
 * If the scene's userData carries BuiltSceneUserData (added by
 * buildSceneFromPlate), we inject the dimensions and source unit into
 * asset.extras so the GLB self-describes its physical size. AR consumers can
 * read this directly without re-running the bbox math.
 */
export async function buildGLBBytes(scene: THREE.Object3D): Promise<Uint8Array> {
  const exporter = new GLTFExporter();
  const exportScene = scene.clone(true);

  // Read userData before mutating the clone so sceneUd always reflects the
  // live-preview build frame (not any in-flight export transform).
  const sceneUd = scene.userData as Partial<BuiltSceneUserData>;
  const hasDimensions =
    sceneUd.dimensions &&
    sceneUd.dimensions.m &&
    sceneUd.dimensions.mm &&
    sceneUd.dimensions.bboxMinM &&
    sceneUd.dimensions.bboxMaxM;

  // Step 1: Z-up (3MF/print-bed) → Y-up (glTF/AR), clone only.
  // Gated on BUILD_UP_AXIS so flipping the constant disables the reorient
  // consistently with the pivot-flooring logic in computePivotOffset.
  if (BUILD_UP_AXIS === 'z') reorientCloneToYUp(exportScene);

  if (hasDimensions && sceneUd.sourceUnit && sceneUd.upAxis && sceneUd.pivotMode && sceneUd.pivotOffsetM) {
    const mm = sceneUd.dimensions!.mm;
    const m  = sceneUd.dimensions!.m;
    const oldMin = sceneUd.dimensions!.bboxMinM;
    const oldMax = sceneUd.dimensions!.bboxMaxM;
    const [ox, oy, oz] = sceneUd.pivotOffsetM;
    const uq = sceneUd.appliedRotationQuat ?? [0, 0, 0, 1];

    // Rx(-90°): (x,y,z) → (x,z,−y).
    const dimensions_mm = { x: mm.x, y: mm.z, z: mm.y };
    const dimensions_m  = { x: m.x,  y: m.z,  z: m.y  };
    const bbox_min_m: [number, number, number]     = [oldMin[0],  oldMin[2], -oldMax[1]];
    const bbox_max_m: [number, number, number]     = [oldMax[0],  oldMax[2], -oldMin[1]];
    const pivot_offset_m: [number, number, number] = [ox, oz, -oy];
    // Total rotation baked into export geometry = Rx(-90°) ∘ user rotation.
    const qReorient = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
    const qUser = new THREE.Quaternion(uq[0], uq[1], uq[2], uq[3]);
    const qTotal = qReorient.multiply(qUser);
    const applied_rotation_quat: [number, number, number, number] = [qTotal.x, qTotal.y, qTotal.z, qTotal.w];
    const eulerFig = new THREE.Euler().setFromQuaternion(qTotal, 'XYZ');
    const applied_rotation_euler_deg: [number, number, number] = [
      THREE.MathUtils.radToDeg(eulerFig.x),
      THREE.MathUtils.radToDeg(eulerFig.y),
      THREE.MathUtils.radToDeg(eulerFig.z),
    ];

    const extras: GLBAssetExtras = {
      source_unit: sceneUd.sourceUnit,
      dimensions_mm,
      dimensions_m,
      bbox_min_m,
      bbox_max_m,
      up_axis: 'y',
      pivot_mode: sceneUd.pivotMode,
      pivot_offset_m,
      applied_rotation_euler_deg,
      applied_rotation_quat,
      generator: '3mf-to-glb',
    };
    // GLTFExporter exposes writer.json internally but the public type omits
    // it. Cast through the lenient shape so we can inject asset.extras.
    exporter.register((writer) => {
      const w = writer as unknown as GLTFWriterLike;
      return {
        afterParse: () => {
          if (!w.json.asset) w.json.asset = {};
          w.json.asset.extras = { ...(w.json.asset.extras ?? {}), ...extras };
        },
      };
    });
  }

  try {
    const result = await exporter.parseAsync(exportScene, { binary: true });
    if (result instanceof ArrayBuffer) return new Uint8Array(result);
    throw new Error('GLTFExporter returned glTF JSON; expected GLB binary.');
  } finally {
    exportScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Browser-only convenience layer
// ---------------------------------------------------------------------------

let sceneRef: THREE.Object3D | null = null;

export function setExportScene(scene: THREE.Object3D) {
  sceneRef = scene;
}

/** Returns the live viewer scene registered by setExportScene, or null. */
export function getExportScene(): THREE.Object3D | null {
  return sceneRef;
}

export async function exportGLB(filename = 'customized-model.glb'): Promise<void> {
  if (!sceneRef) throw new Error('No scene to export');
  const bytes = await buildGLBBytes(sceneRef);
  triggerBrowserDownload(bytes, filename, 'model/gltf-binary');
}

export function triggerBrowserDownload(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new Error('triggerBrowserDownload requires a browser environment.');
  }
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
