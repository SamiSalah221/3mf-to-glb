import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Build a binary glTF (GLB) from a THREE scene/group.
 *
 * Portable: works in both browsers and Node (three's GLTFExporter does not
 * require WebGL when called with `binary: true`). Returns the raw bytes; the
 * caller decides whether to download, write to disk, upload, etc.
 *
 * The scene is cloned and the clone is disposed after export, so the live
 * viewer scene is never mutated and no GPU resources leak.
 */
export async function buildGLBBytes(scene: THREE.Object3D): Promise<Uint8Array> {
  const exporter = new GLTFExporter();
  const exportScene = scene.clone(true);
  try {
    const result = await exporter.parseAsync(exportScene, { binary: true });
    if (result instanceof ArrayBuffer) return new Uint8Array(result);
    // GLTFExporter only returns a JSON object when binary is false. If we got
    // one here, the caller's three runtime is mis-configured.
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
//
// The viewer registers its current THREE.Group via setExportScene() on mount
// so the export button can call exportGLB() without prop-drilling the scene.
// ---------------------------------------------------------------------------

let sceneRef: THREE.Object3D | null = null;

export function setExportScene(scene: THREE.Object3D) {
  sceneRef = scene;
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
