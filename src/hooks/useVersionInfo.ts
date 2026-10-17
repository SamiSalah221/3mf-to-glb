import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ParseResult } from '../types';

/** Bounding-box size of a plate in millimetres, largest first (ignores bed rotation). */
function plateExtentsMm(result: ParseResult, plateId: number | null): number[] | null {
  const plate = result.plates.find((p) => p.id === plateId) ?? result.plates[0];
  if (!plate) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const c of plate.meshChunks) {
    const p = c.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[i + k];
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
    }
  }
  const mm = result.unitToMeters * 1000;
  return [0, 1, 2].map((k) => (hi[k] - lo[k]) * mm).sort((a, b) => b - a);
}

/**
 * The two versions of the part on screen and how they relate. `scale` is the
 * as-printed size as a percentage of the design per axis (largest axis
 * first), when the slicer scaled the part by more than 2%; null otherwise.
 */
export function useVersionInfo() {
  const versions = useAppStore((s) => s.versions);
  const viewMode = useAppStore((s) => s.viewMode);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const both = !!(versions.model && versions.printed);

  const scale = useMemo(() => {
    if (!versions.model || !versions.printed) return null;
    const a = plateExtentsMm(versions.model, currentPlateId);
    const b = plateExtentsMm(versions.printed, currentPlateId);
    if (!a || !b) return null;
    const pct = b.map((v, i) => (100 * v) / Math.max(a[i], 1e-9));
    if (pct.every((p) => Math.abs(p - 100) < 2)) return null;
    return { pct, uniform: Math.max(...pct) / Math.min(...pct) < 1.02 };
  }, [versions.model, versions.printed, currentPlateId]);

  const scaleText = scale
    ? scale.uniform
      ? `${scale.pct[0].toFixed(1)}%`
      : scale.pct.map((p) => `${p.toFixed(1)}%`).join(' × ')
    : null;

  return { versions, viewMode, both, scale, scaleText, printInfo: versions.printed?.printInfo };
}
