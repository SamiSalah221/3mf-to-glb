import { useAppStore } from '../../store/useAppStore';
import { RotationControls } from '../RotationControls';
import { PIVOT_OPTIONS } from './constants';
import type { PivotMode } from '../../types';

/** Pivot select, shared by the Orient panel and the Sign off ticket. */
export function PivotSelect({ id }: { id: string }) {
  const pivotMode = useAppStore((s) => s.pivotMode);
  const setPivotMode = useAppStore((s) => s.setPivotMode);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold text-[13px]">Where it sits in AR (pivot)</label>
      <select
        id={id}
        value={pivotMode}
        onChange={(e) => setPivotMode(e.target.value as PivotMode)}
        className="h-10 px-2.5 bg-panel2 border border-line2 text-tx text-[13px] focus:outline-none focus:border-accent"
      >
        {PIVOT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * Orientation tools and help, over the viewport on the proof sheet: rotate
 * the part (baked into GLB / USDZ, not the 3MF), pick the AR pivot, switch
 * projection, and how to move the camera.
 */
export function OrientPanel({ onClose }: { onClose: () => void }) {
  const cameraProjection = useAppStore((s) => s.cameraProjection);
  const setCameraProjection = useAppStore((s) => s.setCameraProjection);

  return (
    <div
      role="dialog"
      aria-label="Orient"
      className="absolute left-3 bottom-14 z-10 w-[300px] max-w-[calc(100%-24px)] max-h-[calc(100%-72px)] overflow-y-auto cc-scroll bg-panel border-[1.5px] border-tx p-4 flex flex-col gap-4 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.08em] text-tx2">ORIENT</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close orient panel"
          className="w-9 h-9 -mr-2 flex items-center justify-center text-tx2 hover:text-tx"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <RotationControls />
      <p className="m-0 text-[12px] text-tx3 leading-relaxed -mt-1">
        Rotation is baked into GLB and USDZ exports so the part stands the right way up in AR. The 3MF
        keeps its print-bed orientation.
      </p>

      <PivotSelect id="orient-pivot" />

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-[13px]">Camera</span>
        <div role="group" aria-label="Projection" className="grid grid-cols-2 border border-tx">
          {(['perspective', 'orthographic'] as const).map((p, i) => (
            <button
              key={p}
              type="button"
              aria-pressed={cameraProjection === p}
              onClick={() => setCameraProjection(p)}
              className={`h-9 text-[12px] font-medium capitalize ${i ? 'border-l border-tx' : ''} ${
                cameraProjection === p ? 'bg-tx text-bg' : 'text-tx hover:bg-panel3'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px] pt-3 border-t border-line">
        <dt className="font-mono text-tx2">Orbit</dt><dd className="m-0 text-tx2">Drag</dd>
        <dt className="font-mono text-tx2">Zoom</dt><dd className="m-0 text-tx2">Scroll or pinch</dd>
        <dt className="font-mono text-tx2">Pan</dt><dd className="m-0 text-tx2">Right-drag or two fingers</dd>
        <dt className="font-mono text-tx2">Axes</dt>
        <dd className="m-0 text-tx2">
          The gizmo, top right: <span className="text-axis-x">X</span> red, <span className="text-axis-y">Y</span> green,{' '}
          <span className="text-axis-z">Z</span> blue (Z is up, as on the print bed). Click an axis to look along it.
        </dd>
      </dl>
    </div>
  );
}
