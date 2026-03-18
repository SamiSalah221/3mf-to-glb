import * as THREE from 'three';
import type { MeshChunk, FilamentSlot } from '../types';
import { hexToLinearRGBA } from './colorConvert';

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
      side: THREE.DoubleSide,
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

  return group;
}
