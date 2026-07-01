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
      className="absolute bottom-3 right-3 px-3 py-2 bg-panel/80 hover:bg-panel2/80 border border-line backdrop-blur text-tx2 text-[10px] font-mono rounded flex flex-col items-end gap-0.5 transition-colors"
    >
      <span className="text-tx3 uppercase tracking-wider">W × H × D ({unit})</span>
      <span>
        {format(x, unit)} × {format(y, unit)} × {format(z, unit)}
      </span>
    </button>
  );
}
