import type { PivotMode } from '../types';
import { useAppStore } from '../store/useAppStore';

const PIVOT_OPTIONS: { value: PivotMode; label: string; hint: string }[] = [
  { value: 'base-center', label: 'Base center', hint: 'AR-friendly. Centers X/Y, puts the bottom of the model on the floor.' },
  { value: 'bbox-center', label: 'Bbox center', hint: 'Geometric center of the bounding box at the origin.' },
  { value: 'centroid', label: 'Centroid', hint: 'Area-weighted centroid at the origin. Differs from bbox center for asymmetric models.' },
  { value: 'original', label: 'Original 3MF origin', hint: 'No translation. Keeps the source 3MF coordinates as exported.' },
  { value: 'custom', label: 'Custom offset', hint: 'Bbox center plus a user-entered X/Y/Z offset in millimeters.' },
];

export function PivotControls() {
  const pivotMode = useAppStore((s) => s.pivotMode);
  const setPivotMode = useAppStore((s) => s.setPivotMode);
  const customPivotMm = useAppStore((s) => s.customPivotMm);
  const setCustomPivotMm = useAppStore((s) => s.setCustomPivotMm);

  const setAxis = (idx: 0 | 1 | 2, raw: string) => {
    const v = Number(raw);
    const next: [number, number, number] = [...customPivotMm];
    next[idx] = Number.isFinite(v) ? v : 0;
    setCustomPivotMm(next);
  };

  const active = PIVOT_OPTIONS.find((o) => o.value === pivotMode);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="pivot-mode" className="text-slate-400 font-semibold uppercase tracking-wider">
          Export pivot
        </label>
        <select
          id="pivot-mode"
          value={pivotMode}
          onChange={(e) => setPivotMode(e.target.value as PivotMode)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        >
          {PIVOT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {active && <p className="text-slate-500 leading-snug">{active.hint}</p>}

      {pivotMode === 'custom' && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          {(['X', 'Y', 'Z'] as const).map((label, i) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="text-slate-500">{label} (mm)</span>
              <input
                type="number"
                step="1"
                value={customPivotMm[i]}
                onChange={(e) => setAxis(i as 0 | 1 | 2, e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-2 text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
