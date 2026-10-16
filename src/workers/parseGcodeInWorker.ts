// Browser-only: run parseGcode in a Web Worker (see src/workers/parseGcode.worker.ts).
// Falls back to the main thread where workers are unavailable.

import type { ParseResult } from '../types';
import type { GcodeWorkerResponse } from './parseGcode.worker';
import { parseGcode } from '../lib/parseGcode';

export function parseGcodeInWorker(
  buffer: ArrayBuffer,
  onProgress?: (message: string) => void,
): Promise<ParseResult> {
  if (typeof Worker === 'undefined') return parseGcode(buffer, { onProgress });
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parseGcode.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<GcodeWorkerResponse>) => {
      const msg = ev.data;
      if (msg.type === 'progress') onProgress?.(msg.message);
      else {
        worker.terminate();
        if (msg.type === 'done') resolve(msg.result);
        else reject(new Error(msg.message));
      }
    };
    worker.onerror = (ev) => {
      worker.terminate();
      reject(new Error(ev.message || 'G-code worker failed'));
    };
    worker.postMessage({ buffer }, [buffer]);
  });
}
