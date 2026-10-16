import { useState } from 'react';
import { Logo } from './Logo';
import { PlatePills, PlateSelector } from './ZonePanel';
import { ColorPickerPanel } from './ColorPicker';
import { ExportButton } from './ExportButton';
import { CustomizerPanel } from './CustomizerPanel';
import { ViewportChrome } from './ViewportChrome';
import { DimensionsReadout } from './DimensionsReadout';
import { VersionToggle } from './VersionToggle';
import { ViewerCanvas } from '../viewer/ViewerCanvas';
import { useAppStore } from '../store/useAppStore';
import { usePersistentState } from '../hooks/usePersistentState';

type MobileTab = 'view' | 'colors' | 'export';

export function EditorScreen() {
  const reset = useAppStore((s) => s.reset);
  const file = useAppStore((s) => s.file);
  const [activeTab, setActiveTab] = useState<MobileTab>('view');
  const [panelWidth, setPanelWidth] = usePersistentState('cc.panelWidth', 392);
  const clampedPanelWidth = Math.min(640, Math.max(320, panelWidth));

  const onColumnDragDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add('select-none');

    const onMove = (moveEvent: PointerEvent) => {
      const width = window.innerWidth - moveEvent.clientX;
      setPanelWidth(Math.min(640, Math.max(320, width)));
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

  return (
    <div className="h-full bg-bg flex flex-col">
      {/* ── Desktop layout (lg+): top-bar + 2-col ── */}
      <div className="hidden lg:flex flex-col h-full">
        {/* Top bar */}
        <header className="flex-shrink-0 h-[54px] flex items-center gap-3 px-4 border-b border-line bg-panel z-10">
          {/* Wordmark */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Logo className="w-7 h-7 text-tx flex-shrink-0" />
            <span className="text-tx text-sm font-semibold whitespace-nowrap">
              Printproof
            </span>
          </div>

          <div className="w-px h-5 bg-line2 flex-shrink-0" />

          {/* Filename */}
          {file && (
            <span
              className="text-tx3 text-xs truncate max-w-[180px]"
              title={file.name}
            >
              {file.name}
            </span>
          )}

          {/* Plate pills */}
          <PlatePills />

          <div className="flex-1 min-w-0" />

          {/* Privacy badge */}
          <span className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-panel2 text-tx2 text-[11px] whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" style={{ animation: 'ccpulse 2s ease-in-out infinite' }} />
            Runs in your browser. Nothing uploaded.
          </span>

          {/* New file */}
          <button
            onClick={reset}
            className="flex-shrink-0 h-8 px-3 border border-line hover:border-line2 hover:bg-panel2 text-tx2 hover:text-tx text-xs rounded-md transition-colors active:scale-[0.98]"
          >
            New file
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Viewport: radial gradient bg to contrast the model */}
          <div
            className="flex-1 min-w-0 relative min-h-0"
            style={{ background: 'radial-gradient(ellipse at 50% 40%, #151B27 0%, #0C111A 100%)' }}
          >
            <ViewerCanvas />
            <ViewportChrome />
          </div>

          {/* Column resize handle */}
          <div
            onPointerDown={onColumnDragDown}
            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/40 transition-colors"
          />

          {/* Right panel */}
          <div
            style={{ width: clampedPanelWidth }}
            className="flex-shrink-0 h-full border-l border-line overflow-hidden"
          >
            <CustomizerPanel />
          </div>
        </div>
      </div>

      {/* ── Mobile layout (<lg): always-mounted canvas + tab overlays ── */}
      <div className="flex lg:hidden flex-col h-full">
        <div
          className="flex-1 relative min-h-0 touch-none"
          style={{ background: 'radial-gradient(ellipse at 50% 40%, #151B27 0%, #0C111A 100%)' }}
        >
          <ViewerCanvas />

          {/* View-tab chrome */}
          {activeTab === 'view' && (
            <>
              <button
                onClick={reset}
                className="absolute top-3 left-3 h-10 px-3 flex items-center bg-panel2/85 hover:bg-panel3/90 border border-line shadow-lg shadow-black/20 text-tx2 text-xs rounded-md backdrop-blur-sm transition-colors active:scale-[0.98]"
              >
                New file
              </button>
              <div className="absolute top-14 inset-x-0">
                <VersionToggle />
              </div>
              <DimensionsReadout />
            </>
          )}

          {/* Colors overlay */}
          <div
            className={`absolute inset-0 flex flex-col bg-panel ${activeTab !== 'colors' ? 'hidden' : ''}`}
          >
            <div className="min-h-0 flex-1 overflow-hidden border-b border-line">
              <PlateSelector />
            </div>
            <div className="flex-shrink-0 overflow-y-auto cc-scroll max-h-[45vh]">
              <div className="p-4">
                <ColorPickerPanel />
              </div>
            </div>
          </div>

          {/* Export overlay */}
          <div
            className={`absolute inset-0 overflow-y-auto cc-scroll bg-panel p-4 ${activeTab !== 'export' ? 'hidden' : ''}`}
          >
            <ExportButton />
          </div>
        </div>

        {/* Bottom tab bar */}
        <div className="flex-shrink-0 border-t border-line bg-panel flex">
          {(['view', 'colors', 'export'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 min-h-[48px] text-xs capitalize transition-colors ${
                activeTab === id
                  ? 'text-tx border-t-2 border-accent bg-panel2'
                  : 'text-tx3 hover:text-tx2'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
