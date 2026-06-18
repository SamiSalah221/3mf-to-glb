import { useState } from 'react';
import { PlateSelector } from './ZonePanel';
import { ColorPickerPanel } from './ColorPicker';
import { ExportButton } from './ExportButton';
import { DimensionsReadout } from './DimensionsReadout';
import { ViewerCanvas } from '../viewer/ViewerCanvas';
import { useAppStore } from '../store/useAppStore';

type MobileTab = 'view' | 'colors' | 'export';

export function EditorScreen() {
  const reset = useAppStore((s) => s.reset);
  const [activeTab, setActiveTab] = useState<MobileTab>('view');

  return (
    <div className="h-full bg-slate-900">
      {/* ── Desktop layout (lg+): unchanged 3-panel flex row ── */}
      <div className="hidden lg:flex h-full">
        <div className="w-[260px] flex-shrink-0 h-full overflow-hidden">
          <PlateSelector />
        </div>
        <div className="flex-1 relative min-h-0">
          <ViewerCanvas />
          <button
            onClick={reset}
            className="absolute top-3 left-3 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs rounded-lg backdrop-blur transition-colors"
          >
            New File
          </button>
          <DimensionsReadout />
        </div>
        <div className="w-[280px] flex-shrink-0 h-full bg-slate-900 border-l border-slate-700 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <ColorPickerPanel />
          </div>
          <div className="p-4 border-t border-slate-700">
            <ExportButton />
          </div>
        </div>
      </div>

      {/* ── Mobile layout (<lg): canvas always mounted, panels overlay via CSS ── */}
      <div className="flex lg:hidden flex-col h-full">
        {/* Canvas + overlay panels — canvas is never hidden so WebGL stays alive */}
        <div className="flex-1 relative min-h-0 touch-none">
          <ViewerCanvas />

          {/* View-tab chrome */}
          {activeTab === 'view' && (
            <>
              <button
                onClick={reset}
                className="absolute top-3 left-3 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs rounded-lg backdrop-blur transition-colors"
              >
                New File
              </button>
              <DimensionsReadout />
            </>
          )}

          {/* Colors overlay — slides over canvas, PlateSelector takes upper flex section */}
          <div
            className={`absolute inset-0 flex flex-col bg-slate-900 ${activeTab !== 'colors' ? 'hidden' : ''}`}
          >
            <div className="min-h-0 flex-1 overflow-hidden border-b border-slate-700">
              <PlateSelector />
            </div>
            <div className="flex-shrink-0 overflow-y-auto max-h-[45vh]">
              <ColorPickerPanel />
            </div>
          </div>

          {/* Export overlay */}
          <div
            className={`absolute inset-0 overflow-y-auto bg-slate-900 p-4 ${activeTab !== 'export' ? 'hidden' : ''}`}
          >
            <ExportButton />
          </div>
        </div>

        {/* Bottom tab bar */}
        <div className="flex-shrink-0 border-t border-slate-700 bg-slate-900 flex">
          {(['view', 'colors', 'export'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 min-h-[48px] text-sm font-medium capitalize transition-colors ${
                activeTab === id
                  ? 'text-emerald-400 border-t-2 border-emerald-400 bg-slate-800'
                  : 'text-slate-400 hover:text-slate-200'
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
