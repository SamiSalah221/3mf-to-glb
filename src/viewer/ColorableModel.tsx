import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import { buildSceneFromPlate } from '../lib/glbBuilder';
import { setExportScene } from '../lib/glbExporter';
import { hexToLinearRGBA } from '../lib/colorConvert';

export function ColorableModel() {
  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const filaments = useAppStore((s) => s.filaments);
  const selectedFilamentIndex = useAppStore((s) => s.selectedFilamentIndex);
  const selectFilament = useAppStore((s) => s.selectFilament);
  const groupRef = useRef<THREE.Group>(null);

  const currentPlate = parseResult?.plates.find((p) => p.id === currentPlateId);

  // Build scene when plate changes (NOT when colors change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sceneGroup = useMemo(() => {
    if (!currentPlate) return null;
    return buildSceneFromPlate(currentPlate.meshChunks, filaments);
  }, [currentPlate]);

  // Update material colors reactively (no geometry rebuild)
  useEffect(() => {
    if (!groupRef.current) return;
    const filamentMap = new Map(filaments.map((f) => [f.index, f.currentColor]));

    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.filamentIndex) {
        const hex = filamentMap.get(child.userData.filamentIndex) || '#808080';
        const [r, g, b] = hexToLinearRGBA(hex);
        (child.material as THREE.MeshStandardMaterial).color.setRGB(r, g, b);
      }
    });
  }, [filaments]);

  // Update selection highlight
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.filamentIndex) {
        const mat = child.material as THREE.MeshStandardMaterial;
        const isSelected = child.userData.filamentIndex === selectedFilamentIndex;
        mat.emissive.setRGB(isSelected ? 0.12 : 0, isSelected ? 0.12 : 0, isSelected ? 0.12 : 0);
      }
    });
  }, [selectedFilamentIndex, sceneGroup]);

  // Register for export
  useEffect(() => {
    if (groupRef.current) setExportScene(groupRef.current);
  }, [sceneGroup]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const filIdx = (e.object as THREE.Mesh).userData.filamentIndex as number | undefined;
      if (filIdx) {
        selectFilament(selectedFilamentIndex === filIdx ? null : filIdx);
      }
    },
    [selectFilament, selectedFilamentIndex]
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
      const mesh = e.object as THREE.Mesh;
      if (mesh.userData.filamentIndex !== selectedFilamentIndex) {
        (mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0.06, 0.06, 0.06);
      }
    },
    [selectedFilamentIndex]
  );

  const handlePointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      document.body.style.cursor = 'auto';
      const mesh = e.object as THREE.Mesh;
      if (mesh.userData.filamentIndex !== selectedFilamentIndex) {
        (mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0, 0, 0);
      }
    },
    [selectedFilamentIndex]
  );

  if (!sceneGroup) return null;

  return (
    <group
      ref={groupRef}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <primitive object={sceneGroup} />
    </group>
  );
}
