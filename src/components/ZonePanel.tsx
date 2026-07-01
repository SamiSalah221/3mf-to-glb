import { useAppStore } from '../store/useAppStore';

/** Compact plate pills for the desktop top bar. */
export function PlatePills() {
  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const setCurrentPlate = useAppStore((s) => s.setCurrentPlate);

  if (!parseResult) return null;

  return (
    <div className="flex items-center gap-1">
      {parseResult.plates.map((plate) => {
        const active = currentPlateId === plate.id;
        return (
          <button
            key={plate.id}
            onClick={() => setCurrentPlate(plate.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${
              active
                ? 'bg-panel3 border border-line3 text-tx'
                : 'text-tx3 hover:text-tx2 hover:bg-panel2'
            }`}
          >
            {plate.thumbnailUrl ? (
              <img
                src={plate.thumbnailUrl}
                alt={`Plate ${plate.id}`}
                className="w-5 h-5 rounded object-cover"
              />
            ) : (
              <div className="w-5 h-5 rounded bg-panel3 flex items-center justify-center text-[9px] text-tx3">
                {plate.id}
              </div>
            )}
            <span>Plate {plate.id}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Full plate selector + zone list — used on mobile. */
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
  const plateFilaments = currentPlate
    ? filaments.filter((f) => currentPlate.filamentIndicesUsed.includes(f.index))
    : [];

  return (
    <div className="flex flex-col h-full bg-panel border-r border-line">
      {/* Plate tabs */}
      <div className="p-3 border-b border-line">
        <h2 className="text-tx3 text-[10px] font-mono uppercase tracking-wider mb-2">Plates</h2>
        <div className="flex gap-1.5 flex-wrap">
          {parseResult.plates.map((plate) => (
            <button
              key={plate.id}
              onClick={() => setCurrentPlate(plate.id)}
              className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded text-xs font-mono transition-all ${
                currentPlateId === plate.id
                  ? 'bg-panel3 border border-line3 text-tx'
                  : 'bg-panel2 text-tx3 hover:bg-panel3 hover:text-tx2'
              }`}
            >
              {plate.thumbnailUrl ? (
                <img
                  src={plate.thumbnailUrl}
                  alt={plate.name}
                  className="w-14 h-14 rounded object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded bg-panel3 flex items-center justify-center text-lg text-tx3">
                  {plate.id}
                </div>
              )}
              <span>Plate {plate.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color zones header */}
      <div className="px-3 py-2 border-b border-line flex items-center justify-between">
        <h2 className="text-tx3 text-[10px] font-mono uppercase tracking-wider">
          Colors ({plateFilaments.length})
        </h2>
        <button
          onClick={resetColors}
          className="text-tx3 hover:text-tx2 text-[10px] font-mono transition-colors"
        >
          reset all
        </button>
      </div>

      {/* Zone list */}
      <div className="flex-1 overflow-y-auto cc-scroll p-2 space-y-px">
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-colors ${
                isSelected ? 'bg-panel3 ring-1 ring-accent' : 'hover:bg-panel2'
              }`}
              aria-label={`Select filament ${filament.index}`}
            >
              <div
                className="w-8 h-8 rounded-full border border-line2 flex-shrink-0"
                style={{ backgroundColor: filament.currentColor }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-tx text-sm font-medium">
                    {filament.mix ? `Mix ${filament.index}` : `Filament ${filament.index}`}
                  </span>
                  {filament.mix && (
                    <span className="px-1 py-px rounded text-[9px] font-semibold uppercase bg-fuchsia-500/20 text-fuchsia-300">
                      Mixed
                    </span>
                  )}
                </div>
                <div className="text-tx3 text-[11px] font-mono">
                  {filament.mix
                    ? `F${filament.mix.sources[0]} + F${filament.mix.sources[1]} · ${faceCount.toLocaleString()} faces`
                    : `${filament.currentColor} · ${faceCount.toLocaleString()} faces`}
                </div>
              </div>
              {filament.currentColor !== filament.originalColor && (
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Color modified" />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-line">
        <button
          onClick={resetColors}
          className="w-full py-2 text-xs font-mono text-tx3 hover:text-tx hover:bg-panel2 rounded transition-colors"
        >
          Reset All Colors
        </button>
      </div>
    </div>
  );
}
