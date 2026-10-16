import { useExportActions } from '../hooks/useExportActions';

const ACTION_LABEL: Record<'glb' | 'obj' | '3mf' | 'ar', string> = {
  glb: 'Exporting GLB…',
  obj: 'Exporting OBJ…',
  '3mf': 'Exporting 3MF…',
  ar: 'Launching AR…',
};

/**
 * Shared export controls used by both the desktop footer (CustomizerPanel)
 * and the mobile export tab (previously ExportButton). A single honest
 * source of truth: the "busy" state and label come straight from
 * useExportActions, no simulated percentage. Two layouts share the same
 * underlying state and copy so they can no longer drift or disagree.
 */
export function ExportActions({ layout }: { layout: 'row' | 'stack' }) {
  const { handleExportGLB, handleExportOBJ, handleExport3MF, handleViewInAR, arLabel, exporting, busy, can3MF } =
    useExportActions();

  const bar = busy && (
    <div
      role="status"
      aria-live="polite"
      className="space-y-1"
    >
      <div className="text-tx3 text-[11px]">{ACTION_LABEL[exporting!]}</div>
      <div className="h-0.5 bg-panel3 rounded-full overflow-hidden">
        <div className="h-full w-1/4 bg-accent rounded-full" style={{ animation: 'ccindeterminate 1.1s ease-in-out infinite' }} />
      </div>
    </div>
  );

  if (layout === 'stack') {
    return (
      <div className="space-y-3">
        {bar}
        <button
          onClick={handleExportGLB}
          disabled={busy}
          className="w-full h-12 bg-accent hover:bg-accent-hover active:bg-accent-active disabled:opacity-40 text-accent-fg text-sm font-semibold rounded-md transition-colors active:scale-[0.98]"
        >
          Export GLB
        </button>
        <button
          onClick={handleViewInAR}
          disabled={busy}
          className="w-full h-12 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line hover:border-line2 text-tx text-sm font-medium rounded-md transition-colors active:scale-[0.98]"
        >
          {arLabel}
        </button>
        <button
          onClick={handleExportOBJ}
          disabled={busy}
          className="w-full h-12 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line hover:border-line2 text-tx text-sm font-medium rounded-md transition-colors active:scale-[0.98]"
          title="One Wavefront OBJ with the colors baked onto the vertices (v x y z r g b). Opens with color in MeshMixer, Bambu Studio, and Blender. No separate material file to keep track of."
        >
          Export OBJ (vertex colors)
        </button>
        <button
          onClick={handleExport3MF}
          disabled={busy || !can3MF}
          className="w-full h-12 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line hover:border-line2 text-tx text-sm font-medium rounded-md transition-colors active:scale-[0.98]"
          title={can3MF
            ? 'Re-export the source 3MF with the new filament colors. The export pivot above is for GLB/USDZ only; the 3MF keeps the original print-bed position so it slices unchanged in OrcaSlicer / U1.'
            : 'Available for .3mf files. This model was built from G-code, so there is no source 3MF to re-tint.'}
        >
          Export 3MF (keeps colors, still sliceable)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {bar}
      <div className="flex gap-2">
        <button
          onClick={handleExportGLB}
          disabled={busy}
          className="flex-1 h-10 bg-accent hover:bg-accent-hover active:bg-accent-active disabled:opacity-40 text-accent-fg text-sm font-semibold rounded-md transition-colors active:scale-[0.98]"
        >
          Export GLB
        </button>
        <button
          onClick={handleViewInAR}
          disabled={busy}
          title={arLabel}
          className="flex items-center gap-1.5 px-3.5 h-10 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line hover:border-line2 text-tx text-xs font-medium rounded-md transition-colors active:scale-[0.98]"
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
          AR
        </button>
        <button
          onClick={handleExportOBJ}
          disabled={busy}
          title="One Wavefront OBJ with the colors baked onto the vertices (v x y z r g b). Opens with color in MeshMixer, Bambu Studio, and Blender. No separate material file to keep track of."
          className="px-3.5 h-10 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line hover:border-line2 text-tx text-xs font-medium rounded-md transition-colors active:scale-[0.98]"
        >
          OBJ
        </button>
        <button
          onClick={handleExport3MF}
          disabled={busy || !can3MF}
          title={can3MF ? 'Re-export the source 3MF with the new filament colors.' : 'Available for .3mf files. This model was built from G-code.'}
          className="px-3.5 h-10 bg-panel2 hover:bg-panel3 disabled:opacity-40 border border-line hover:border-line2 text-tx text-xs font-medium rounded-md transition-colors active:scale-[0.98]"
        >
          3MF
        </button>
      </div>
    </div>
  );
}
