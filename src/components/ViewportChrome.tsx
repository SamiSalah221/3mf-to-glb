import { useAppStore } from '../store/useAppStore';
import { DimensionsReadout } from './DimensionsReadout';
import { SwatchSquare } from './SwatchSquare';
import { VersionToggle } from './VersionToggle';

/** Floating overlay pieces rendered on top of the 3D viewport. */
export function ViewportChrome() {
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const parseResult = useAppStore((s) => s.parseResult);
  const filaments = useAppStore((s) => s.filaments);
  const cameraProjection = useAppStore((s) => s.cameraProjection);
  const setCameraProjection = useAppStore((s) => s.setCameraProjection);
  const orbitHintSeen = useAppStore((s) => s.orbitHintSeen);

  const currentPlate = parseResult?.plates.find((p) => p.id === currentPlateId);
  const plateFilaments = currentPlate
    ? filaments.filter((f) => currentPlate.filamentIndicesUsed.includes(f.index))
    : [];
  const zoneCount = plateFilaments.length;

  const isOrtho = cameraProjection === 'orthographic';

  return (
    <>
      {/* Top-left: plate + zone count + orbit hint */}
      <div className="absolute top-3 left-3 flex flex-col gap-0.5 pointer-events-none select-none">
        {currentPlateId != null && (
          <div className="text-tx2 text-[12px] font-medium">Plate {currentPlateId}</div>
        )}
        {zoneCount > 0 && (
          <div className="text-tx3 text-[11px]">
            {zoneCount} color zone{zoneCount !== 1 ? 's' : ''}
          </div>
        )}
        {!orbitHintSeen && (
          <div className="text-tx3 text-[11px] mt-1">Drag to orbit. Click a zone to recolor.</div>
        )}
      </div>

      {/* Bottom-right (above the dimensions chip): projection toggle. The
          top-right corner is reserved for the axis gizmo. */}
      <div className="absolute bottom-16 right-3 flex items-center justify-end select-none">
        <button
          type="button"
          onClick={() => setCameraProjection(isOrtho ? 'perspective' : 'orthographic')}
          title={isOrtho ? 'Switch to perspective' : 'Switch to orthographic'}
          className="pointer-events-auto flex items-center gap-1.5 px-2 py-1 rounded-md bg-panel2/85 hover:bg-panel3/90 backdrop-blur-sm border border-line shadow-lg shadow-black/20 text-tx2 hover:text-tx hover:border-line2 text-[11px] transition-colors active:scale-[0.98]"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" />
            <path d="M3 7l9 4.5L21 7" />
            <path d="M12 11.5V21.5" />
          </svg>
          {isOrtho ? 'Orthographic' : 'Perspective'}
        </button>
      </div>

      {/* Bottom-left: filament legend */}
      {plateFilaments.length > 0 && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 pointer-events-none select-none">
          {plateFilaments.map((f) => (
            <div key={f.index} className="flex items-center gap-1.5">
              <SwatchSquare filament={f} filaments={filaments} size="sm" />
              <span className="text-tx2 text-[12px]">
                {f.mix ? `Mix ${f.index}` : `F${f.index}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Top-center: Model / As printed */}
      <VersionToggle />

      {/* Bottom-right: dimensions readout */}
      <DimensionsReadout />
    </>
  );
}
