// Re-sweeps the stored toolpath of one plate into beads, off the main thread.
// Used by export: the viewer may show a budget-reduced mesh, but the file the
// user downloads is swept again here at full detail (see exportScene.ts).

import { buildBeadChunks, type BeadOptions, type BeadStats } from '../lib/gcode/beads';
import type { Segments } from '../lib/gcode/readGcode';
import type { MeshChunk } from '../types';

export type SweepWorkerRequest = {
  segments: Segments;
  filamentDiameter: number;
  opts: BeadOptions;
  name: string;
};
export type SweepWorkerResponse =
  | { type: 'done'; chunks: MeshChunk[]; stats: BeadStats }
  | { type: 'error'; message: string };

self.onmessage = (ev: MessageEvent<SweepWorkerRequest>) => {
  const post = (msg: SweepWorkerResponse, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage(msg, transfer);
  try {
    const { segments, filamentDiameter, opts, name } = ev.data;
    const { chunks, stats } = buildBeadChunks(segments, filamentDiameter, opts, name);
    const transfer: Transferable[] = [];
    for (const c of chunks) {
      transfer.push(c.positions.buffer, c.normals.buffer);
      if (c.indices) transfer.push(c.indices.buffer);
    }
    post({ type: 'done', chunks, stats }, transfer);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Failed to build the print' });
  }
};
