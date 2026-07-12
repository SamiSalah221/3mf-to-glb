import { SwatchSquare } from './SwatchSquare';
import type { FilamentSlot } from '../types';

/**
 * One color-zone list row: swatch, name, hex/mix + face count, modified
 * dot. Shared by the desktop CustomizerPanel list and the mobile
 * PlateSelector list so the two can't drift out of sync again.
 */
export function ZoneRow({
  filament,
  filaments,
  faceCount,
  isSelected,
  onClick,
  rounded = false,
}: {
  filament: FilamentSlot;
  filaments: FilamentSlot[];
  faceCount: number;
  isSelected: boolean;
  onClick: () => void;
  /** Mobile list rows sit inside a padded container and are individually rounded. */
  rounded?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-l-2 transition-colors ${
        rounded ? 'rounded-md' : ''
      } ${isSelected ? 'border-accent bg-panel2' : 'border-transparent hover:bg-panel2'}`}
      aria-label={`Select filament ${filament.index}`}
    >
      <SwatchSquare filament={filament} filaments={filaments} />
      <div className="min-w-0 flex-1">
        <div className="text-tx text-sm font-medium leading-tight">
          {filament.mix ? `Mix ${filament.index}` : `Filament ${filament.index}`}
        </div>
        <div className="flex items-center justify-between gap-2 text-tx3 text-[11px] font-mono">
          <span>
            {filament.mix
              ? `F${filament.mix.sources[0]}+F${filament.mix.sources[1]}`
              : filament.currentColor}
          </span>
          <span>{faceCount.toLocaleString()} faces</span>
        </div>
      </div>
      {filament.currentColor !== filament.originalColor && (
        <div className="w-1.5 h-1.5 rounded-full bg-warn flex-shrink-0" title="Color modified" />
      )}
    </button>
  );
}
