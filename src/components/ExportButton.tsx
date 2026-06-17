import { useState } from 'react';
import { exportGLB, triggerBrowserDownload } from '../lib/glbExporter';
import { exportRecolored3MF } from '../lib/build3MF';
import { useAppStore } from '../store/useAppStore';

export function ExportButton() {
  const [exporting, setExporting] = useState<null | 'glb' | '3mf'>(null);
  const file = useAppStore((s) => s.file);
  const filaments = useAppStore((s) => s.filaments);

  const handleExportGLB = async () => {
    setExporting('glb');
    try {
      await exportGLB();
    } catch (err) {
      console.error('GLB export failed:', err);
      window.alert('GLB export failed. See console for details.');
    } finally {
      setExporting(null);
    }
  };

  const handleExport3MF = async () => {
    if (!file) return;
    setExporting('3mf');
    try {
      const buf = await file.arrayBuffer();
      const mapping = Object.fromEntries(filaments.map((f) => [f.index, f.currentColor]));
      const bytes = await exportRecolored3MF(buf, mapping);
      const outName = file.name.replace(/\.3mf$/i, '') + '-recolored.3mf';
      triggerBrowserDownload(bytes, outName, 'model/3mf');
    } catch (err) {
      console.error('3MF export failed:', err);
      window.alert('3MF export failed. See console for details.');
    } finally {
      setExporting(null);
    }
  };

  const busy = exporting !== null;
  return (
    <div className="space-y-2">
      <button
        onClick={handleExportGLB}
        disabled={busy}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-lg transition-colors text-sm"
      >
        {exporting === 'glb' ? 'Exporting GLB...' : 'Export as GLB'}
      </button>
      <button
        onClick={handleExport3MF}
        disabled={busy || !file}
        className="w-full py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-lg transition-colors text-sm"
        title="Re-export the source 3MF with the new filament colors. Drops back into OrcaSlicer / U1 with zones intact."
      >
        {exporting === '3mf' ? 'Exporting 3MF...' : 'Export as 3MF (re-tint)'}
      </button>
    </div>
  );
}
