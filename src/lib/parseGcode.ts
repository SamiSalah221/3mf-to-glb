// Sliced G-code (.gcode, or a sliced .gcode.3mf) → ParseResult.
//
// The as-printed counterpart of parse3MF: instead of the design mesh, the
// geometry is built from the toolpath, a bead of plastic swept along every
// extruding move (see gcode/beads.ts). The result has the same shape as
// parse3MF's (plates of per-filament MeshChunks in millimetres, plus filament
// slots), so scene building, recoloring, GLB / USDZ / OBJ export and AR all
// work on it unchanged.

import JSZip from 'jszip';
import type { FilamentSlot, ParseResult, Plate } from '../types/index.js';
import { UNIT_TO_METERS } from '../types/index.js';
import { readGcode } from './gcode/readGcode.js';
import { buildBeadChunks, type BeadOptions } from './gcode/beads.js';

export type { BeadOptions, GcodeDetail } from './gcode/beads.js';

const DEFAULT_COLOURS = ['#D9D9D9', '#E84A4A', '#3A7BD5', '#F2C14E', '#4CAF50', '#9C27B0', '#FF9800', '#00BCD4'];

function normalizeHex(c: string): string {
  let s = c.trim();
  if (!s.startsWith('#')) s = '#' + s;
  return s.slice(0, 7).toUpperCase();
}

function isZip(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

function isBinaryGcode(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0x47 && b[1] === 0x43 && b[2] === 0x44 && b[3] === 0x45; // "GCDE"
}

/** True when the bytes are G-code text, binary G-code, or a zip holding sliced plate G-code. */
export async function isGcodeFile(buffer: ArrayBuffer | Uint8Array): Promise<boolean> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (isBinaryGcode(bytes)) return true;
  if (isZip(bytes)) {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    if (!names.some((n) => /\.gcode$/i.test(n))) return false;
    // A saved project can carry plate G-code next to its design meshes; that is
    // still a design file. A sliced plate export (.gcode.3mf) holds no meshes.
    for (const n of names) {
      if (/^3D\/.*\.model$/i.test(n)) {
        const xml = await zip.file(n)!.async('string');
        if (/<vertex\b/.test(xml)) return false;
      }
    }
    return true;
  }
  // Plain text: look for G-code words near the top.
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  return /^\s*(;|G[0-3]\b|G2[01]\b|G9[0-2]\b|M\d+)/m.test(head) && !/<\?xml|<model/i.test(head);
}

export interface ParseGcodeOptions extends BeadOptions {
  /** Called with a short progress message while plates are read and swept. */
  onProgress?: (message: string) => void;
}

/** Parse sliced G-code (plain .gcode, or every plate of a .gcode.3mf). */
export async function parseGcode(
  buffer: ArrayBuffer | Uint8Array,
  opts: ParseGcodeOptions = {},
): Promise<ParseResult> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (isBinaryGcode(bytes)) {
    throw new Error('Binary G-code (.bgcode) is not supported. Turn off binary G-code in the slicer and export again.');
  }

  const sources: { id: number; name: string; text: string; thumb: JSZip.JSZipObject | null }[] = [];
  if (isZip(bytes)) {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => /\.gcode$/i.test(n)).sort();
    if (!names.length) throw new Error('This archive holds no G-code. Slice it and export the plate sliced file.');
    for (const name of names) {
      const m = /plate_(\d+)\.gcode$/i.exec(name);
      const id = m ? parseInt(m[1], 10) : sources.length + 1;
      opts.onProgress?.(`Reading plate ${id}`);
      sources.push({
        id,
        name: `Plate ${id}`,
        text: await zip.file(name)!.async('string'),
        thumb: zip.file(name.replace(/\.gcode$/i, '.png')),
      });
    }
  } else {
    sources.push({ id: 1, name: 'Plate 1', text: new TextDecoder().decode(bytes), thumb: null });
  }

  const plates: Plate[] = [];
  let colours: string[] = [];
  let maxTool = 0;
  for (const src of sources) {
    opts.onProgress?.(`Reading toolpath of ${src.name.toLowerCase()}`);
    const read = readGcode(src.text);
    if (!read.segments.length) continue;
    if (!colours.length) colours = read.colours;
    opts.onProgress?.(`Building beads for ${src.name.toLowerCase()}`);
    const { chunks } = buildBeadChunks(read.segments, read.filamentDiameter, opts, `plate${src.id}`);
    if (!chunks.length) continue;
    for (const c of chunks) maxTool = Math.max(maxTool, c.filamentIndex - 1);

    let thumbnailUrl: string | null = null;
    if (src.thumb && typeof Blob !== 'undefined' && typeof URL?.createObjectURL === 'function') {
      try {
        thumbnailUrl = URL.createObjectURL(await src.thumb.async('blob'));
      } catch { /* no thumb */ }
    }
    plates.push({
      id: src.id,
      name: src.name,
      thumbnailUrl,
      meshChunks: chunks,
      filamentIndicesUsed: chunks.map((c) => c.filamentIndex),
    });
  }
  if (!plates.length) throw new Error('The G-code has no printing moves. Check the plate in your slicer and export again.');

  const count = Math.max(colours.length, maxTool + 1);
  const filaments: FilamentSlot[] = Array.from({ length: count }, (_, i) => {
    const hex = normalizeHex(colours[i] || DEFAULT_COLOURS[i % DEFAULT_COLOURS.length]);
    return { index: i + 1, originalColor: hex, currentColor: hex };
  });

  return {
    plates,
    filaments,
    sourceUnit: 'millimeter',
    unitToMeters: UNIT_TO_METERS.millimeter,
    sourceKind: 'gcode',
  };
}
