import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  PerspectiveCamera,
  OrthographicCamera,
  GizmoHelper,
  GizmoViewport,
} from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { ColorableModel } from './ColorableModel';
import { useAppStore } from '../store/useAppStore';

// R3F's default `ACESFilmicToneMapping` desaturates brand colors (pure reds
// drift toward salmon, flat blacks lift to gray). For a color customizer the
// picked hex must be exactly what's shown, so we disable tone mapping and
// skip the studio IBL environment.

// Fixed front view: camera looks from -Y toward +Y with Z up. This is
// constant for every model and every rotation; users orient manually.
const CAMERA_HOME = { dir: [0, -1, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number] };
const CAMERA_DISTANCE = 7;
const DISPLAY_FRAME = 3;
const CAMERA_FOV = 35;
// Axis gizmo colors match the token axis palette (X red, Y green, Z blue).
const GIZMO_AXIS_COLORS: [string, string, string] = ['#E5484D', '#46A758', '#3E8FDD'];

/**
 * Renders the active camera as either a perspective or orthographic drei
 * camera (both `makeDefault`), so OrbitControls and CameraRig always drive
 * whichever is current. Ortho zoom is derived so the framing matches the
 * perspective view at the model target distance.
 */
function ActiveCamera() {
  const projection = useAppStore((s) => s.cameraProjection);
  const height = useThree((s) => s.size.height);

  if (projection === 'orthographic') {
    const visibleHeight = 2 * CAMERA_DISTANCE * Math.tan((CAMERA_FOV * Math.PI) / 180 / 2);
    const zoom = height > 0 ? height / visibleHeight : 100;
    return (
      <OrthographicCamera
        makeDefault
        position={[0, -CAMERA_DISTANCE, 0]}
        up={[0, 0, 1]}
        zoom={zoom}
        near={0.01}
        far={100}
      />
    );
  }

  return (
    <PerspectiveCamera
      makeDefault
      position={[0, -CAMERA_DISTANCE, 0]}
      up={[0, 0, 1]}
      fov={CAMERA_FOV}
      near={0.01}
      far={100}
    />
  );
}

function CameraRig({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const dimensions = useAppStore((s) => s.dimensions);
  const bboxCenterM = useAppStore((s) => s.bboxCenterM);
  const cameraProjection = useAppStore((s) => s.cameraProjection);
  const viewToggleSeq = useAppStore((s) => s.viewToggleSeq);
  const lastToggleSeq = useRef(viewToggleSeq);
  const lastTarget = useRef<THREE.Vector3 | null>(null);

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

    // A Model / As printed switch rebuilds the scene (new dimensions, new
    // bbox) but is a comparison: keep the user's angle and distance and only
    // follow the target, instead of re-homing.
    const controls0 = controlsRef.current;
    if (viewToggleSeq !== lastToggleSeq.current && lastTarget.current && controls0) {
      lastToggleSeq.current = viewToggleSeq;
      camera.position.add(target.clone().sub(lastTarget.current));
      controls0.target.copy(target);
      controls0.update();
      lastTarget.current = target;
      return;
    }
    lastToggleSeq.current = viewToggleSeq;
    lastTarget.current = target;

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
    // cameraProjection is a dep so a perspective/ortho toggle re-homes the
    // (newly default) camera to the correct framing. Rotations are NOT a dep,
    // so per-model orientation edits never move the camera.
    // viewToggleSeq is read, not a dep: the rebuild after a switch is what
    // runs this effect (via dimensions / bboxCenterM).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlateId, camera, controlsRef, bboxCenterM, dimensions, cameraProjection]);

  return null;
}

export function ViewerCanvas() {
  const selectFilament = useAppStore((s) => s.selectFilament);
  const dismissOrbitHint = useAppStore((s) => s.dismissOrbitHint);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <Canvas
      onPointerMissed={() => selectFilament(null)}
      onCreated={({ gl }) => {
        gl.domElement.setAttribute('role', 'img');
        gl.domElement.setAttribute(
          'aria-label',
          'Interactive 3D model preview. Drag to rotate, scroll to zoom, click a color zone to select it.',
        );
      }}
      gl={{
        preserveDrawingBuffer: true,
        toneMapping: THREE.NoToneMapping,
        toneMappingExposure: 1,
      }}
    >
      <ActiveCamera />

      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 5, 5]} intensity={0.45} />
      <directionalLight position={[-4, 3, -2]} intensity={0.2} />

      <OrbitControls
        makeDefault
        ref={controlsRef}
        enableDamping
        dampingFactor={0.1}
        onStart={dismissOrbitHint}
      />
      <CameraRig controlsRef={controlsRef} />
      <ColorableModel />

      <GizmoHelper alignment="top-right" margin={[64, 64]}>
        <GizmoViewport axisColors={GIZMO_AXIS_COLORS} labelColor="#C2CAD6" />
      </GizmoHelper>
    </Canvas>
  );
}
