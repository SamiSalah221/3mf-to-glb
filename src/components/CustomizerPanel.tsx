import { useState, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ColorPickerPanel } from './ColorPicker';
import { RotationControls } from './RotationControls';
import { ResetButton } from './ResetButton';
import { ZoneRow } from './ZoneRow';
import { ExportActions } from './ExportActions';
import { usePersistentState } from '../hooks/usePersistentState';
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

type PanelTab = 'paint' | 'orient';

export function CustomizerPanel() {
  const [tab, setTab] = useState<PanelTab>('paint');
  const [split, setSplit] = usePersistentState('cc.split', 50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clampedSplit = Math.min(80, Math.max(20, split));

  const onSplitDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const pct = ((moveEvent.clientY - rect.top) / rect.height) * 100;
      setSplit(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const filaments = useAppStore((s) => s.filaments);
  const selectedFilamentIndex = useAppStore((s) => s.selectedFilamentIndex);
  const selectFilament = useAppStore((s) => s.selectFilament);
  const resetColors = useAppStore((s) => s.resetColors);
  const setFilamentColor = useAppStore((s) => s.setFilamentColor);
  const pivotMode = useAppStore((s) => s.pivotMode);
  const setPivotMode = useAppStore((s) => s.setPivotMode);

  const currentPlate = parseResult?.plates.find((p) => p.id === currentPlateId);
  const plateFilaments = currentPlate
    ? filaments.filter((f) => currentPlate.filamentIndicesUsed.includes(f.index))
    : [];

  return (
    <div className="flex flex-col h-full bg-panel">
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
        {/* (a) Color zones: resizable, scrollable list */}
        <section
          style={{ height: `${clampedSplit}%` }}
          className="flex flex-col min-h-0 border-b border-line flex-shrink-0"
        >
          <div className="px-4 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
            <span className="text-tx2 text-xs font-semibold tracking-[0.02em]">
              Color zones <span className="text-tx3 font-normal">{plateFilaments.length}</span>
            </span>
            <ResetButton onClick={resetColors} />
          </div>

          <div className="flex-1 overflow-y-auto cc-scroll">
            {plateFilaments.map((filament) => {
              const isSelected = selectedFilamentIndex === filament.index;
              const faceCount = currentPlate
                ? currentPlate.meshChunks
                    .filter((c) => c.filamentIndex === filament.index)
                    .reduce((sum, c) => sum + c.faceCount, 0)
                : 0;

              return (
                <ZoneRow
                  key={filament.index}
                  filament={filament}
                  filaments={filaments}
                  faceCount={faceCount}
                  isSelected={isSelected}
                  onClick={() => selectFilament(isSelected ? null : filament.index)}
                />
              );
            })}
          </div>
        </section>

        {/* Drag divider between Color zones and options */}
        <div
          onPointerDown={onSplitDown}
          className="h-1.5 flex-shrink-0 cursor-row-resize hover:bg-accent/40 transition-colors"
        />

        {/* (b) Options: segmented tabs + body, takes the remainder */}
        <section className="flex-1 flex flex-col min-h-0">
          <div className="flex-shrink-0 flex border-b border-line px-4">
            {(['paint', 'orient'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'text-tx border-accent'
                    : 'text-tx2 border-transparent hover:text-tx'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto cc-scroll min-h-0">
            {tab === 'paint' && (
              <div className="p-4 space-y-4">
                <ColorPickerPanel />
                {selectedFilamentIndex != null && (
                  <div>
                    <div className="text-tx3 text-[11px] font-medium tracking-[0.02em] mb-2">
                      Filament presets
                    </div>
                    <div className="grid grid-cols-6 gap-1.5">
                      {PRESETS.map((hex) => (
                        <button
                          key={hex}
                          onClick={() => setFilamentColor(selectedFilamentIndex, hex)}
                          title={hex}
                          className="w-full aspect-square rounded border border-line2 hover:border-line3 hover:scale-110 active:scale-95 transition-all"
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
                  <label className="block text-tx2 text-xs font-semibold tracking-[0.02em] mb-1.5">
                    Pivot origin
                  </label>
                  <select
                    value={pivotMode}
                    onChange={(e) => setPivotMode(e.target.value as PivotMode)}
                    className="w-full bg-panel2 border border-line rounded-md px-3 py-2 text-tx text-xs focus:outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
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
          </div>
        </section>
      </div>

      {/* (c) Sticky export footer */}
      <div className="flex-shrink-0 border-t border-line p-4">
        <ExportActions layout="row" />
      </div>
    </div>
  );
}
