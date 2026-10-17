// Browser-only: the scene an export should read.
//
// For a design 3MF, and for a G-code print small enough to show at full
// detail, that is the live viewer scene (registered by setExportScene), so the
// file always matches what the user sees. For a big print the viewer shows a
// budget-reduced mesh (BEAD_FACE_BUDGET_VIEWER); the download must not inherit
// that, so the stored toolpath is swept again in a worker at export detail and
// built into a throwaway group with the user's current colours, pivot and
// orientation, the same call the viewer uses.

import * as THREE from 'three';
import { buildSceneFromPlate } from '../lib/glbBuilder';
import { getExportScene } from '../lib/glbExporter';
import { BEAD_FACE_BUDGET_EXPORT } from '../lib/gcode/beads';
import { describeTier } from '../lib/parseGcode';
import { useAppStore } from '../store/useAppStore';
import { sweepGcodeInWorker } from '../workers/sweepGcodeInWorker';

export interface ExportSceneHandle {
  scene: THREE.Object3D;
  /** Human note on the detail level the file carries, or null when it is the full view. */
  note: string | null;
  /** Release the throwaway group (no-op for the live scene). */
  dispose: () => void;
}

/** True when the plate on screen was reduced by the viewer budget and has a toolpath to re-sweep. */
export function exportNeedsResweep(): boolean {
  const s = useAppStore.getState();
  const r = s.parseResult;
  return !!(r && r.sourceKind === 'gcode' && r.printInfo?.reducedDetail &&
    r.gcodeSource?.some((g) => g.plateId === s.currentPlateId));
}

export async function acquireExportScene(onProgress?: (message: string) => void): Promise<ExportSceneHandle> {
  const live = getExportScene();
  if (!exportNeedsResweep()) {
    if (!live) throw new Error('No scene to export');
    return { scene: live, note: null, dispose: () => {} };
  }
  const s = useAppStore.getState();
  const r = s.parseResult!;
  const src = r.gcodeSource!.find((g) => g.plateId === s.currentPlateId)!;
  onProgress?.('Building the print at full detail');
  const { chunks, stats } = await sweepGcodeInWorker(
    src.segments, src.filamentDiameter, { faceBudget: BEAD_FACE_BUDGET_EXPORT }, `plate${src.plateId}`,
  );
  const group = buildSceneFromPlate(chunks, s.filaments, {
    unitToMeters: r.unitToMeters,
    sourceUnit: r.sourceUnit,
    pivotMode: s.pivotMode,
    customPivotMm: s.customPivotMm,
    rotationQuat: s.rotationQuat,
  });
  const note = stats.tier.reduced
    ? `Exported at ${describeTier(stats.tier)}: the print is too large for full detail.`
    : 'Exported at full detail.';
  return {
    scene: group,
    note,
    dispose: () => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
    },
  };
}
