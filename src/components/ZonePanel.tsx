import { useAppStore } from '../store/useAppStore';

export function PlateSelector() {
  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const setCurrentPlate = useAppStore((s) => s.setCurrentPlate);
  const filaments = useAppStore((s) => s.filaments);
  const selectedFilamentIndex = useAppStore((s) => s.selectedFilamentIndex);
  const selectFilament = useAppStore((s) => s.selectFilament);
  const resetColors = useAppStore((s) => s.resetColors);

  if (!parseResult) return null;

  const currentPlate = parseResult.plates.find((p) => p.id === currentPlateId);

  // Get filaments used on the current plate
  const plateFilaments = currentPlate
    ? filaments.filter((f) => currentPlate.filamentIndicesUsed.includes(f.index))
    : [];

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-700">
      {/* Plate tabs */}
      <div className="p-3 border-b border-slate-700">
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
          Plates
        </h2>
        <div className="flex gap-1.5 flex-wrap">
          {parseResult.plates.map((plate) => (
            <button
              key={plate.id}
              onClick={() => setCurrentPlate(plate.id)}
              className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                currentPlateId === plate.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {plate.thumbnailUrl ? (
                <img
                  src={plate.thumbnailUrl}
                  alt={plate.name}
                  className="w-14 h-14 rounded object-cover bg-slate-700"
                />
              ) : (
                <div className="w-14 h-14 rounded bg-slate-700 flex items-center justify-center text-lg">
                  {plate.id}
                </div>
              )}
              <span>Plate {plate.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color zones for current plate */}
      <div className="p-3 border-b border-slate-700">
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
          Colors on this plate ({plateFilaments.length})
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                isSelected
                  ? 'bg-slate-700 ring-2 ring-emerald-400'
                  : 'hover:bg-slate-800'
              }`}
              aria-label={`Select filament ${filament.index}`}
            >
              <div
                className="w-11 h-11 rounded-full border-2 border-slate-500 flex-shrink-0 shadow-inner"
                style={{ backgroundColor: filament.currentColor }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-white text-sm font-medium">
                  Filament {filament.index}
                </div>
                <div className="text-slate-500 text-xs">
                  {filament.currentColor} · {faceCount.toLocaleString()} faces
                </div>
              </div>
              {filament.currentColor !== filament.originalColor && (
                <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Color modified" />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-slate-700">
        <button
          onClick={resetColors}
          className="w-full py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          Reset All Colors
        </button>
      </div>
    </div>
  );
}
