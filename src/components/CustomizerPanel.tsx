import { useState, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ColorPickerPanel } from './ColorPicker';
import { RotationControls } from './RotationControls';
import { useExportActions } from '../hooks/useExportActions';
import type { PivotMode } from '../types';

const PRESETS = [
  '#FFFFFF', '#E8EAEE', '#9BA2AC', '#000000',
  '#FF3B30', '#FF9500', '#FFCC00', '#B8DE4A',
  '#34C759', '#00C7BE', '#007AFF', '#AF52DE',
];

const PIVOT_OPTIONS: { value: PivotMode; label: string }[] = [
  { value: 'base-center', label: 'Base center' },
  { value: 'bbox-center', label: 'Bbox center' },
  { value: 'centroid', label: 'Centroid' },
  { value: 'original', label: 'Original' },
  { value: 'custom', label: 'Custom…' },
];

type PanelTab = 'paint' | 'orient' | 'export';

export function CustomizerPanel() {
  const [tab, setTab] = useState<PanelTab>('paint');

  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const filaments = useAppStore((s) => s.filaments);
  const selectedFilamentIndex = useAppStore((s) => s.selectedFilamentIndex);
  const selectFilament = useAppStore((s) => s.selectFilament);
  const resetColors = useAppStore((s) => s.resetColors);
  const setFilamentColor = useAppStore((s) => s.setFilamentColor);
  const pivotMode = useAppStore((s) => s.pivotMode);
  const setPivotMode = useAppStore((s) => s.setPivotMode);

  const { handleExportGLB, handleExport3MF, handleViewInAR, arLabel, busy, file } =
    useExportActions();

  // Simulated progress + success toast
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runExport = async (label: string, action: () => Promise<void>) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setToast(null);
    let pct = 0;
    setProgress({ label, pct });
    intervalRef.current = setInterval(() => {
      pct = Math.min(pct + 10, 90);
      setProgress({ label, pct });
    }, 80);
    try {
      await action();
    } finally {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress({ label, pct: 100 });
      setTimeout(() => {
        setProgress(null);
        setToast(`✓ ${label} downloaded`);
        setTimeout(() => setToast(null), 3000);
      }, 300);
    }
  };

  const currentPlate = parseResult?.plates.find((p) => p.id === currentPlateId);
  const plateFilaments = currentPlate
    ? filaments.filter((f) => currentPlate.filamentIndicesUsed.includes(f.index))
    : [];

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* (a) Color zones — always visible, scrollable list */}
      <div className="flex-shrink-0 border-b border-line">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <span className="text-tx text-xs font-medium">
            Color zones{' '}
            <span className="text-tx3 font-mono">{plateFilaments.length}</span>
          </span>
          <button
            onClick={resetColors}
            className="text-tx3 hover:text-tx2 text-[10px] font-mono transition-colors"
          >
            reset all
          </button>
        </div>

        <div className="overflow-y-auto cc-scroll max-h-[180px]">
          {plateFilaments.map((filament) => {
            const isSelected = selectedFilamentIndex === filament.index;
            const faceCount = currentPlate
              ? currentPlate.meshChunks
                  .filter((c) => c.filamentIndex === filament.index)
                  .reduce((sum, c) => sum + c.faceCount, 0)
              : 0;

            return (
              <button
                key={filament.index}
                onClick={() => selectFilament(isSelected ? null : filament.index)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-t border-line/40 ${
                  isSelected ? 'bg-panel3' : 'hover:bg-panel2'
                }`}
                aria-label={`Select filament ${filament.index}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex-shrink-0 border ${
                    isSelected ? 'border-accent' : 'border-line2'
                  }`}
                  style={{ backgroundColor: filament.currentColor }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-tx text-xs font-medium leading-tight">
                      {filament.mix ? `Mix ${filament.index}` : `Filament ${filament.index}`}
                    </span>
                    {filament.mix && (
                      <span className="px-1 py-px rounded text-[9px] font-semibold uppercase bg-fuchsia-500/20 text-fuchsia-300">
                        Mixed
                      </span>
                    )}
                  </div>
                  <div className="text-tx3 text-[10px] font-mono truncate">
                    {filament.mix
                      ? `F${filament.mix.sources[0]}+F${filament.mix.sources[1]} · ${faceCount.toLocaleString()} faces`
                      : `${filament.currentColor} · ${faceCount.toLocaleString()} faces`}
                  </div>
                </div>
                {filament.currentColor !== filament.originalColor && (
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
                    title="Color modified"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* (b) Segmented tabs */}
      <div className="flex-shrink-0 flex border-b border-line px-4">
        {(['paint', 'orient', 'export'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2.5 text-[11px] font-mono capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-accent border-accent'
                : 'text-tx3 border-transparent hover:text-tx2'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* (b) Tab body — scrollable */}
      <div className="flex-1 overflow-y-auto cc-scroll min-h-0">
        {tab === 'paint' && (
          <div className="p-4 space-y-4">
            <ColorPickerPanel />
            {selectedFilamentIndex != null && (
              <div>
                <div className="text-tx3 text-[10px] font-mono uppercase tracking-wider mb-2">
                  Filament presets
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {PRESETS.map((hex) => (
                    <button
                      key={hex}
                      onClick={() => setFilamentColor(selectedFilamentIndex, hex)}
                      title={hex}
                      className="w-full aspect-square rounded border border-line2 hover:border-accent hover:scale-110 transition-all"
                      style={{ backgroundColor: hex }}
                      aria-label={`Set color to ${hex}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'orient' && (
          <div className="p-4 space-y-5">
            <RotationControls />
            <div>
              <label className="block text-tx3 text-[10px] font-mono uppercase tracking-wider mb-1.5">
                Pivot origin
              </label>
              <select
                value={pivotMode}
                onChange={(e) => setPivotMode(e.target.value as PivotMode)}
                className="w-full bg-panel2 border border-line2 rounded px-3 py-2 text-tx text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
              >
                {PIVOT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {tab === 'export' && (
          <div className="p-4 space-y-2">
            {[
              { fmt: 'GLB', desc: 'Binary glTF — web viewers, Blender, Unity, AR.' },
              { fmt: 'USDZ', desc: 'Apple AR Quick Look — iOS / macOS only.' },
              { fmt: '3MF', desc: 'Re-colored source file, still sliceable in OrcaSlicer.' },
            ].map(({ fmt, desc }) => (
              <div key={fmt} className="flex gap-3 p-3 rounded bg-panel2 border border-line">
                <span className="text-tx text-[11px] font-mono font-medium w-9 flex-shrink-0">
                  {fmt}
                </span>
                <span className="text-tx3 text-[11px] leading-relaxed">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* (c) Sticky export footer */}
      <div className="flex-shrink-0 border-t border-line p-4 space-y-2.5">
        {progress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-tx3 text-[10px] font-mono">{progress.label}…</span>
              <span className="text-tx3 text-[10px] font-mono">{progress.pct}%</span>
            </div>
            <div className="h-0.5 bg-panel3 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-75"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        )}

        {toast && !progress && (
          <div className="text-accent text-[11px] font-mono text-center">{toast}</div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => runExport('GLB', handleExportGLB)}
            disabled={busy}
            className="flex-1 py-2.5 bg-accent hover:opacity-90 disabled:opacity-40 text-bg text-sm font-mono font-semibold rounded transition-opacity"
          >
            Export GLB
          </button>
          <button
            onClick={() => runExport('AR', handleViewInAR)}
            disabled={busy}
            title={arLabel}
            className="px-3.5 py-2.5 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line2 text-tx2 text-xs font-mono rounded transition-colors"
          >
            AR
          </button>
          <button
            onClick={() => runExport('3MF', handleExport3MF)}
            disabled={busy || !file}
            title="Re-export the source 3MF with the new filament colors."
            className="px-3.5 py-2.5 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line2 text-tx2 text-xs font-mono rounded transition-colors"
          >
            3MF
          </button>
        </div>
      </div>
    </div>
  );
}
