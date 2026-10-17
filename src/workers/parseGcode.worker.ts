// Parses sliced G-code off the main thread. A large print is hundreds of
// thousands of moves and millions of triangles; on the main thread that would
// freeze the page for seconds. The mesh buffers are transferred back, not copied.

import { parseGcode } from '../lib/parseGcode';
import { BEAD_FACE_BUDGET_VIEWER } from '../lib/gcode/beads';
import { segmentBuffers } from '../lib/gcode/readGcode';
import type { ParseResult } from '../types';

export type GcodeWorkerRequest = { buffer: ArrayBuffer };
export type GcodeWorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'done'; result: ParseResult }
  | { type: 'error'; message: string };

self.onmessage = async (ev: MessageEvent<GcodeWorkerRequest>) => {
  const post = (msg: GcodeWorkerResponse, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage(msg, transfer);
  try {
    const result = await parseGcode(ev.data.buffer, {
      onProgress: (message) => post({ type: 'progress', message }),
      // The live viewer gets a bounded mesh; export re-sweeps at full detail.
      faceBudget: BEAD_FACE_BUDGET_VIEWER,
    });
    const transfer: Transferable[] = [];
    for (const plate of result.plates) {
      for (const c of plate.meshChunks) {
        transfer.push(c.positions.buffer, c.normals.buffer);
        if (c.indices) transfer.push(c.indices.buffer);
      }
    }
    for (const src of result.gcodeSource ?? []) transfer.push(...segmentBuffers(src.segments));
    post({ type: 'done', result }, transfer);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Failed to read G-code' });
  }
};
