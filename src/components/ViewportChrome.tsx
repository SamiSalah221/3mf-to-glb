import { useAppStore } from '../store/useAppStore';
import { DimensionsReadout } from './DimensionsReadout';

/** Floating overlay pieces rendered on top of the 3D viewport. */
export function ViewportChrome() {
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const parseResult = useAppStore((s) => s.parseResult);
  const filaments = useAppStore((s) => s.filaments);

  const currentPlate = parseResult?.plates.find((p) => p.id === currentPlateId);
  const plateFilaments = currentPlate
    ? filaments.filter((f) => currentPlate.filamentIndicesUsed.includes(f.index))
    : [];
  const zoneCount = plateFilaments.length;

  return (
    <>
      {/* Top-left: plate + zone count + orbit hint */}
      <div className="absolute top-3 left-3 flex flex-col gap-0.5 pointer-events-none select-none">
        <div className="text-tx2 text-[11px] font-mono">
          {currentPlateId != null ? `Plate ${currentPlateId}` : ''}
          {zoneCount > 0
            ? ` · ${zoneCount} color zone${zoneCount !== 1 ? 's' : ''}`
            : ''}
        </div>
        <div className="text-tx4 text-[10px] font-mono">
          drag to orbit · click a zone to recolor
        </div>
      </div>

      {/* Top-right: static camera info pills */}
      <div className="absolute top-3 right-3 flex items-center gap-1 pointer-events-none select-none">
        <span className="px-2 py-0.5 rounded bg-panel/70 backdrop-blur border border-line text-tx3 text-[10px] font-mono">
          Y-up
        </span>
        <span className="px-2 py-0.5 rounded bg-panel/70 backdrop-blur border border-line text-tx3 text-[10px] font-mono">
          perspective
        </span>
      </div>

      {/* Bottom-left: filament legend */}
      {plateFilaments.length > 0 && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 pointer-events-none select-none">
          {plateFilaments.map((f) => (
            <div key={f.index} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full border border-line2 flex-shrink-0"
                style={{ backgroundColor: f.currentColor }}
              />
              <span className="text-tx3 text-[10px] font-mono">
                {f.mix ? `Mix ${f.index}` : `F${f.index}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom-right: dimensions readout */}
      <DimensionsReadout />
    </>
  );
}
