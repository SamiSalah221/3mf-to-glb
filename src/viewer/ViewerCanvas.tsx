import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { ColorableModel } from './ColorableModel';
import { useAppStore } from '../store/useAppStore';

// R3F's default `ACESFilmicToneMapping` desaturates brand colors (pure reds
// drift toward salmon, flat blacks lift to gray). For a color customizer the
// picked hex must be exactly what's shown, so we disable tone mapping and
// skip the studio IBL environment.

// Fixed front view: camera looks from −Y toward +Y with Z up. This is
// constant for every model and every rotation — users orient manually.
const CAMERA_HOME = { dir: [0, -1, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number] };
const CAMERA_DISTANCE = 7;
const DISPLAY_FRAME = 3;

function CameraRig({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const dimensions = useAppStore((s) => s.dimensions);
  const bboxCenterM = useAppStore((s) => s.bboxCenterM);

  useEffect(() => {
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

    camera.up.set(...CAMERA_HOME.up);
    camera.position.set(
      target.x + CAMERA_HOME.dir[0] * CAMERA_DISTANCE,
      target.y + CAMERA_HOME.dir[1] * CAMERA_DISTANCE,
      target.z + CAMERA_HOME.dir[2] * CAMERA_DISTANCE,
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
  }, [currentPlateId, camera, controlsRef, bboxCenterM, dimensions]);

  return null;
}

export function ViewerCanvas() {
  const selectFilament = useAppStore((s) => s.selectFilament);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <Canvas
      camera={{ position: [0, -7, 0], fov: 35, up: [0, 0, 1] }}
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

      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.1} />
      <CameraRig controlsRef={controlsRef} />
      <ColorableModel />
    </Canvas>
  );
}
