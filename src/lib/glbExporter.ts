import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

let sceneRef: THREE.Group | null = null;

export function setExportScene(scene: THREE.Group) {
  sceneRef = scene;
}

export async function exportGLB(): Promise<void> {
  if (!sceneRef) throw new Error('No scene to export');

  const exporter = new GLTFExporter();
  const exportScene = sceneRef.clone(true);

  const result = await exporter.parseAsync(exportScene, { binary: true });

  const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'customized-model.glb';
  a.click();
  URL.revokeObjectURL(url);

  exportScene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
    }
  });
}
