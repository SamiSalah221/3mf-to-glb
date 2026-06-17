import * as THREE from 'three';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

/**
 * Build a USDZ archive from a THREE scene/group.
 *
 * USDZ is the format Apple's Quick Look requires for in-page AR previews on
 * iOS Safari. Three.js ships a pure-JS exporter that uses fflate to zip the
 * .usda + textures, so this runs entirely client-side.
 *
 * The scene is cloned because the exporter mutates material sides; the clone
 * is disposed before returning so no GPU resources leak.
 */
export async function buildUSDZBytes(scene: THREE.Object3D): Promise<Uint8Array> {
  const exporter = new USDZExporter();
  const exportScene = scene.clone(true);
  try {
    // quickLookCompatible: enables flags Quick Look needs to render PBR
    // materials with the matte-PLA look the rest of the pipeline produces.
    const result = await exporter.parseAsync(exportScene, { quickLookCompatible: true });
    // Three's typings say ArrayBuffer, but at runtime parseAsync returns a
    // Uint8Array (fflate's zipSync output). Handle both for safety.
    if (result instanceof Uint8Array) return new Uint8Array(result);
    return new Uint8Array(result as ArrayBuffer);
  } finally {
    exportScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
  }
}
