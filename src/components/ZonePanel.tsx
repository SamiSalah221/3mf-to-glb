import { useAppStore } from '../store/useAppStore';

/** Plate pills for the top bar (only shown when a file has more than one plate). */
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
              aria-pressed={active}
              className={`flex items-center gap-1.5 h-9 px-2.5 font-mono text-[12px] uppercase border transition-colors ${
                active ? 'border-tx text-tx' : 'border-transparent text-tx2 hover:text-tx hover:bg-panel3'
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
