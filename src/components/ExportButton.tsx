import { useExportActions } from '../hooks/useExportActions';
import { RotationControls } from './RotationControls';

/** Standalone export panel used on mobile (includes RotationControls). */
export function ExportButton() {
  const { handleExportGLB, handleExport3MF, handleViewInAR, arLabel, exporting, busy, file } =
    useExportActions();

  return (
    <div className="space-y-3">
      <RotationControls />
      <button
        onClick={handleViewInAR}
        disabled={busy}
        className="w-full py-3 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line2 text-tx text-sm font-mono font-medium rounded transition-colors"
      >
        {exporting === 'ar' ? 'Launching AR…' : arLabel}
      </button>
      <button
        onClick={handleExportGLB}
        disabled={busy}
        className="w-full py-3 bg-accent hover:opacity-90 disabled:opacity-40 text-bg text-sm font-mono font-semibold rounded transition-opacity"
      >
        {exporting === 'glb' ? 'Exporting GLB…' : 'Export GLB'}
      </button>
      <button
        onClick={handleExport3MF}
        disabled={busy || !file}
        className="w-full py-3 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line2 text-tx2 text-sm font-mono rounded transition-colors"
        title="Re-export the source 3MF with the new filament colors. The export pivot above is for GLB/USDZ only; the 3MF keeps the original print-bed position so it slices unchanged in OrcaSlicer / U1."
      >
        {exporting === '3mf' ? 'Exporting 3MF…' : 'Export 3MF (keeps colors, still sliceable)'}
      </button>
    </div>
  );
}
