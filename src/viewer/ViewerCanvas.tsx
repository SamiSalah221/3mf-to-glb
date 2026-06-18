import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { ColorableModel } from './ColorableModel';
import { useAppStore } from '../store/useAppStore';

// R3F's default `ACESFilmicToneMapping` desaturates brand colors (pure reds
// drift toward salmon, flat blacks lift to gray). For a color customizer the
// picked hex must be exactly what's shown, so we disable tone mapping and
// skip the studio IBL environment.

// Face-on camera placement per thin axis. The model is in meters in scene
// units, but the viewport wraps it in a display-only group so the rendered
// extent is ~DISPLAY_FRAME (=3) on the longest axis. Distance ~7 keeps the
// model in frame with some viewport margin.
const CAMERA_HOMES: Record<'x' | 'y' | 'z', { dir: [number, number, number]; up: [number, number, number] }> = {
  x: { dir: [1, 0, 0], up: [0, 1, 0] },
  y: { dir: [0, 1, 0], up: [0, 0, 1] },
  z: { dir: [0, 0, 1], up: [0, 1, 0] },
};
const CAMERA_DISTANCE = 7;
const DISPLAY_FRAME = 3;

function CameraRig({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const thinAxis = useAppStore((s) => s.thinAxis);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const dimensions = useAppStore((s) => s.dimensions);
  const bboxCenterM = useAppStore((s) => s.bboxCenterM);
  const pivotMode = useAppStore((s) => s.pivotMode);

  useEffect(() => {
    const axis = thinAxis ?? 'z';
    const home = CAMERA_HOMES[axis];

    // The wrapper group scales the meters-baked scene by DISPLAY_FRAME /
    // max-meters. The bbox center in world space is the meters value times
    // that same scale.
    let target = new THREE.Vector3(0, 0, 0);
    if (bboxCenterM && dimensions?.m) {
      const maxDim = Math.max(dimensions.m.x, dimensions.m.y, dimensions.m.z);
      const displayScale = maxDim > 0 ? DISPLAY_FRAME / maxDim : 1;
      target = new THREE.Vector3(
        bboxCenterM[0] * displayScale,
        bboxCenterM[1] * displayScale,
        bboxCenterM[2] * displayScale,
      );
    }

    camera.up.set(...home.up);
    camera.position.set(
      target.x + home.dir[0] * CAMERA_DISTANCE,
      target.y + home.dir[1] * CAMERA_DISTANCE,
      target.z + home.dir[2] * CAMERA_DISTANCE,
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
    // We deliberately depend on pivotMode so changing the export pivot
    // re-snaps the camera onto the new bbox center (the gizmo lives at the
    // origin, but rotation should still feel centered).
  }, [thinAxis, currentPlateId, camera, controlsRef, bboxCenterM, dimensions, pivotMode]);

  return null;
}

export function ViewerCanvas() {
  const selectFilament = useAppStore((s) => s.selectFilament);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 35 }}
      onPointerMissed={() => selectFilament(null)}
      gl={{
        preserveDrawingBuffer: true,
        toneMapping: THREE.NoToneMapping,
        toneMappingExposure: 1,
      }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 5, 5]} intensity={0.45} />
      <directionalLight position={[-4, 3, -2]} intensity={0.2} />
      <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={10} blur={2} />
      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.1} />
      <CameraRig controlsRef={controlsRef} />
      <ColorableModel />
    </Canvas>
  );
}
