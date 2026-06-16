import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { ColorableModel } from './ColorableModel';
import { useAppStore } from '../store/useAppStore';

// R3F's default `ACESFilmicToneMapping` desaturates brand colors (pure reds drift
// toward salmon, flat blacks lift to gray). For a color customizer the picked hex
// must be exactly what's shown, so we disable tone mapping and skip the studio IBL
// environment — both of which otherwise shift the matte-PLA look away from Bambu's.

// Face-on camera placement per thin axis. After buildSceneFromPlate auto-centers
// the model at origin and normalizes max dim to 3, placing the camera along the
// thinnest axis at distance ~7 with fov 35 gives a face-on view that fits the
// model with some viewport margin — matching Bambu Studio's preview orientation
// and hiding Z-extruded side-wall artifacts that show at oblique angles.
const CAMERA_HOMES: Record<'x' | 'y' | 'z', { pos: [number, number, number]; up: [number, number, number] }> = {
  x: { pos: [7, 0, 0], up: [0, 1, 0] },
  y: { pos: [0, 7, 0], up: [0, 0, 1] },
  z: { pos: [0, 0, 7], up: [0, 1, 0] },
};

function CameraRig({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const thinAxis = useAppStore((s) => s.thinAxis);
  const currentPlateId = useAppStore((s) => s.currentPlateId);

  useEffect(() => {
    const axis = thinAxis ?? 'z';
    const home = CAMERA_HOMES[axis];
    camera.up.set(...home.up);
    camera.position.set(...home.pos);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [thinAxis, currentPlateId, camera, controlsRef]);

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
