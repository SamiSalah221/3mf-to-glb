import { PlateSelector } from './ZonePanel';
import { ColorPickerPanel } from './ColorPicker';
import { ExportButton } from './ExportButton';
import { ViewerCanvas } from '../viewer/ViewerCanvas';
import { useAppStore } from '../store/useAppStore';

export function EditorScreen() {
  const reset = useAppStore((s) => s.reset);

  return (
    <div className="h-full flex flex-col lg:flex-row bg-slate-900">
      {/* Left sidebar: Plates + Color zones */}
      <div className="w-full lg:w-[260px] flex-shrink-0 lg:h-full h-[240px] overflow-hidden">
        <PlateSelector />
      </div>

      {/* Center: 3D Viewer */}
      <div className="flex-1 relative min-h-0">
        <ViewerCanvas />
        <button
          onClick={reset}
          className="absolute top-3 left-3 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs rounded-lg backdrop-blur transition-colors"
        >
          New File
        </button>
      </div>

      {/* Right sidebar: Color picker + Export */}
      <div className="w-full lg:w-[280px] flex-shrink-0 lg:h-full bg-slate-900 border-l border-slate-700 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <ColorPickerPanel />
        </div>
        <div className="p-4 border-t border-slate-700">
          <ExportButton />
        </div>
      </div>
    </div>
  );
}
