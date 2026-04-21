import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useAppStore } from '../store/useAppStore';

export function ColorPickerPanel() {
  const selectedFilamentIndex = useAppStore((s) => s.selectedFilamentIndex);
  const filaments = useAppStore((s) => s.filaments);
  const setFilamentColor = useAppStore((s) => s.setFilamentColor);

  const filament = filaments.find((f) => f.index === selectedFilamentIndex);
  const [hexInput, setHexInput] = useState(filament?.currentColor ?? '');
  const [syncedColor, setSyncedColor] = useState(filament?.currentColor ?? '');

  // Re-sync the text input when the selected filament or its color changes.
  if (filament && filament.currentColor !== syncedColor) {
    setSyncedColor(filament.currentColor);
    setHexInput(filament.currentColor);
  }

  if (!filament) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-slate-500 text-sm text-center">
          Select a color zone on the left to change its color
        </p>
      </div>
    );
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
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-white font-semibold text-sm mb-1">
          Filament {filament.index}
        </h3>
        <p className="text-slate-500 text-xs">
          Original: {filament.originalColor}
        </p>
      </div>

      <div className="[&_.react-colorful]:!w-full">
        <HexColorPicker
          color={filament.currentColor}
          onChange={handlePickerChange}
        />
      </div>

      <div className="flex gap-2 items-center">
        <div
          className="w-8 h-8 rounded border border-slate-600 flex-shrink-0"
          style={{ backgroundColor: filament.currentColor }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexInput(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="#FF0000"
          aria-label="Hex color value"
        />
      </div>

      {filament.currentColor !== filament.originalColor && (
        <button
          onClick={() => {
            setFilamentColor(filament.index, filament.originalColor);
            setHexInput(filament.originalColor);
          }}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Reset to original ({filament.originalColor})
        </button>
      )}
    </div>
  );
}
