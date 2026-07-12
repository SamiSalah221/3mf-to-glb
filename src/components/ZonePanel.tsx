import { useAppStore } from '../store/useAppStore';
import { ZoneRow } from './ZoneRow';
import { ResetButton } from './ResetButton';

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
          <div key={plate.id} className="relative group">
            <button
              onClick={() => setCurrentPlate(plate.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border-b-2 transition-colors ${
                active
                  ? 'bg-panel2 border-accent text-tx'
                  : 'border-transparent text-tx3 hover:text-tx2 hover:bg-panel2'
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

            {/* Hover preview bubble */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 hidden group-hover:block pointer-events-none">
              <div className="flex flex-col items-center gap-1.5 bg-panel border border-line2 rounded-lg shadow-xl shadow-black/40 p-2">
                {plate.thumbnailUrl ? (
                  <img
                    src={plate.thumbnailUrl}
                    alt={`Plate ${plate.id}`}
                    className="w-40 h-40 rounded object-contain bg-panel2"
                  />
                ) : (
                  <div className="w-40 h-40 rounded bg-panel2 flex items-center justify-center text-3xl text-tx3">
                    {plate.id}
                  </div>
                )}
                <span className="text-tx2 text-[11px]">Plate {plate.id}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Full plate selector + zone list, used on mobile. */
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
        <h2 className="text-tx2 text-[11px] font-semibold tracking-[0.02em] mb-2">Plates</h2>
        <div className="flex gap-1.5 flex-wrap">
          {parseResult.plates.map((plate) => (
            <button
              key={plate.id}
              onClick={() => setCurrentPlate(plate.id)}
              className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-md text-xs border transition-all active:scale-[0.98] ${
                currentPlateId === plate.id
                  ? 'bg-panel2 border-accent text-tx'
                  : 'bg-panel2 hover:bg-panel3 border-line hover:border-line2 text-tx3 hover:text-tx2'
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
      <div className="px-3 py-2 border-b border-line">
        <h2 className="text-tx2 text-xs font-semibold tracking-[0.02em]">
          Colors <span className="text-tx3 font-normal">{plateFilaments.length}</span>
        </h2>
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
            <ZoneRow
              key={filament.index}
              filament={filament}
              filaments={filaments}
              faceCount={faceCount}
              isSelected={isSelected}
              onClick={() => selectFilament(isSelected ? null : filament.index)}
              rounded
            />
          );
        })}
      </div>

      <div className="p-3 border-t border-line">
        <ResetButton onClick={resetColors} variant="block" />
      </div>
    </div>
  );
}
