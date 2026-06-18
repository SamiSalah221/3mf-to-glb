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

/**
 * Pre-multiply (world-space) a quaternion by a 90° rotation about a world
 * axis. World-space premultiply means the snap is around the global X/Y/Z
 * even after prior rotations, which is what users expect from "rotate +90 X".
 */
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
  const setPivotMode = useAppStore((s) => s.setPivotMode);

  // Re-derive the readout whenever the source-of-truth quaternion changes.
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
        <span className="text-slate-400 font-semibold uppercase tracking-wider">
          Orientation
        </span>
        <button
          type="button"
          onClick={resetRotation}
          className="text-slate-400 hover:text-slate-200 underline decoration-dotted"
          title="Return the model to the orientation it was imported in."
        >
          reset
        </button>
      </div>

      {/* Snap buttons: world-space ±90 around each axis. Accumulate. */}
      <div className="grid grid-cols-3 gap-1.5">
        {AXES.map((axis) => (
          <div key={axis} className="flex flex-col gap-1">
            <span className="text-slate-500 text-center uppercase">{axis}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleSnap(axis, -90)}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 font-mono"
                title={`Rotate -90° about world ${axis.toUpperCase()}.`}
              >
                -90
              </button>
              <button
                type="button"
                onClick={() => handleSnap(axis, 90)}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 font-mono"
                title={`Rotate +90° about world ${axis.toUpperCase()}.`}
              >
                +90
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Numeric XYZ degree inputs. Editing replaces the quaternion via the
          XYZ Euler decomposition of the current orientation. */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {AXES.map((axis, i) => (
          <label key={axis} className="flex flex-col gap-1">
            <span className="text-slate-500">{axis.toUpperCase()} (deg)</span>
            <input
              type="number"
              step="1"
              value={Number(eulerDeg[i].toFixed(2))}
              onChange={(e) => handleEulerEdit(axis, e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPivotMode('base-center')}
        className="w-full py-1.5 mt-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200"
        title="Re-run the base-center pivot so the lowest point of the rotated bbox sits on the AR floor."
      >
        Lay flat on floor
      </button>
    </div>
  );
}
