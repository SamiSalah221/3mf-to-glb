import type { FilamentSlot } from '../types';

const SIZES = {
  sm: 'w-3 h-3', // 12px, legend
  md: 'w-5 h-5', // 20px, panel rows
} as const;

/**
 * Shared color swatch: a rounded square with a hairline inset border. Solid
 * filaments show their current color; Snapmaker U1 "mixed" slots show a
 * diagonal split of their two source colors so the panel and viewport legend
 * read the blend the same way. The two source colors are resolved live from
 * the filament list (same lookup ColorPicker uses).
 */
export function SwatchSquare({
  filament,
  filaments,
  size = 'md',
}: {
  filament: FilamentSlot;
  filaments: FilamentSlot[];
  size?: keyof typeof SIZES;
}) {
  const base = `${SIZES[size]} rounded flex-shrink-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]`;

  if (filament.mix) {
    const [ai, bi] = filament.mix.sources;
    const colorA = filaments.find((f) => f.index === ai)?.currentColor ?? filament.currentColor;
    const colorB = filaments.find((f) => f.index === bi)?.currentColor ?? filament.currentColor;
    return (
      <div
        className={base}
        style={{ background: `linear-gradient(135deg, ${colorA} 0 50%, ${colorB} 50% 100%)` }}
        title={`Mix of Filament ${ai} and Filament ${bi}`}
      />
    );
  }

  return <div className={base} style={{ backgroundColor: filament.currentColor }} />;
}
