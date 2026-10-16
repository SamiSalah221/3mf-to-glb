import { useMemo, useRef, useState } from 'react';
import { useAppStore, type ViewMode } from '../store/useAppStore';
import { parse3MF } from '../lib/parse3MF';
import { isGcodeFile } from '../lib/parseGcode';
import { parseGcodeInWorker } from '../workers/parseGcodeInWorker';
import type { ParseResult } from '../types';

const LABELS: Record<ViewMode, string> = { model: 'Model', printed: 'As printed' };

/** Bounding-box size of a plate in millimetres, largest first (ignores bed rotation). */
function plateExtentsMm(result: ParseResult, plateId: number | null): number[] | null {
  const plate = result.plates.find((p) => p.id === plateId) ?? result.plates[0];
  if (!plate) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const c of plate.meshChunks) {
    const p = c.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[i + k];
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
    }
  }
  const mm = result.unitToMeters * 1000;
  return [0, 1, 2].map((k) => (hi[k] - lo[k]) * mm).sort((a, b) => b - a);
}

/**
 * Top-center viewport control for the two versions of a part: the design
 * model (.3mf) and the as-printed model built from its sliced G-code. With one
 * loaded it offers to add the other; with both it switches between them.
 * Colors are shared, so a recolor shows on either version.
 */
export function VersionToggle() {
  const versions = useAppStore((s) => s.versions);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const addVersion = useAppStore((s) => s.addVersion);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const both = versions.model && versions.printed;
  const missing: ViewMode | null = !versions.model ? 'model' : !versions.printed ? 'printed' : null;

  // When the slicer scaled the part, say so: the as-printed version is the true size.
  const scaleNote = useMemo(() => {
    if (!versions.model || !versions.printed) return null;
    const a = plateExtentsMm(versions.model, currentPlateId);
    const b = plateExtentsMm(versions.printed, currentPlateId);
    if (!a || !b) return null;
    const pct = b.map((v, i) => (100 * v) / Math.max(a[i], 1e-9));
    if (pct.every((p) => Math.abs(p - 100) < 2)) return null;
    const uniform = Math.max(...pct) / Math.min(...pct) < 1.02;
    return uniform
      ? `Printed at ${Math.round(pct[0])}% of the model`
      : `Printed at ${pct.map((p) => `${Math.round(p)}%`).join(' × ')} of the model`;
  }, [versions.model, versions.printed, currentPlateId]);

  const onPick = async (file: File) => {
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const gcode = await isGcodeFile(buffer);
      if ((missing === 'printed') !== gcode) {
        throw new Error(missing === 'printed' ? 'Pick a sliced .gcode or .gcode.3mf.' : 'Pick the design .3mf.');
      }
      setBusy(gcode ? 'Building the as-printed model…' : 'Reading the design model…');
      const result = gcode ? await parseGcodeInWorker(buffer) : await parse3MF(buffer);
      addVersion(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const pill =
    'pointer-events-auto bg-panel2/85 backdrop-blur-sm border border-line shadow-lg shadow-black/20 rounded-md';

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 select-none z-10">
      {both ? (
        <div role="group" aria-label="Version" className={`${pill} flex p-0.5`}>
          {(['model', 'printed'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 h-7 text-[12px] font-medium rounded transition-colors ${
                viewMode === mode ? 'bg-accent text-accent-fg' : 'text-tx2 hover:text-tx'
              }`}
            >
              {LABELS[mode]}
            </button>
          ))}
        </div>
      ) : (
        missing && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
            title={
              missing === 'printed'
                ? 'Add the sliced G-code of this part to switch between the model and the part as it will print.'
                : 'Add the design 3MF of this print to switch between it and the as-printed model.'
            }
            className={`${pill} flex items-center gap-1.5 px-2.5 h-8 text-tx2 hover:text-tx hover:border-line2 text-[11px] transition-colors disabled:opacity-60 active:scale-[0.98]`}
          >
            {busy ? (
              <span className="w-3 h-3 border-2 border-line3 border-t-accent rounded-full animate-spin" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">+</span>
            )}
            {busy ?? (missing === 'printed' ? 'Compare with sliced G-code' : 'Compare with design 3MF')}
          </button>
        )
      )}
      {both && scaleNote && (
        <div className="pointer-events-none text-tx3 text-[11px]" title="The G-code's size differs from the 3MF's: the part was scaled in the slicer. The as-printed version shows the true size.">
          {scaleNote}
        </div>
      )}
      {error && <div className="text-[11px] text-red-400 max-w-[280px] text-center">{error}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={missing === 'printed' ? '.gcode,.3mf' : '.3mf'}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
        }}
      />
    </div>
  );
}
