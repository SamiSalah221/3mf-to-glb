import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useAppStore } from '../store/useAppStore';
import { SwatchSquare } from './SwatchSquare';
import { ResetIcon } from './Icon';
import type { FilamentSlot } from '../types';

function SingleColorEditor({
  filament,
  label,
  disabled = false,
  showReset = true,
}: {
  filament: FilamentSlot;
  label: string;
  disabled?: boolean;
  showReset?: boolean;
}) {
  const setFilamentColor = useAppStore((s) => s.setFilamentColor);
  const [hexInput, setHexInput] = useState(filament.currentColor);
  const [syncedColor, setSyncedColor] = useState(filament.currentColor);

  if (filament.currentColor !== syncedColor) {
    setSyncedColor(filament.currentColor);
    setHexInput(filament.currentColor);
  }

  const handlePickerChange = (color: string) => {
    const upper = color.toUpperCase();
    setFilamentColor(filament.index, upper);
    setHexInput(upper);
  };

  const handleHexInput = (value: string) => {
    setHexInput(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      setFilamentColor(filament.index, value.toUpperCase());
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-tx font-medium text-sm mb-0.5">{label}</h3>
        <p className="text-tx3 text-[11px] font-mono">Original: {filament.originalColor}</p>
      </div>

      <div
        className={`[&_.react-colorful]:!w-full ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
        aria-disabled={disabled}
      >
        <HexColorPicker color={filament.currentColor} onChange={handlePickerChange} />
      </div>

      <div className="flex gap-2 items-center">
        <div
          className="w-9 h-9 rounded-md border border-line flex-shrink-0"
          style={{ backgroundColor: filament.currentColor }}
        />
        <input
          type="text"
          value={hexInput}
          disabled={disabled}
          onChange={(e) => handleHexInput(e.target.value)}
          className="flex-1 bg-panel2 border border-line rounded-md px-3 py-1.5 text-tx text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40 disabled:cursor-not-allowed"
          placeholder="#FF0000"
          aria-label={`Hex color value for ${label}`}
        />
      </div>

      {showReset && !disabled && filament.currentColor !== filament.originalColor && (
        <button
          onClick={() => {
            setFilamentColor(filament.index, filament.originalColor);
            setHexInput(filament.originalColor);
          }}
          className="text-[11px] font-mono text-tx3 hover:text-tx2 transition-colors"
        >
          Reset to original ({filament.originalColor})
        </button>
      )}
    </div>
  );
}

export function ColorPickerPanel() {
  const selectedFilamentIndex = useAppStore((s) => s.selectedFilamentIndex);
  const filaments = useAppStore((s) => s.filaments);
  const relinkMixedFilament = useAppStore((s) => s.relinkMixedFilament);

  const filament = filaments.find((f) => f.index === selectedFilamentIndex);

  if (!filament) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-tx3 text-xs text-center">
          Pick a zone on the model to recolor it.
        </p>
      </div>
    );
  }

  if (filament.mix) {
    const sourceA = filaments.find((f) => f.index === filament.mix!.sources[0]);
    const sourceB = filaments.find((f) => f.index === filament.mix!.sources[1]);
    const pctA = Math.round(filament.mix.ratioA * 100);
    const overridden = !!filament.mixOverridden;

    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <SwatchSquare filament={filament} filaments={filaments} />
            <h3 className="text-tx font-medium text-sm">Mix {filament.index}</h3>
            {overridden && (
              <span className="px-1.5 py-px rounded text-[11px] font-medium bg-warn/20 text-warn">
                Overridden
              </span>
            )}
          </div>
          <p className="text-tx3 text-[11px] mt-1 leading-relaxed">
            {overridden
              ? 'This zone uses an explicit color. The sources below are locked. Relink to follow the blend again.'
              : `Blend of ${pctA}% F${filament.mix.sources[0]} + ${100 - pctA}% F${filament.mix.sources[1]}. Edit a source below, or set this zone's color directly to override.`}
          </p>
        </div>

        <SingleColorEditor
          filament={filament}
          label={`Zone color (Mix ${filament.index})`}
          showReset={false}
        />

        {overridden && (
          <button
            onClick={() => relinkMixedFilament(filament.index)}
            className="w-full h-9 flex items-center justify-center gap-1.5 text-xs font-medium text-tx2 bg-panel2 hover:bg-panel3 border border-line hover:border-line2 rounded-md transition-colors active:scale-[0.98]"
          >
            <ResetIcon />
            Relink to blend
          </button>
        )}

        <div className="pt-3 border-t border-line space-y-4">
          <p className="text-tx2 text-[11px] font-semibold tracking-[0.02em]">
            Sources {overridden && <span className="text-tx4 font-normal">(locked)</span>}
          </p>
          {sourceA && (
            <SingleColorEditor
              filament={sourceA}
              label={`Source A: Filament ${sourceA.index}`}
              disabled={overridden}
            />
          )}
          {sourceB && (
            <div className="pt-2 border-t border-line/50">
              <SingleColorEditor
                filament={sourceB}
                label={`Source B: Filament ${sourceB.index}`}
                disabled={overridden}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return <SingleColorEditor filament={filament} label={`Filament ${filament.index}`} />;
}
