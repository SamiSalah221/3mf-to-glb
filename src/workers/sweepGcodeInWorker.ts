// Browser-only: run buildBeadChunks in a Web Worker (see sweepGcode.worker.ts).
// Falls back to the main thread where workers are unavailable. The segment
// buffers are copied into the worker, not transferred, so the store keeps them.

import { buildBeadChunks, type BeadOptions, type BeadStats } from '../lib/gcode/beads';
import type { Segments } from '../lib/gcode/readGcode';
import type { MeshChunk } from '../types';
import type { SweepWorkerResponse } from './sweepGcode.worker';

export function sweepGcodeInWorker(
  segments: Segments,
  filamentDiameter: number,
  opts: BeadOptions,
  name: string,
): Promise<{ chunks: MeshChunk[]; stats: BeadStats }> {
  if (typeof Worker === 'undefined') return Promise.resolve(buildBeadChunks(segments, filamentDiameter, opts, name));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sweepGcode.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<SweepWorkerResponse>) => {
      worker.terminate();
      if (ev.data.type === 'done') resolve({ chunks: ev.data.chunks, stats: ev.data.stats });
      else reject(new Error(ev.data.message));
    };
    worker.onerror = (ev) => {
      worker.terminate();
      reject(new Error(ev.message || 'Sweep worker failed'));
    };
    worker.postMessage({ segments, filamentDiameter, opts, name });
  });
}
