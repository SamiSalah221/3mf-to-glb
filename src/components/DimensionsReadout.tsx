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

/** Click to cycle units. `inline` renders it as a proof sheet's mono label instead of a floating chip. */
export function DimensionsReadout({ inline = false }: { inline?: boolean }) {
  const dimensions = useAppStore((s) => s.dimensions);
  const [unit, setUnit] = useState<DisplayUnit>('mm');

  if (!dimensions) return null;

  const cycle = () => {
    const i = ORDER.indexOf(unit);
    setUnit(ORDER[(i + 1) % ORDER.length]);
  };

  const { x, y, z } = dimensions.mm;

  if (inline) {
    return (
      <button
        type="button"
        onClick={cycle}
        title="Click to switch units"
        className="font-mono text-[12px] text-tx2 hover:text-tx transition-colors"
      >
        W {format(x, unit)} · H {format(y, unit)} · D {format(z, unit)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title="Click to switch units. Values come from the source 3MF's declared unit baked through to meters for AR."
      className="absolute bottom-3 right-3 px-3 py-2 bg-panel2/85 hover:bg-panel3/90 backdrop-blur-sm hover:border-line2 border border-line shadow-lg shadow-black/20 rounded-md flex flex-col items-end gap-0.5 transition-colors active:scale-[0.98]"
    >
      <span className="text-tx3 text-[11px]">W × H × D ({unit})</span>
      <span className="text-tx2 text-[12px] font-mono">
        {format(x, unit)} × {format(y, unit)} × {format(z, unit)}
      </span>
    </button>
  );
}
