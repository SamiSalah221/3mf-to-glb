// Reads sliced G-code into extrusion segments.
//
// Every move that pushes plastic becomes one segment: where it starts and ends,
// how much filament it pushes, the layer height, the slicer's own line width
// (when it writes one), the feature (outer wall, top surface, infill...) and the
// tool. beads.ts turns those into geometry.
//
// Segments are stored as a struct of typed arrays, not one object per move: a
// long print is millions of moves, and a JS object each costs hundreds of
// megabytes and a long garbage-collector pause. Lines are scanned by character
// code without slicing strings for the same reason.
//
// Reads PrusaSlicer, OrcaSlicer, Bambu Studio, Snapmaker U1 (Orca-based) and
// Cura output: G0/G1 moves, G2/G3 arcs (I/J and R forms), absolute or relative
// E, G92 resets, inch units and tool changes.

export type Feature =
  | 'outer_wall'
  | 'inner_wall'
  | 'overhang'
  | 'top_surface'
  | 'bottom_surface'
  | 'bridge'
  | 'gap_fill'
  | 'solid_infill'
  | 'sparse_infill'
  | 'ironing'
  | 'support'
  | 'skirt'
  | 'brim'
  | 'prime_tower'
  | 'custom'
  | 'unknown';

/** Feature vocabulary in id order: `Segments.feature` holds indices into this. */
export const FEATURES: readonly Feature[] = [
  'outer_wall', 'inner_wall', 'overhang', 'top_surface', 'bottom_surface', 'bridge', 'gap_fill',
  'solid_infill', 'sparse_infill', 'ironing', 'support', 'skirt', 'brim', 'prime_tower', 'custom', 'unknown',
];
const FEATURE_ID: Record<Feature, number> = Object.fromEntries(FEATURES.map((f, i) => [f, i])) as Record<Feature, number>;
export function featureId(f: Feature): number { return FEATURE_ID[f]; }

/** Slicer comment names, lowercased, mapped to one vocabulary. */
const FEATURE_ALIASES: Record<string, Feature> = {
  // PrusaSlicer / OrcaSlicer / Bambu Studio
  'external perimeter': 'outer_wall',
  'outer wall': 'outer_wall',
  perimeter: 'inner_wall',
  'inner wall': 'inner_wall',
  'overhang perimeter': 'overhang',
  'overhang wall': 'overhang',
  'internal infill': 'sparse_infill',
  'sparse infill': 'sparse_infill',
  'solid infill': 'solid_infill',
  'internal solid infill': 'solid_infill',
  'top solid infill': 'top_surface',
  'top surface': 'top_surface',
  'bottom surface': 'bottom_surface',
  'bridge infill': 'bridge',
  bridge: 'bridge',
  'internal bridge': 'solid_infill',
  'gap infill': 'gap_fill',
  'gap fill': 'gap_fill',
  ironing: 'ironing',
  skirt: 'skirt',
  'skirt/brim': 'skirt',
  brim: 'brim',
  'support material': 'support',
  'support material interface': 'support',
  support: 'support',
  'support interface': 'support',
  'support transition': 'support',
  'wipe tower': 'prime_tower',
  'prime tower': 'prime_tower',
  custom: 'custom',
  // Cura
  'wall-outer': 'outer_wall',
  'wall-inner': 'inner_wall',
  skin: 'top_surface',
  fill: 'sparse_infill',
  'support-interface': 'support',
  'prime-tower': 'prime_tower',
};

/**
 * Extrusion segments as parallel typed arrays, `count` entries each.
 * Coordinates in mm (inches already converted). `feature` indexes FEATURES,
 * `tool` is 0-based (T0 = filament 1).
 */
export interface Segments {
  count: number;
  x0: Float32Array; y0: Float32Array; z0: Float32Array;
  x1: Float32Array; y1: Float32Array; z1: Float32Array;
  /** Filament length pushed (mm). */
  e: Float32Array;
  /** Layer height (mm). */
  h: Float32Array;
  /** Line width from the slicer's comment, 0 when it wrote none. */
  wHint: Float32Array;
  feature: Uint8Array;
  tool: Uint8Array;
}

/** One segment, read out of a Segments struct. For tests and small callers. */
export interface Segment {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  e: number;
  h: number;
  wHint: number;
  feature: Feature;
  tool: number;
}

export function segmentAt(s: Segments, i: number): Segment {
  return {
    x0: s.x0[i], y0: s.y0[i], z0: s.z0[i], x1: s.x1[i], y1: s.y1[i], z1: s.z1[i],
    e: s.e[i], h: s.h[i], wHint: s.wHint[i], feature: FEATURES[s.feature[i]], tool: s.tool[i],
  };
}

/** The ArrayBuffers behind a Segments struct, for postMessage transfer lists. */
export function segmentBuffers(s: Segments): ArrayBuffer[] {
  return [s.x0, s.y0, s.z0, s.x1, s.y1, s.z1, s.e, s.h, s.wHint, s.feature, s.tool].map((a) => a.buffer as ArrayBuffer);
}

/** Growable struct-of-arrays builder; `finish()` trims every array to the exact count. */
class SegmentBuilder {
  count = 0;
  private cap: number;
  x0: Float32Array; y0: Float32Array; z0: Float32Array;
  x1: Float32Array; y1: Float32Array; z1: Float32Array;
  e: Float32Array; h: Float32Array; wHint: Float32Array;
  feature: Uint8Array; tool: Uint8Array;

  constructor(initial = 1 << 16) {
    this.cap = initial;
    this.x0 = new Float32Array(initial); this.y0 = new Float32Array(initial); this.z0 = new Float32Array(initial);
    this.x1 = new Float32Array(initial); this.y1 = new Float32Array(initial); this.z1 = new Float32Array(initial);
    this.e = new Float32Array(initial); this.h = new Float32Array(initial); this.wHint = new Float32Array(initial);
    this.feature = new Uint8Array(initial); this.tool = new Uint8Array(initial);
  }

  private grow() {
    const next = this.cap * 2;
    const g32 = (a: Float32Array) => { const b = new Float32Array(next); b.set(a); return b; };
    const g8 = (a: Uint8Array) => { const b = new Uint8Array(next); b.set(a); return b; };
    this.x0 = g32(this.x0); this.y0 = g32(this.y0); this.z0 = g32(this.z0);
    this.x1 = g32(this.x1); this.y1 = g32(this.y1); this.z1 = g32(this.z1);
    this.e = g32(this.e); this.h = g32(this.h); this.wHint = g32(this.wHint);
    this.feature = g8(this.feature); this.tool = g8(this.tool);
    this.cap = next;
  }

  push(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
       e: number, h: number, wHint: number, feature: number, tool: number) {
    if (this.count === this.cap) this.grow();
    const i = this.count++;
    this.x0[i] = x0; this.y0[i] = y0; this.z0[i] = z0;
    this.x1[i] = x1; this.y1[i] = y1; this.z1[i] = z1;
    this.e[i] = e; this.h[i] = h; this.wHint[i] = wHint;
    this.feature[i] = feature; this.tool[i] = tool;
  }

  finish(): Segments {
    const n = this.count;
    return {
      count: n,
      x0: this.x0.slice(0, n), y0: this.y0.slice(0, n), z0: this.z0.slice(0, n),
      x1: this.x1.slice(0, n), y1: this.y1.slice(0, n), z1: this.z1.slice(0, n),
      e: this.e.slice(0, n), h: this.h.slice(0, n), wHint: this.wHint.slice(0, n),
      feature: this.feature.slice(0, n), tool: this.tool.slice(0, n),
    };
  }
}

/** What the slicer wrote about the print, for display. Any field may be missing. */
export interface PrintInfo {
  /** e.g. "OrcaSlicer 2.4.2" */
  slicer?: string;
  nozzleMm?: number;
  layerHeightMm?: number;
  /** Distinct printed layers. */
  layers?: number;
  /** The slicer's own estimate, as it wrote it (e.g. "5h 25m 4s"). */
  estimatedTime?: string;
}

export interface GcodeReadResult {
  segments: Segments;
  filamentDiameter: number;
  /** Filament colours from the slicer's config block, in tool order (may be empty). */
  colours: string[];
  info: PrintInfo;
}

const TYPE_RE = /^;\s*(?:TYPE|FEATURE)\s*:\s*(.+)$/i;
const HEIGHT_RE = /^;\s*(?:HEIGHT|LAYER_HEIGHT)\s*:\s*([\d.]+)/i;
const WIDTH_RE = /^;\s*(?:WIDTH|LINE_WIDTH)\s*:\s*([\d.]+)/i;
const FIL_DIAM_RE = /^;\s*filament_diameter\s*[=:]\s*([\d.]+)/i;
const FIL_COLOUR_RE = /^;\s*(?:filament_colou?r|extruder_colou?r)\s*[=:]\s*(.+)$/i;
const SLICER_RE = /^;\s*generated by\s+(.+?)(?:\s+on\s+\d.*)?$/i;
const NOZZLE_RE = /^;\s*nozzle_diameter\s*[=:]\s*([\d.]+)/i;
const LAYER_H_RE = /^;\s*layer_height\s*[=:]\s*([\d.]+)/i;
// Orca / Bambu: "; total estimated time: 5h 25m 4s"; PrusaSlicer: "; estimated printing time (normal mode) = 1h 2m 3s"
// (Orca puts it after the model time on the same line, so it is not anchored.)
const TIME_RE = /(?:total estimated time|estimated printing time(?: \(normal mode\))?)\s*[=:]\s*([^;]+)/i;

// Letters (uppercased) that begin a comment we care about; everything else is skipped unsliced.
const COMMENT_FIRST = new Set(['T', 'F', 'H', 'L', 'W', 'E', 'G', 'N']);

// Word slots: index = letter - 'A'.
const IX = 0, IY = 1, IZ = 2, IE = 3, II = 4, IJ = 5, IR = 6;
const SLOT: Int8Array = (() => {
  const s = new Int8Array(26).fill(-1);
  s['X'.charCodeAt(0) - 65] = IX; s['Y'.charCodeAt(0) - 65] = IY; s['Z'.charCodeAt(0) - 65] = IZ;
  s['E'.charCodeAt(0) - 65] = IE; s['I'.charCodeAt(0) - 65] = II; s['J'.charCodeAt(0) - 65] = IJ;
  s['R'.charCodeAt(0) - 65] = IR;
  return s;
})();

/** Read G-code text into extrusion segments. `arcSegMm` is the chord length for G2/G3. */
export function readGcode(text: string, arcSegMm = 0.3): GcodeReadResult {
  const out = new SegmentBuilder();
  let filamentDiameter = 1.75;
  let colours: string[] = [];
  const info: PrintInfo = {};

  let x = 0, y = 0, z = 0, e = 0;
  let absXYZ = true;
  let absE = true;
  let feature = FEATURE_ID.unknown;
  let hHint = 0;
  let wHint = 0;
  let tool = 0;
  let lastLayerZ = 0;
  let layerZ = 0;
  let inch = false;

  const addLine = (nx: number, ny: number, nz: number, de: number) => {
    if (de > 1e-7 && (nx !== x || ny !== y)) {
      if (nz > layerZ + 1e-4) {
        lastLayerZ = layerZ;
        layerZ = nz;
      }
      const h = hHint > 0 ? hHint : layerZ > 0 ? Math.max(layerZ - lastLayerZ, 0.05) : 0.2;
      out.push(x, y, z, nx, ny, nz, de, h, wHint, feature, tool);
    }
    x = nx; y = ny; z = nz;
  };

  // Word values for the current move; `has` bit i set when slot i was written.
  const val = new Float64Array(7);
  let has = 0;

  let start = 0;
  const n = text.length;
  while (start < n) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = n;
    let s = start;
    let t = end;
    start = end + 1;
    while (s < t && text.charCodeAt(s) <= 32) s++;
    while (t > s && text.charCodeAt(t - 1) <= 32) t--;
    if (s >= t) continue;

    const c0 = text.charCodeAt(s);
    if (c0 === 59 /* ; */) {
      // Cheap prefix gate before any regex: first letter after "; ".
      let p = s + 1;
      while (p < t && text.charCodeAt(p) === 32) p++;
      if (p >= t) continue;
      const first = String.fromCharCode(text.charCodeAt(p) & ~32);
      if (!COMMENT_FIRST.has(first)) continue;
      const line = text.slice(s, t);
      let m = TYPE_RE.exec(line);
      if (m) { feature = FEATURE_ID[FEATURE_ALIASES[m[1].trim().toLowerCase()] ?? 'unknown']; continue; }
      m = HEIGHT_RE.exec(line);
      if (m) { hHint = parseFloat(m[1]); continue; }
      m = WIDTH_RE.exec(line);
      if (m) { wHint = parseFloat(m[1]); continue; }
      m = FIL_DIAM_RE.exec(line);
      if (m) { filamentDiameter = parseFloat(m[1]); continue; }
      m = FIL_COLOUR_RE.exec(line);
      if (m && colours.length === 0) {
        colours = m[1].split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, '')).filter(Boolean);
        continue;
      }
      if (!info.slicer && (m = SLICER_RE.exec(line))) { info.slicer = m[1].replace(/\+\S*$/, '').trim(); continue; }
      if (info.nozzleMm == null && (m = NOZZLE_RE.exec(line))) { info.nozzleMm = parseFloat(m[1]); continue; }
      if (info.layerHeightMm == null && (m = LAYER_H_RE.exec(line))) { info.layerHeightMm = parseFloat(m[1]); continue; }
      if (!info.estimatedTime && (m = TIME_RE.exec(line))) info.estimatedTime = m[1].trim();
      continue;
    }

    // Command head: a letter and an integer, e.g. G1, M83, T0.
    const headLetter = c0 & ~32;
    let p = s + 1;
    let num = 0;
    let digits = 0;
    while (p < t) {
      const c = text.charCodeAt(p);
      if (c < 48 || c > 57) break;
      num = num * 10 + (c - 48);
      digits++;
      p++;
    }
    if (digits === 0) continue;

    if (headLetter === 84 /* T */) {
      if (num < 100) tool = num; // Bambu uses T255 / T1000 / T1100 for unload and service moves
      continue;
    }
    if (headLetter === 77 /* M */) {
      if (num === 82) absE = true; else if (num === 83) absE = false;
      continue;
    }
    if (headLetter !== 71 /* G */) continue;
    switch (num) {
      case 90: absXYZ = true; continue; // E mode stays as M82/M83 set it, as in Klipper and slicer output
      case 91: absXYZ = false; absE = false; continue;
      case 20: inch = true; continue;
      case 21: inch = false; continue;
      case 0: case 1: case 2: case 3: case 92: break;
      default: continue;
    }

    // Words: letter then number, until end of line or a ';' comment.
    has = 0;
    let any = false;
    while (p < t) {
      let c = text.charCodeAt(p);
      if (c === 59) break;
      if (c <= 32) { p++; continue; }
      const letter = c & ~32;
      if (letter < 65 || letter > 90) { p++; continue; }
      p++;
      while (p < t && text.charCodeAt(p) === 32) p++;
      // number: sign, integer, fraction (exponents are not written by slicers; fall back if seen)
      const wordStart = p;
      let sign = 1;
      c = p < t ? text.charCodeAt(p) : 0;
      if (c === 45) { sign = -1; p++; } else if (c === 43) { p++; }
      let v = 0;
      let seen = false;
      while (p < t) {
        c = text.charCodeAt(p);
        if (c < 48 || c > 57) break;
        v = v * 10 + (c - 48);
        seen = true;
        p++;
      }
      if (p < t && text.charCodeAt(p) === 46) {
        p++;
        let scale = 0.1;
        while (p < t) {
          c = text.charCodeAt(p);
          if (c < 48 || c > 57) break;
          v += (c - 48) * scale;
          scale *= 0.1;
          seen = true;
          p++;
        }
      }
      if (!seen) continue;
      if (p < t && ((text.charCodeAt(p) & ~32) === 69 /* E/e exponent */)) {
        let q = p + 1;
        if (q < t && (text.charCodeAt(q) === 45 || text.charCodeAt(q) === 43)) q++;
        while (q < t && text.charCodeAt(q) >= 48 && text.charCodeAt(q) <= 57) q++;
        v = Math.abs(parseFloat(text.slice(wordStart, q)));
        p = q;
      }
      v *= sign;
      const slot = SLOT[letter - 65];
      if (slot >= 0) {
        if (inch) v *= 25.4;
        val[slot] = v;
        has |= 1 << slot;
      }
      any = true;
    }

    if (num === 92) {
      if (has & (1 << IX)) x = val[IX];
      if (has & (1 << IY)) y = val[IY];
      if (has & (1 << IZ)) z = val[IZ];
      if (has & (1 << IE)) e = val[IE];
      if (!any) e = 0;
      continue;
    }

    const hx = (has & (1 << IX)) !== 0, hy = (has & (1 << IY)) !== 0, hz = (has & (1 << IZ)) !== 0;
    const nx = absXYZ ? (hx ? val[IX] : x) : x + (hx ? val[IX] : 0);
    const ny = absXYZ ? (hy ? val[IY] : y) : y + (hy ? val[IY] : 0);
    const nz = absXYZ ? (hz ? val[IZ] : z) : z + (hz ? val[IZ] : 0);
    let de = 0;
    if (has & (1 << IE)) {
      const ev = val[IE];
      if (absE) { de = ev - e; e = ev; } else { de = ev; e += de; }
    }

    if (num === 0 || num === 1) {
      addLine(nx, ny, nz, de);
      continue;
    }

    // G2 (clockwise) / G3 (counter-clockwise) arcs, split into chords.
    const cw = num === 2;
    let cx: number, cy: number;
    const hasR = (has & (1 << IR)) !== 0, hasI = (has & (1 << II)) !== 0, hasJ = (has & (1 << IJ)) !== 0;
    if (hasR && !hasI && !hasJ) {
      const r = val[IR];
      const dx = nx - x, dy = ny - y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9 || Math.abs(r) < d / 2) { addLine(nx, ny, nz, de); continue; }
      const hgt = Math.sqrt(r * r - (d / 2) ** 2);
      const sgn = (cw ? 1 : -1) * (r > 0 ? 1 : -1);
      cx = x + dx / 2 - (sgn * hgt * dy) / d;
      cy = y + dy / 2 + (sgn * hgt * dx) / d;
    } else {
      cx = x + (hasI ? val[II] : 0);
      cy = y + (hasJ ? val[IJ] : 0);
    }
    const r = Math.hypot(x - cx, y - cy);
    const a0 = Math.atan2(y - cy, x - cx);
    const a1 = Math.atan2(ny - cy, nx - cx);
    let sweep = a1 - a0;
    if (cw) { if (sweep >= -1e-9) sweep -= 2 * Math.PI; } else if (sweep <= 1e-9) sweep += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * r) / arcSegMm), Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
    const sz = z;
    for (let i = 1; i <= steps; i++) {
      const tt = i / steps;
      const a = a0 + sweep * tt;
      addLine(i < steps ? cx + r * Math.cos(a) : nx, i < steps ? cy + r * Math.sin(a) : ny, sz + (nz - sz) * tt, de / steps);
    }
  }

  const segments = out.finish();
  if (segments.count) info.layers = countLayers(segments);
  return { segments, filamentDiameter, colours, info };
}

/** Distinct Z levels (to 1 micron) among the segments. */
function countLayers(s: Segments): number {
  const zs = new Set<number>();
  for (let i = 0; i < s.count; i++) zs.add(Math.round(s.z1[i] * 1000));
  return zs.size;
}
