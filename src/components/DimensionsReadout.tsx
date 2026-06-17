import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

type DisplayUnit = 'mm' | 'cm' | 'inch';

const MM_PER_INCH = 25.4;

function format(value: number, unit: DisplayUnit): string {
  switch (unit) {
    case 'mm':
      return `${value.toFixed(1)} mm`;
    case 'cm':
      return `${(value / 10).toFixed(2)} cm`;
    case 'inch':
      return `${(value / MM_PER_INCH).toFixed(2)} in`;
  }
}

const ORDER: DisplayUnit[] = ['mm', 'cm', 'inch'];

/**
 * Floating bottom-right readout that shows the current plate's bounding-box
 * dimensions in the user's chosen unit. Values come from the buildSceneFromPlate
 * userData via useAppStore, so they reflect the unit declared on the source
 * 3MF (default millimeter) and the meters bake applied for AR export.
 */
export function DimensionsReadout() {
  const dimensions = useAppStore((s) => s.dimensions);
  const [unit, setUnit] = useState<DisplayUnit>('mm');

  if (!dimensions) return null;

  const cycle = () => {
    const i = ORDER.indexOf(unit);
    setUnit(ORDER[(i + 1) % ORDER.length]);
  };

  const { x, y, z } = dimensions.mm;

  return (
    <button
      type="button"
      onClick={cycle}
      title="Click to switch units. Values come from the source 3MF's declared unit baked through to meters for AR."
      className="absolute bottom-3 right-3 px-3 py-2 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 text-xs rounded-lg backdrop-blur flex flex-col items-end gap-0.5 transition-colors border border-slate-700"
    >
      <span className="text-[10px] uppercase tracking-wider text-slate-400">
        W × H × D ({unit})
      </span>
      <span className="font-mono">
        {format(x, unit)} × {format(y, unit)} × {format(z, unit)}
      </span>
    </button>
  );
}
