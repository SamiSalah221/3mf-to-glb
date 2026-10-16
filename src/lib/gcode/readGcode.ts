// Reads sliced G-code into extrusion segments.
//
// Every move that pushes plastic becomes one Segment: where it starts and ends,
// how much filament it pushes, the layer height, the slicer's own line width
// (when it writes one), the feature (outer wall, top surface, infill...) and the
// tool. beads.ts turns those into geometry.
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

export interface Segment {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  /** Filament length pushed (mm). */
  e: number;
  /** Layer height (mm). */
  h: number;
  /** Line width from the slicer's comment, 0 when it wrote none. */
  wHint: number;
  feature: Feature;
  /** 0-based tool (T0 = filament 1). */
  tool: number;
}

export interface GcodeReadResult {
  segments: Segment[];
  filamentDiameter: number;
  /** Filament colours from the slicer's config block, in tool order (may be empty). */
  colours: string[];
}

const TYPE_RE = /^;\s*(?:TYPE|FEATURE)\s*:\s*(.+)$/i;
const HEIGHT_RE = /^;\s*(?:HEIGHT|LAYER_HEIGHT)\s*:\s*([\d.]+)/i;
const WIDTH_RE = /^;\s*(?:WIDTH|LINE_WIDTH)\s*:\s*([\d.]+)/i;
const FIL_DIAM_RE = /^;\s*filament_diameter\s*[=:]\s*([\d.]+)/i;
const FIL_COLOUR_RE = /^;\s*(?:filament_colou?r|extruder_colou?r)\s*[=:]\s*(.+)$/i;
const WORD_RE = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

/** Read G-code text into extrusion segments. `arcSegMm` is the chord length for G2/G3. */
export function readGcode(text: string, arcSegMm = 0.3): GcodeReadResult {
  const segments: Segment[] = [];
  let filamentDiameter = 1.75;
  let colours: string[] = [];

  let x = 0, y = 0, z = 0, e = 0;
  let absXYZ = true;
  let absE = true;
  let feature: Feature = 'unknown';
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
      segments.push({ x0: x, y0: y, z0: z, x1: nx, y1: ny, z1: nz, e: de, h, wHint, feature, tool });
    }
    x = nx; y = ny; z = nz;
  };

  const words: Record<string, number> = {};
  let start = 0;
  const n = text.length;
  while (start < n) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = n;
    const line = text.slice(start, end).trim();
    start = end + 1;
    if (!line) continue;

    if (line.charCodeAt(0) === 59 /* ; */) {
      let m = TYPE_RE.exec(line);
      if (m) { feature = FEATURE_ALIASES[m[1].trim().toLowerCase()] ?? 'unknown'; continue; }
      m = HEIGHT_RE.exec(line);
      if (m) { hHint = parseFloat(m[1]); continue; }
      m = WIDTH_RE.exec(line);
      if (m) { wHint = parseFloat(m[1]); continue; }
      m = FIL_DIAM_RE.exec(line);
      if (m) { filamentDiameter = parseFloat(m[1]); continue; }
      m = FIL_COLOUR_RE.exec(line);
      if (m && colours.length === 0) {
        colours = m[1].split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, '')).filter(Boolean);
      }
      continue;
    }

    const semi = line.indexOf(';');
    const code = (semi >= 0 ? line.slice(0, semi) : line).trim().toUpperCase();
    if (!code) continue;
    const sp = code.search(/\s/);
    const head = sp < 0 ? code : code.slice(0, sp);

    if (head.charCodeAt(0) === 84 /* T */ && /^T\d+$/.test(head)) {
      const t = parseInt(head.slice(1), 10);
      if (t < 100) tool = t; // Bambu uses T255 / T1000 / T1100 for unload and service moves
      continue;
    }
    switch (head) {
      case 'G90': absXYZ = true; continue; // E mode stays as M82/M83 set it, as in Klipper and slicer output
      case 'G91': absXYZ = false; absE = false; continue;
      case 'M82': absE = true; continue;
      case 'M83': absE = false; continue;
      case 'G20': inch = true; continue;
      case 'G21': inch = false; continue;
      case 'G0': case 'G1': case 'G00': case 'G01':
      case 'G2': case 'G3': case 'G02': case 'G03':
      case 'G92':
        break;
      default:
        continue;
    }

    for (const k in words) delete words[k];
    WORD_RE.lastIndex = 0;
    const rest = code.slice(head.length);
    let w: RegExpExecArray | null;
    let any = false;
    while ((w = WORD_RE.exec(rest))) {
      const key = w[1].toUpperCase();
      let v = parseFloat(w[2]);
      if (inch && 'XYZEIJR'.includes(key)) v *= 25.4;
      words[key] = v;
      any = true;
    }

    if (head === 'G92') {
      if ('X' in words) x = words.X;
      if ('Y' in words) y = words.Y;
      if ('Z' in words) z = words.Z;
      if ('E' in words) e = words.E;
      if (!any) e = 0;
      continue;
    }

    const nx = absXYZ ? words.X ?? x : x + (words.X ?? 0);
    const ny = absXYZ ? words.Y ?? y : y + (words.Y ?? 0);
    const nz = absXYZ ? words.Z ?? z : z + (words.Z ?? 0);
    let de = 0;
    if ('E' in words) {
      if (absE) { de = words.E - e; e = words.E; } else { de = words.E; e += de; }
    }

    if (head === 'G0' || head === 'G1' || head === 'G00' || head === 'G01') {
      addLine(nx, ny, nz, de);
      continue;
    }

    // G2 (clockwise) / G3 (counter-clockwise) arcs, split into chords.
    const cw = head === 'G2' || head === 'G02';
    let cx: number, cy: number;
    if ('R' in words && !('I' in words) && !('J' in words)) {
      const r = words.R;
      const dx = nx - x, dy = ny - y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9 || Math.abs(r) < d / 2) { addLine(nx, ny, nz, de); continue; }
      const hgt = Math.sqrt(r * r - (d / 2) ** 2);
      const sgn = (cw ? 1 : -1) * (r > 0 ? 1 : -1);
      cx = x + dx / 2 - (sgn * hgt * dy) / d;
      cy = y + dy / 2 + (sgn * hgt * dx) / d;
    } else {
      cx = x + (words.I ?? 0);
      cy = y + (words.J ?? 0);
    }
    const r = Math.hypot(x - cx, y - cy);
    const a0 = Math.atan2(y - cy, x - cx);
    const a1 = Math.atan2(ny - cy, nx - cx);
    let sweep = a1 - a0;
    if (cw) { if (sweep >= -1e-9) sweep -= 2 * Math.PI; } else if (sweep <= 1e-9) sweep += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * r) / arcSegMm), Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
    const sz = z;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = a0 + sweep * t;
      addLine(i < steps ? cx + r * Math.cos(a) : nx, i < steps ? cy + r * Math.sin(a) : ny, sz + (nz - sz) * t, de / steps);
    }
  }

  return { segments, filamentDiameter, colours };
}
