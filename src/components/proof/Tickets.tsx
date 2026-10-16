import * as THREE from 'three';
import { useAppStore } from '../../store/useAppStore';
import { useExportActions } from '../../hooks/useExportActions';
import { useVersionInfo } from '../../hooks/useVersionInfo';
import { useAddVersion } from '../../hooks/useOpenFiles';
import { ColorPickerPanel } from '../ColorPicker';
import { SwatchSquare } from '../SwatchSquare';
import { ColorBar, FilePickButton, TicketHeading } from './primitives';
import { PRIMARY, SECONDARY, type Step } from './constants';
import { PivotSelect } from './OrientPanel';

const PRESETS = [
  '#FFFFFF', '#E8EAEE', '#9BA2AC', '#000000',
  '#FF3B30', '#FF9500', '#FFCC00', '#B8DE4A',
  '#34C759', '#00C7BE', '#007AFF', '#AF52DE',
];

function NextButton({ to, onStep, children }: { to: Step; onStep: (s: Step) => void; children: string }) {
  return (
    <button type="button" onClick={() => onStep(to)} className={`${PRIMARY} w-full`}>
      {children}
    </button>
  );
}

/** Step 2: the zones and the recolor box for the selected one. */
export function ColorTicket({ onStep }: { onStep: (s: Step) => void }) {
  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const filaments = useAppStore((s) => s.filaments);
  const selected = useAppStore((s) => s.selectedFilamentIndex);
  const selectFilament = useAppStore((s) => s.selectFilament);
  const setFilamentColor = useAppStore((s) => s.setFilamentColor);
  const resetColors = useAppStore((s) => s.resetColors);
  const { missing } = useAddVersion();

  const plate = parseResult?.plates.find((p) => p.id === currentPlateId);
  const used = plate ? filaments.filter((f) => plate.filamentIndicesUsed.includes(f.index)) : [];
  const faces = (index: number) =>
    plate ? plate.meshChunks.filter((c) => c.filamentIndex === index).reduce((n, c) => n + c.faceCount, 0) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <TicketHeading>Job ticket · Color</TicketHeading>
        <button type="button" onClick={resetColors} className="text-[13px] font-medium text-accent hover:text-accent-hover pb-2.5">
          Reset all
        </button>
      </div>

      <div className="flex flex-col">
        {used.map((f) => {
          const isSel = selected === f.index;
          return (
            <button
              key={f.index}
              type="button"
              aria-pressed={isSel}
              onClick={() => selectFilament(isSel ? null : f.index)}
              className={`grid grid-cols-[28px_1fr_auto] gap-3 items-center py-3 text-left transition-colors ${
                isSel ? 'px-2.5 -mx-2.5 bg-panel border-[1.5px] border-tx' : 'border-b border-line hover:bg-panel3'
              }`}
            >
              <span className="w-7 h-7 [&>div]:w-7 [&>div]:h-7">
                <SwatchSquare filament={f} filaments={filaments} />
              </span>
              <span className="flex flex-col">
                <span className="font-semibold text-[15px] flex items-center gap-2">
                  {f.mix ? `Mix ${f.index}` : `Filament ${f.index}`}
                  {f.currentColor !== f.originalColor && (
                    <span className="w-1.5 h-1.5 rounded-full bg-warn" title="Color changed" />
                  )}
                </span>
                <span className="font-mono text-[12px] text-tx2">
                  {f.mix ? `F${f.mix.sources[0]} + F${f.mix.sources[1]}` : f.currentColor}
                </span>
              </span>
              <span className="font-mono text-[12px] text-tx2">{faces(f.index).toLocaleString()} faces</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 p-4 bg-panel border border-line">
        <ColorPickerPanel />
        {selected != null && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] tracking-[0.08em] text-tx2">FILAMENT PRESETS</span>
            <div className="grid grid-cols-6 gap-1.5">
              {PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setFilamentColor(selected, hex)}
                  title={hex}
                  aria-label={`Set color to ${hex}`}
                  className="aspect-square border border-line2 hover:border-tx transition-colors"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2.5">
        <NextButton to="proof" onStep={onStep}>Next: proof</NextButton>
        {missing === 'printed' && (
          <span className="text-[13px] text-tx2 text-center">Add the sliced G-code to see the press proof.</span>
        )}
      </div>
    </div>
  );
}

/** Step 3: what the print is, how it relates to the design, and adding the missing version. */
export function ProofTicket({ onStep }: { onStep: (s: Step) => void }) {
  const { both, scaleText, printInfo, versions } = useVersionInfo();
  const { missing, add, busy, error } = useAddVersion();
  const facts: [string, string | undefined][] = [
    ['Slicer', printInfo?.slicer],
    ['Nozzle', printInfo?.nozzleMm != null ? `${printInfo.nozzleMm} mm` : undefined],
    ['Layers', printInfo?.layers != null
      ? `${printInfo.layers}${printInfo.layerHeightMm ? ` × ${printInfo.layerHeightMm} mm` : ''}`
      : undefined],
    ['Time', printInfo?.estimatedTime],
  ];

  return (
    <div className="flex flex-col gap-5">
      <TicketHeading>Job ticket · Print</TicketHeading>

      {missing && (
        <div className="flex flex-col gap-3 p-4 bg-panel border border-line">
          <span className="font-semibold text-[15px]">
            {missing === 'printed' ? 'Add the press proof' : 'Add the design proof'}
          </span>
          <span className="text-[14px] text-tx2 leading-relaxed">
            {missing === 'printed'
              ? 'Open the sliced G-code of this part (.gcode or .gcode.3mf) to see it as it will print, every layer line included, next to the design.'
              : 'Open the design .3mf this G-code was sliced from to compare the two.'}
          </span>
          <FilePickButton
            accept={missing === 'printed' ? '.gcode,.3mf' : '.3mf'}
            onPick={(files) => void add(files[0])}
            disabled={busy !== null}
            className={`${SECONDARY} w-full`}
          >
            {busy && <span className="w-3.5 h-3.5 border-2 border-line3 border-t-accent rounded-full animate-spin" aria-hidden="true" />}
            {busy ?? (missing === 'printed' ? 'Add sliced G-code' : 'Add design 3MF')}
          </FilePickButton>
          {error && <span className="text-[13px] text-accent">{error}</span>}
        </div>
      )}

      {versions.printed && (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
          {facts.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-tx2">{k}</dt>
              <dd className="m-0 font-mono text-[13px]">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {both && (
        <div className="flex flex-col gap-2 pt-4 border-t border-line text-[14px] leading-relaxed">
          {scaleText ? (
            <span>
              The G-code prints this part at <strong className="font-semibold">{scaleText}</strong> of the design. The press proof is the true size.
            </span>
          ) : (
            <span className="text-tx2">The G-code prints the part at the design's size.</span>
          )}
        </div>
      )}

      <ColorBar height={36} interactive={false} />
      <span className="text-[13px] text-tx2 -mt-3">Colors are shared: recolor once, both proofs follow.</span>

      <div className="mt-auto">
        <NextButton to="signoff" onStep={onStep}>Next: sign off</NextButton>
      </div>
    </div>
  );
}

/** XYZ Euler degrees, the same convention as the Orient panel's fields. */
function eulerDegLabel(q: [number, number, number, number]): string {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q[0], q[1], q[2], q[3]).normalize(), 'XYZ');
  return [e.x, e.y, e.z].map((r) => `${Math.round(THREE.MathUtils.radToDeg(r))}°`).join(' · ');
}

/** Step 4: which proof, where it sits in AR, and the outputs. */
export function SignOffTicket({ onOrient }: { onOrient: () => void }) {
  const { both, viewMode } = useVersionInfo();
  const setViewMode = useAppStore((s) => s.setViewMode);
  const rotationQuat = useAppStore((s) => s.rotationQuat);
  const { handleExportGLB, handleExportOBJ, handleExport3MF, handleViewInAR, arLabel, exporting, busy, can3MF } =
    useExportActions();

  const card = 'bg-panel border border-line p-4 flex flex-col gap-2.5';
  const spinner = <span className="w-3.5 h-3.5 border-2 border-line3 border-t-accent rounded-full animate-spin" aria-hidden="true" />;

  return (
    <div className="flex flex-col gap-5">
      <TicketHeading>Job ticket · Sign off</TicketHeading>

      {both && (
        <div role="radiogroup" aria-label="Export which proof" className="grid grid-cols-2 border-[1.5px] border-tx">
          {(['model', 'printed'] as const).map((m, i) => (
            <label
              key={m}
              className={`flex gap-2.5 items-center p-3 text-[14px] cursor-pointer ${i === 0 ? 'border-r-[1.5px] border-tx' : ''} ${
                viewMode === m ? 'bg-tx text-bg font-semibold' : 'hover:bg-panel3'
              }`}
            >
              <input
                type="radio"
                name="signoff-version"
                checked={viewMode === m}
                onChange={() => setViewMode(m)}
                className="w-4 h-4 accent-[#0E0F12]"
              />
              {m === 'model' ? 'A · Design' : 'B · As printed'}
            </label>
          ))}
        </div>
      )}

      <div className={card}>
        <div className="flex items-baseline justify-between">
          <span className="text-[22px] font-bold">GLB</span>
          <span className="font-mono text-[12px] text-tx2">web · Blender</span>
        </div>
        <span className="text-[14px] text-tx2 leading-relaxed">True size in metres, one material per filament.</span>
        <button type="button" onClick={handleExportGLB} disabled={busy} className={`${PRIMARY} h-11`}>
          {exporting === 'glb' && spinner}Export GLB
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <span className="text-[18px] font-bold">AR</span>
          <span className="text-[13px] text-tx2 leading-relaxed">At true size in your room.</span>
          <button type="button" onClick={handleViewInAR} disabled={busy} title={arLabel} className={`${SECONDARY} h-11 mt-auto`}>
            {exporting === 'ar' && spinner}View in AR
          </button>
        </div>
        <div className={card}>
          <span className="text-[18px] font-bold">OBJ</span>
          <span className="text-[13px] text-tx2 leading-relaxed">Colors on the vertices, one file.</span>
          <button type="button" onClick={handleExportOBJ} disabled={busy} className={`${SECONDARY} h-11 mt-auto`}>
            {exporting === 'obj' && spinner}Export OBJ
          </button>
        </div>
      </div>

      <div className={`${card} ${can3MF ? '' : 'border-dashed border-line2 bg-transparent'}`}>
        <div className="flex items-baseline justify-between">
          <span className={`text-[18px] font-bold ${can3MF ? '' : 'text-tx2'}`}>3MF</span>
          <span className="font-mono text-[12px] text-tx2">design only</span>
        </div>
        <span className="text-[13px] text-tx2 leading-relaxed">
          {can3MF
            ? 'Re-tints the source 3MF with your colors. It still slices.'
            : 'Re-tints the design file, so it works on proof A.'}
        </span>
        <button type="button" onClick={handleExport3MF} disabled={busy || !can3MF} className={`${SECONDARY} h-11`}>
          {exporting === '3mf' && spinner}Export 3MF
        </button>
      </div>

      <PivotSelect id="signoff-pivot" />

      <div className="flex items-center justify-between gap-3 pt-4 border-t border-line">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[14px]">Orientation</span>
          <span className="font-mono text-[12px] text-tx2">X · Y · Z = {eulerDegLabel(rotationQuat)}</span>
        </div>
        <button type="button" onClick={onOrient} className={`${SECONDARY} h-10 px-4 text-[13px]`}>
          Adjust
        </button>
      </div>
    </div>
  );
}
