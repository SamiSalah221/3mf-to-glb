import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
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
// Length of the axis gizmo at the export pivot, as a fraction of the max
// model dimension in meters. 1/6 lands a clearly visible but not
// overwhelming gizmo for typical prints.
const GIZMO_FRACTION = 1 / 6;
// Build-plate footprint in meters. No bed size exists in the 3MF parse output,
// so this is a cosmetic reference bed (~standard 250 mm). Snapped up to a
// 50 mm multiple so the 10 mm / 50 mm grid lines stay exact and nest cleanly.
const BED_MIN_M = 0.25;
const GRID_CELL_M = 0.01; // 10 mm fine cells
const GRID_SECTION_M = 0.05; // 50 mm coarse cells
// Grid line colors, tuned to read over the viewport's neutral Cool Slate
// gradient (there is no opaque plate mesh anymore, so the grid floats over
// it directly). Kept low-chroma to match the neutral studio backdrop.
const GRID_COLOR_FINE = '#24262B';
const GRID_COLOR_COARSE = '#3A3D44';

export function ColorableModel() {
  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const filaments = useAppStore((s) => s.filaments);
  const selectedFilamentIndex = useAppStore((s) => s.selectedFilamentIndex);
  const selectFilament = useAppStore((s) => s.selectFilament);
  const setThinAxis = useAppStore((s) => s.setThinAxis);
  const setDimensions = useAppStore((s) => s.setDimensions);
  const setBboxCenterM = useAppStore((s) => s.setBboxCenterM);
  const pivotMode = useAppStore((s) => s.pivotMode);
  const customPivotMm = useAppStore((s) => s.customPivotMm);
  const rotationQuat = useAppStore((s) => s.rotationQuat);

  const wrapperRef = useRef<THREE.Group>(null);

  const currentPlate = parseResult?.plates.find((p) => p.id === currentPlateId);

  // Rebuild the scene when the plate, unit, pivot, OR rotation changes.
  // All four bake into vertex positions, so they cannot be applied
  // reactively without rebuilding the BufferGeometry.
  const sceneGroup = useMemo(() => {
    if (!currentPlate || !parseResult) return null;
    return buildSceneFromPlate(currentPlate.meshChunks, filaments, {
      unitToMeters: parseResult.unitToMeters,
      sourceUnit: parseResult.sourceUnit,
      pivotMode,
      customPivotMm,
      rotationQuat,
    });
    // filaments are applied reactively further down; excluding them here is
    // intentional to avoid rebuilding geometry on every color edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPlate,
    parseResult?.unitToMeters,
    parseResult?.sourceUnit,
    pivotMode,
    customPivotMm,
    rotationQuat,
  ]);

  const displayScale = useMemo(() => {
    if (!sceneGroup) return 1;
    const ud = sceneGroup.userData as Partial<BuiltSceneUserData>;
    const m = ud.dimensions?.m;
    if (!m) return 1;
    const maxDim = Math.max(m.x, m.y, m.z);
    return maxDim > 0 ? DISPLAY_FRAME / maxDim : 1;
  }, [sceneGroup]);

  const gizmoSize = useMemo(() => {
    if (!sceneGroup) return 0;
    const m = (sceneGroup.userData as Partial<BuiltSceneUserData>).dimensions?.m;
    if (!m) return 0;
    return Math.max(m.x, m.y, m.z) * GIZMO_FRACTION;
  }, [sceneGroup]);

  const bedPlacement = useMemo(() => {
    if (!sceneGroup) return null;
    const ud = sceneGroup.userData as Partial<BuiltSceneUserData>;
    const m = ud.dimensions?.m;
    const bboxMinM = ud.dimensions?.bboxMinM;
    const center = ud.bboxCenterM;
    if (!m || !bboxMinM || !center) return null;
    const footprint = Math.max(m.x, m.y);
    // Reference bed, at least BED_MIN_M and 1.2x the footprint so oversized
    // models still land on a plate; snapped up to a 50 mm multiple so the
    // grid divisions come out whole and nested.
    const rawBed = Math.max(BED_MIN_M, footprint * 1.2);
    const bedSize = Math.ceil(rawBed / GRID_SECTION_M) * GRID_SECTION_M;
    const fineDivisions = Math.round(bedSize / GRID_CELL_M);
    const coarseDivisions = Math.round(bedSize / GRID_SECTION_M);
    const eps = Math.max(m.z, footprint) * 0.002;
    return {
      cx: center[0],
      cy: center[1],
      z: bboxMinM[2] - eps,
      bedSize,
      fineDivisions,
      coarseDivisions,
      footprint,
      modelHeight: m.z,
    };
  }, [sceneGroup]);

  // Publish thin-axis, dimensions, and bbox center to the store on each
  // scene rebuild. The bbox center is used by ViewerCanvas to keep
  // OrbitControls feeling centered around the model body, regardless of
  // which export pivot the user picked.
  useEffect(() => {
    if (!sceneGroup) {
      setThinAxis(null);
      setDimensions(null);
      setBboxCenterM(null);
      return;
    }
    const ud = sceneGroup.userData as Partial<BuiltSceneUserData>;
    setThinAxis(ud.thinAxis ?? null);
    setDimensions(ud.dimensions ?? null);
    setBboxCenterM(ud.bboxCenterM ?? null);
  }, [sceneGroup, setThinAxis, setDimensions, setBboxCenterM]);

  // Reactive recolor (no geometry rebuild).
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

  // Register the inner meters-baked scene for export. The wrapper carries
  // only the cosmetic displayScale and must NOT leak into the GLB.
  useEffect(() => {
    if (sceneGroup) setExportScene(sceneGroup);
  }, [sceneGroup]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      let mesh = e.object as THREE.Mesh;
      // Bead meshes (G-code) raycast against their bounding box for cheap
      // hover, and on a multi-tool print those boxes overlap, so the hit is
      // the first box the ray enters, not the bead under the cursor. One
      // exact triangle pass per click settles it; per pointer move it would
      // stall, per click it is a few hundred ms at most.
      if (mesh.userData.weldOnExport && sceneGroup) {
        const hits: THREE.Intersection[] = [];
        const raycaster = new THREE.Raycaster();
        raycaster.ray.copy(e.ray);
        sceneGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.weldOnExport) {
            THREE.Mesh.prototype.raycast.call(child, raycaster, hits);
          }
        });
        if (!hits.length) return;
        hits.sort((a, b) => a.distance - b.distance);
        mesh = hits[0].object as THREE.Mesh;
      }
      const filIdx = mesh.userData.filamentIndex as number | undefined;
      if (filIdx) {
        selectFilament(selectedFilamentIndex === filIdx ? null : filIdx);
      }
    },
    [selectFilament, selectedFilamentIndex, sceneGroup],
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const mesh = e.object as THREE.Mesh;
      // Ignore decorations (plate, grid, shadow): only painted chunks carry a
      // filamentIndex and a MeshStandardMaterial with an emissive channel.
      if (!mesh.userData.filamentIndex) return;
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
      if (mesh.userData.filamentIndex !== selectedFilamentIndex) {
        (mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0.06, 0.06, 0.06);
      }
    },
    [selectedFilamentIndex],
  );

  const handlePointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const mesh = e.object as THREE.Mesh;
      if (!mesh.userData.filamentIndex) return;
      document.body.style.cursor = 'auto';
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
      {bedPlacement && (
        <>
          {/* Measured grid: two GridHelpers (10 mm faint + 50 mm brighter),
              rotated from their native XZ plane into XY so they lie on the
              plate. GridHelper is dead-cheap line geometry, so it scales
              cleanly with the wrapper group (no world-space shader fade to
              fight the display scale). */}
          <gridHelper
            args={[
              bedPlacement.bedSize,
              bedPlacement.fineDivisions,
              GRID_COLOR_FINE,
              GRID_COLOR_FINE,
            ]}
            rotation={[Math.PI / 2, 0, 0]}
            position={[bedPlacement.cx, bedPlacement.cy, bedPlacement.z + 0.0005]}
            raycast={() => null}
          />
          <gridHelper
            args={[
              bedPlacement.bedSize,
              bedPlacement.coarseDivisions,
              GRID_COLOR_COARSE,
              GRID_COLOR_COARSE,
            ]}
            rotation={[Math.PI / 2, 0, 0]}
            position={[bedPlacement.cx, bedPlacement.cy, bedPlacement.z + 0.0006]}
            raycast={() => null}
          />

          {/* Contact shadow. ContactShadows is XZ / Y-up native, so rotate it
              into the XY plane with its capture pointing up +Z. Baked once
              (frames={1}); re-keyed on plate + orientation so it refreshes
              when geometry changes (color edits don't need a re-bake). */}
          <group
            key={`${currentPlateId ?? 'none'}-${rotationQuat.join(',')}`}
            position={[bedPlacement.cx, bedPlacement.cy, bedPlacement.z + 0.0002]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <ContactShadows
              opacity={0.35}
              blur={2.5}
              resolution={512}
              scale={bedPlacement.footprint * 1.5}
              far={bedPlacement.modelHeight}
              frames={1}
              color="#000000"
            />
          </group>
        </>
      )}
      {/* Gizmo at the export pivot (local origin of the scene group). The
          wrapper's scale applies, so the gizmo grows / shrinks with the
          model and remains visually proportional. */}
      {gizmoSize > 0 && <axesHelper args={[gizmoSize]} />}
    </group>
  );
}
