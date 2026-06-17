import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import { buildSceneFromPlate, type BuiltSceneUserData } from '../lib/glbBuilder';
import { setExportScene } from '../lib/glbExporter';
import { hexToLinearRGBA } from '../lib/colorConvert';

// The exported geometry is in meters, so a 100 mm cube is 0.1 in scene
// units. At the default camera distance (7), a 0.1-unit model is a speck.
// We apply a display-only scale to a wrapper group so the in-app viewport
// continues to frame the model nicely while the inner mesh stays in meters
// for export.
const DISPLAY_FRAME = 3;

export function ColorableModel() {
  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const filaments = useAppStore((s) => s.filaments);
  const selectedFilamentIndex = useAppStore((s) => s.selectedFilamentIndex);
  const selectFilament = useAppStore((s) => s.selectFilament);
  const setThinAxis = useAppStore((s) => s.setThinAxis);
  const setDimensions = useAppStore((s) => s.setDimensions);
  const wrapperRef = useRef<THREE.Group>(null);

  const currentPlate = parseResult?.plates.find((p) => p.id === currentPlateId);

  // Rebuild the scene only when the plate or unit changes. Filament colors
  // are applied reactively below so we intentionally exclude `filaments`
  // from the dependency list.
  const sceneGroup = useMemo(() => {
    if (!currentPlate || !parseResult) return null;
    return buildSceneFromPlate(currentPlate.meshChunks, filaments, {
      unitToMeters: parseResult.unitToMeters,
      sourceUnit: parseResult.sourceUnit,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlate, parseResult?.unitToMeters, parseResult?.sourceUnit]);

  const displayScale = useMemo(() => {
    if (!sceneGroup) return 1;
    const ud = sceneGroup.userData as Partial<BuiltSceneUserData>;
    const m = ud.dimensions?.m;
    if (!m) return 1;
    const maxDim = Math.max(m.x, m.y, m.z);
    return maxDim > 0 ? DISPLAY_FRAME / maxDim : 1;
  }, [sceneGroup]);

  // Publish the thin-axis hint and physical dimensions to the store on
  // every scene rebuild.
  useEffect(() => {
    if (!sceneGroup) {
      setThinAxis(null);
      setDimensions(null);
      return;
    }
    const ud = sceneGroup.userData as Partial<BuiltSceneUserData>;
    setThinAxis(ud.thinAxis ?? null);
    setDimensions(ud.dimensions ?? null);
  }, [sceneGroup, setThinAxis, setDimensions]);

  // Update material colors reactively (no geometry rebuild).
  useEffect(() => {
    if (!sceneGroup) return;
    const filamentMap = new Map(filaments.map((f) => [f.index, f.currentColor]));
    sceneGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.filamentIndex) {
        const hex = filamentMap.get(child.userData.filamentIndex) || '#808080';
        const [r, g, b] = hexToLinearRGBA(hex);
        (child.material as THREE.MeshStandardMaterial).color.setRGB(r, g, b);
      }
    });
  }, [filaments, sceneGroup]);

  // Update selection highlight.
  useEffect(() => {
    if (!sceneGroup) return;
    sceneGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.filamentIndex) {
        const mat = child.material as THREE.MeshStandardMaterial;
        const isSelected = child.userData.filamentIndex === selectedFilamentIndex;
        mat.emissive.setRGB(isSelected ? 0.12 : 0, isSelected ? 0.12 : 0, isSelected ? 0.12 : 0);
      }
    });
  }, [selectedFilamentIndex, sceneGroup]);

  // Register the INNER (meters-baked, identity-transform) scene for export.
  // The wrapper group only carries display scale; we don't want that scale
  // smuggled into the GLB.
  useEffect(() => {
    if (sceneGroup) setExportScene(sceneGroup);
  }, [sceneGroup]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const filIdx = (e.object as THREE.Mesh).userData.filamentIndex as number | undefined;
      if (filIdx) {
        selectFilament(selectedFilamentIndex === filIdx ? null : filIdx);
      }
    },
    [selectFilament, selectedFilamentIndex],
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
    [selectedFilamentIndex],
  );

  const handlePointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      document.body.style.cursor = 'auto';
      const mesh = e.object as THREE.Mesh;
      if (mesh.userData.filamentIndex !== selectedFilamentIndex) {
        (mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0, 0, 0);
      }
    },
    [selectedFilamentIndex],
  );

  if (!sceneGroup) return null;

  return (
    <group
      ref={wrapperRef}
      scale={displayScale}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <primitive object={sceneGroup} />
    </group>
  );
}
