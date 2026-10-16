import { useState, useEffect } from 'react';
import { exportGLB, triggerBrowserDownload, buildGLBBytes, getExportScene } from '../lib/glbExporter';
import { buildUSDZBytes } from '../lib/usdzExporter';
import { buildOBJBytes } from '../lib/objExporter';
import { exportRecolored3MF } from '../lib/build3MF';
import { detectArPlatform, launchQuickLook, launchWebXR, type ArPlatform } from '../lib/arLauncher';
import { useAppStore } from '../store/useAppStore';

type ExportingState = null | 'glb' | 'obj' | '3mf' | 'ar';

export function useExportActions() {
  const [exporting, setExporting] = useState<ExportingState>(null);
  const [arPlatform, setArPlatform] = useState<ArPlatform>('desktop');
  const file = useAppStore((s) => s.file);
  const filaments = useAppStore((s) => s.filaments);

  useEffect(() => {
    setArPlatform(detectArPlatform());
  }, []);

  const isGcode = useAppStore((s) => s.parseResult?.sourceKind === 'gcode');
  const baseName = isGcode
    ? (file?.name.replace(/(\.gcode)?\.3mf$|\.gcode$/i, '') ?? 'model') + '-as-printed'
    : (file?.name.replace(/\.3mf$/i, '') ?? 'model') + '-recolored';

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

  const handleExportOBJ = async () => {
    const scene = getExportScene();
    if (!scene) return;
    setExporting('obj');
    try {
      // One self-contained .obj: colors ride on the vertices (v x y z r g b),
      // so there is no .mtl to keep alongside it.
      const bytes = buildOBJBytes(scene);
      triggerBrowserDownload(bytes, `${baseName}.obj`, 'model/obj');
    } catch (err) {
      console.error('OBJ export failed:', err);
      window.alert('OBJ export failed. See console for details.');
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
        const bytes = await buildGLBBytes(scene);
        triggerBrowserDownload(bytes, `${baseName}.glb`, 'model/gltf-binary');
        window.alert(
          'AR Quick Look (iOS) and WebXR (Android) only work on mobile. ' +
            'A GLB has been downloaded. Drop it into a viewer like model-viewer or Blender.',
        );
      }
    } catch (err) {
      console.error('AR launch failed:', err);
      window.alert('AR launch failed. See console for details.');
    } finally {
      setExporting(null);
    }
  };

  const arLabel =
    arPlatform === 'ios'
      ? 'View in AR (iOS Quick Look)'
      : arPlatform === 'android'
        ? 'View in AR (Android WebXR)'
        : 'View in AR (download GLB)';

  return {
    handleExportGLB,
    handleExportOBJ,
    handleExport3MF,
    handleViewInAR,
    arLabel,
    exporting,
    busy: exporting !== null,
    file,
    /** 3MF write-back re-tints the source 3MF; a G-code source has none. */
    can3MF: !!file && !isGcode,
  };
}
