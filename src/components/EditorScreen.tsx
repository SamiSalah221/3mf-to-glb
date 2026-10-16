import { useState } from 'react';
import { Logo } from './Logo';
import { PlatePills } from './ZonePanel';
import { ViewportChrome } from './ViewportChrome';
import { DimensionsReadout } from './DimensionsReadout';
import { ViewerCanvas } from '../viewer/ViewerCanvas';
import { useAppStore } from '../store/useAppStore';
import { usePersistentState } from '../hooks/usePersistentState';
import { useVersionInfo } from '../hooks/useVersionInfo';
import { Caps, ColorBar, ProofSheet, StepNav } from './proof/primitives';
import { STEPS, type Step } from './proof/constants';
import { ColorTicket, ProofTicket, SignOffTicket } from './proof/Tickets';
import { VersionSwitch } from './proof/VersionSwitch';
import { OrientPanel } from './proof/OrientPanel';

type MobileTab = 'view' | Step;

/** "Design proof" / "Press proof" plus the zone count, the sheet's caption. */
function SheetCaption() {
  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const plate = parseResult?.plates.find((p) => p.id === currentPlateId);
  const zones = plate?.filamentIndicesUsed.length ?? 0;
  const printed = parseResult?.sourceKind === 'gcode';
  return (
    <Caps>
      {printed ? 'Press proof (.gcode)' : 'Design proof (.3mf)'} · {zones} color zone{zones === 1 ? '' : 's'}
    </Caps>
  );
}

/** The 3D view on its proof sheet: caption, version switch, size, viewport (with Orient), color bar. */
function Sheet({
  compact = false,
  orientOpen,
  setOrientOpen,
}: {
  compact?: boolean;
  orientOpen: boolean;
  setOrientOpen: (open: boolean) => void;
}) {
  const { both } = useVersionInfo();
  return (
    <ProofSheet
      label="Proof"
      strong={both}
      markSize={compact ? 12 : 20}
      className={`flex-1 flex flex-col min-h-0 min-w-0 ${compact ? 'p-6 gap-2.5' : 'p-8 gap-3.5'}`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SheetCaption />
        <div className="flex items-center gap-3 flex-wrap">
          {!compact && <DimensionsReadout inline />}
          <VersionSwitch compact={compact} />
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-stage border-y border-line touch-none">
        <ViewerCanvas />
        <ViewportChrome />
        <button
          type="button"
          aria-expanded={orientOpen}
          onClick={() => setOrientOpen(!orientOpen)}
          className={`absolute left-3 bottom-3 z-10 h-9 px-3 flex items-center gap-2 border font-mono text-[11px] tracking-[0.06em] transition-colors ${
            orientOpen ? 'bg-tx text-bg border-tx' : 'bg-panel/90 text-tx border-line hover:border-tx'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-3-6.2M20 4v4h-4" />
          </svg>
          ORIENT
        </button>
        {orientOpen && <OrientPanel onClose={() => setOrientOpen(false)} />}
      </div>
      {compact && <DimensionsReadout inline />}
      <ColorBar height={compact ? 48 : 64} />
    </ProofSheet>
  );
}

/** "SIZE CHANGED" strip, shown when the slicer scaled the part. */
function ScaleBanner() {
  const { both, scaleText } = useVersionInfo();
  if (!both || !scaleText) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap px-6 lg:px-8 py-2.5 bg-panel border-b border-line text-[14px]">
      <span className="font-mono text-[12px] px-2 py-1 bg-accent text-accent-fg">SIZE CHANGED</span>
      <span>
        The G-code prints this part at <strong className="font-semibold">{scaleText}</strong> of the design. The press proof is the true size.
      </span>
    </div>
  );
}

function Ticket({ step, onStep, onOrient }: { step: Step; onStep: (s: Step) => void; onOrient: () => void }) {
  if (step === 'color') return <ColorTicket onStep={onStep} />;
  if (step === 'proof') return <ProofTicket onStep={onStep} />;
  return <SignOffTicket onOrient={onOrient} />;
}

export function EditorScreen() {
  const reset = useAppStore((s) => s.reset);
  const file = useAppStore((s) => s.file);
  const versions = useAppStore((s) => s.versions);
  const plateCount = useAppStore((s) => s.parseResult?.plates.length ?? 0);
  const [step, setStep] = useState<Step>('color');
  const [mobileTab, setMobileTab] = useState<MobileTab>('view');
  // Orientation tools live on the sheet, open from any step.
  const [orientOpen, setOrientOpen] = useState(false);
  const openOrient = () => {
    setOrientOpen(true);
    setMobileTab('view');
  };
  const [panelWidth, setPanelWidth] = usePersistentState('cc.panelWidth', 400);
  const clampedPanelWidth = Math.min(640, Math.max(340, panelWidth));

  const goStep = (s: Step) => {
    setStep(s);
    setMobileTab(s);
  };

  const onColumnDragDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add('select-none');
    const onMove = (moveEvent: PointerEvent) => {
      setPanelWidth(Math.min(640, Math.max(340, window.innerWidth - moveEvent.clientX)));
    };
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      document.body.classList.remove('select-none');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const fileLabel = (
    <span className="flex items-center gap-2 min-w-0">
      {file && (
        <span className="font-mono text-[13px] truncate max-w-[240px]" title={file.name}>
          {file.name}
        </span>
      )}
      {versions.model && versions.printed && (
        <span className="font-mono text-[13px] text-tx2 whitespace-nowrap">+ G-code</span>
      )}
    </span>
  );

  return (
    <div className="h-full bg-bg text-tx flex flex-col">
      {/* ── Desktop (lg+) ── */}
      <div className="hidden lg:flex flex-col h-full">
        <header className="flex-shrink-0 flex items-center gap-4 px-6 lg:px-8 py-3 border-b border-line">
          <div className="flex items-center gap-3 flex-shrink-0">
            <Logo className="w-7 h-7 text-tx" />
            <span className="font-bold text-[17px]">Printproof</span>
          </div>
          <span className="w-px h-5 bg-line flex-shrink-0" />
          {fileLabel}
          {plateCount > 1 && <PlatePills />}
          <div className="flex-1 min-w-0" />
          <StepNav step={step} onStep={goStep} />
          <button
            type="button"
            onClick={reset}
            className="flex-shrink-0 h-9 px-3.5 border border-line3 hover:border-tx text-tx text-[13px] font-medium transition-colors"
          >
            New job
          </button>
        </header>

        <ScaleBanner />

        <div className="flex-1 flex min-h-0 gap-0 p-6 lg:p-8">
          <div className="flex-1 min-w-0 flex flex-col">
            <Sheet orientOpen={orientOpen} setOrientOpen={setOrientOpen} />
          </div>
          <div
            onPointerDown={onColumnDragDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the job ticket"
            className="w-6 flex-shrink-0 cursor-col-resize flex justify-center group"
          >
            <span className="w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" />
          </div>
          <aside
            aria-label="Job ticket"
            style={{ width: clampedPanelWidth }}
            className="flex-shrink-0 h-full overflow-y-auto cc-scroll flex flex-col [&>div]:flex-1"
          >
            <Ticket step={step} onStep={goStep} onOrient={openOrient} />
          </aside>
        </div>
      </div>

      {/* ── Mobile (<lg) ── */}
      <div className="flex lg:hidden flex-col h-full">
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <span className="flex items-center gap-2">
            <Logo className="w-6 h-6 text-tx" />
            <span className="font-bold text-[16px]">Printproof</span>
          </span>
          <button
            type="button"
            onClick={reset}
            className="h-10 px-3 border border-line3 text-tx text-[13px] font-medium"
          >
            New job
          </button>
        </header>
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 pt-2.5">
          {fileLabel}
          {plateCount > 1 && <PlatePills />}
        </div>
        <ScaleBanner />

        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 flex flex-col p-4">
            <Sheet compact orientOpen={orientOpen} setOrientOpen={setOrientOpen} />
          </div>
          {mobileTab !== 'view' && (
            <div className="absolute inset-0 z-20 overflow-y-auto cc-scroll bg-bg p-4 flex flex-col [&>div]:flex-1">
              <Ticket step={mobileTab} onStep={goStep} onOrient={openOrient} />
            </div>
          )}
        </div>

        <nav aria-label="Job steps" className="flex-shrink-0 grid grid-cols-4 border-t border-line bg-panel">
          {(['view', ...STEPS.map((s) => s.id)] as MobileTab[]).map((id) => {
            // The first tab is the sheet itself: the model, with its Orient tools.
            const label = id === 'view' ? 'Orient' : STEPS.find((s) => s.id === id)!.label;
            const active = mobileTab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => (id === 'view' ? (mobileTab === 'view' ? setOrientOpen(!orientOpen) : openOrient()) : goStep(id))}
                className={`min-h-[52px] font-mono text-[12px] uppercase transition-colors ${
                  active ? 'bg-tx text-bg' : 'text-tx2 hover:text-tx'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
