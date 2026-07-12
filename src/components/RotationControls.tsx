import { useMemo } from 'react';
import * as THREE from 'three';
import type { RotationQuat } from '../types';
import { useAppStore } from '../store/useAppStore';

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];

const AXIS_VECTORS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

// Literal class names so Tailwind v4 emits the axis-color utilities.
const AXIS_DOT: Record<Axis, string> = {
  x: 'bg-axis-x',
  y: 'bg-axis-y',
  z: 'bg-axis-z',
};

const RAD_PER_DEG = Math.PI / 180;

function quatToEulerDeg(q: RotationQuat): [number, number, number] {
  const quat = new THREE.Quaternion(q[0], q[1], q[2], q[3]).normalize();
  const e = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  return [
    THREE.MathUtils.radToDeg(e.x),
    THREE.MathUtils.radToDeg(e.y),
    THREE.MathUtils.radToDeg(e.z),
  ];
}

function eulerDegToQuat(x: number, y: number, z: number): RotationQuat {
  const e = new THREE.Euler(x * RAD_PER_DEG, y * RAD_PER_DEG, z * RAD_PER_DEG, 'XYZ');
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

function applyWorldSnap(current: RotationQuat, axis: Axis, deltaDeg: number): RotationQuat {
  const delta = new THREE.Quaternion().setFromAxisAngle(AXIS_VECTORS[axis], deltaDeg * RAD_PER_DEG);
  const curr = new THREE.Quaternion(current[0], current[1], current[2], current[3]);
  const next = delta.multiply(curr).normalize();
  return [next.x, next.y, next.z, next.w];
}

export function RotationControls() {
  const rotationQuat = useAppStore((s) => s.rotationQuat);
  const setRotationQuat = useAppStore((s) => s.setRotationQuat);
  const resetRotation = useAppStore((s) => s.resetRotation);

  const eulerDeg = useMemo(() => quatToEulerDeg(rotationQuat), [rotationQuat]);

  const handleSnap = (axis: Axis, delta: number) => {
    setRotationQuat(applyWorldSnap(rotationQuat, axis, delta));
  };

  const handleEulerEdit = (axis: Axis, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const next: [number, number, number] = [...eulerDeg];
    next[AXES.indexOf(axis)] = v;
    setRotationQuat(eulerDegToQuat(next[0], next[1], next[2]));
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-tx2 text-xs font-semibold tracking-[0.02em]">Orientation</span>
        <button
          type="button"
          onClick={resetRotation}
          className="text-tx3 hover:text-tx transition-colors"
          title="Return the model to the orientation it was imported in."
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {AXES.map((axis) => (
          <div key={axis} className="flex flex-col gap-1">
            <span className="flex items-center justify-center gap-1.5 text-tx3 text-center uppercase">
              <span className={`w-1.5 h-1.5 rounded-full ${AXIS_DOT[axis]}`} aria-hidden="true" />
              {axis}
            </span>
            <div className="flex border border-line rounded-md overflow-hidden divide-x divide-line">
              <button
                type="button"
                onClick={() => handleSnap(axis, -90)}
                className="flex-1 py-2 bg-panel2 hover:bg-panel3 text-tx2 font-mono transition-colors"
                title={`Rotate -90 degrees about world ${axis.toUpperCase()}.`}
              >
                -90
              </button>
              <button
                type="button"
                onClick={() => handleSnap(axis, 90)}
                className="flex-1 py-2 bg-panel2 hover:bg-panel3 text-tx2 font-mono transition-colors"
                title={`Rotate +90 degrees about world ${axis.toUpperCase()}.`}
              >
                +90
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1">
        {AXES.map((axis, i) => (
          <label key={axis} className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-tx3">
              <span className={`w-1.5 h-1.5 rounded-full ${AXIS_DOT[axis]}`} aria-hidden="true" />
              {axis.toUpperCase()} (deg)
            </span>
            <input
              type="number"
              step="1"
              value={Number(eulerDeg[i].toFixed(2))}
              onChange={(e) => handleEulerEdit(axis, e.target.value)}
              className="bg-panel2 border border-line rounded-md px-2 py-1.5 text-tx2 font-mono focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
