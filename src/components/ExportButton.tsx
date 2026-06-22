import { useState, useEffect } from 'react';
import { exportGLB, triggerBrowserDownload, buildGLBBytes, getExportScene } from '../lib/glbExporter';
import { buildUSDZBytes } from '../lib/usdzExporter';
import { exportRecolored3MF } from '../lib/build3MF';
import { detectArPlatform, launchQuickLook, launchWebXR, type ArPlatform } from '../lib/arLauncher';
import { useAppStore } from '../store/useAppStore';
import { RotationControls } from './RotationControls';

type ExportingState = null | 'glb' | '3mf' | 'ar';

export function ExportButton() {
  const [exporting, setExporting] = useState<ExportingState>(null);
  const [arPlatform, setArPlatform] = useState<ArPlatform>('desktop');
  const file = useAppStore((s) => s.file);
  const filaments = useAppStore((s) => s.filaments);

  useEffect(() => {
    setArPlatform(detectArPlatform());
  }, []);

  const baseName = (file?.name.replace(/\.3mf$/i, '') ?? 'model') + '-recolored';

  const handleExportGLB = async () => {
    setExporting('glb');
    try {
      await exportGLB(`${baseName}.glb`);
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
      triggerBrowserDownload(bytes, `${baseName}.3mf`, 'model/3mf');
    } catch (err) {
      console.error('3MF export failed:', err);
      window.alert('3MF export failed. See console for details.');
    } finally {
      setExporting(null);
    }
  };

  const handleViewInAR = async () => {
    const scene = getExportScene();
    if (!scene) return;
    setExporting('ar');
    try {
      if (arPlatform === 'ios') {
        const bytes = await buildUSDZBytes(scene);
        launchQuickLook(bytes, `${baseName}.usdz`);
      } else if (arPlatform === 'android') {
        const bytes = await buildGLBBytes(scene);
        await launchWebXR(bytes, `${baseName}.glb`);
      } else {
        // Desktop fallback: download the GLB and let the user load it in a
        // viewer of choice. The button label already advertises this.
        const bytes = await buildGLBBytes(scene);
        triggerBrowserDownload(bytes, `${baseName}.glb`, 'model/gltf-binary');
        window.alert(
          'AR Quick Look (iOS) and Scene Viewer (Android) only work on mobile. ' +
            'A GLB has been downloaded — drop it into a viewer like model-viewer or Blender.',
        );
      }
    } catch (err) {
      console.error('AR launch failed:', err);
      window.alert('AR launch failed. See console for details.');
    } finally {
      setExporting(null);
    }
  };

  const busy = exporting !== null;
  const arLabel =
    arPlatform === 'ios'
      ? 'View in AR (iOS Quick Look)'
      : arPlatform === 'android'
        ? 'View in AR (Android WebXR)'
        : 'View in AR (download GLB)';

  return (
    <div className="space-y-3">
      <RotationControls />
      <button
        onClick={handleViewInAR}
        disabled={busy}
        className="w-full py-4 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-lg transition-colors text-base"
      >
        {exporting === 'ar' ? 'Launching AR...' : arLabel}
      </button>
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
        title="Re-export the source 3MF with the new filament colors. The export pivot above is for GLB/USDZ only; the 3MF keeps the original print-bed position so it slices unchanged in OrcaSlicer / U1."
      >
        {exporting === '3mf' ? 'Exporting 3MF...' : 'Export 3MF (keeps colors, still sliceable)'}
      </button>
    </div>
  );
}
