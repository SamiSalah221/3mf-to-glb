import * as THREE from 'three';
import type { MeshChunk, FilamentSlot } from '../types/index.js';
import { hexToLinearRGBA } from './colorConvert.js';

export function buildSceneFromPlate(
  meshChunks: MeshChunk[],
  filaments: FilamentSlot[],
): THREE.Group {
  const group = new THREE.Group();
  const filamentMap = new Map(filaments.map((f) => [f.index, f.currentColor]));

  for (const chunk of meshChunks) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3));
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

  // Center and scale
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 3 / maxDim : 1;

  group.position.sub(center.multiplyScalar(scale));
  group.scale.setScalar(scale);

  // Stash the pre-normalized thinnest-axis hint for the viewer's camera
  // placement. For flat 3D-printed parts this is the print-flat direction
  // (typically Z), and viewing down it gives a face-on preview.
  const thinAxis: 'x' | 'y' | 'z' =
    size.x <= size.y && size.x <= size.z ? 'x' :
    size.y <= size.z ? 'y' : 'z';
  group.userData.thinAxis = thinAxis;

  return group;
}
