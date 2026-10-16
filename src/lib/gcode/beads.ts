// Sweeps a bead of plastic along every extruding move: the as-printed mesh.
//
// The cross-section is a stadium (flat top and bottom, round sides) sized so
// its area holds the plastic the move pushes:
//
//   area = E * pi * (d/2)^2 / length = (w - h) * h + pi * (h/2)^2
//
// with h the layer height and the toolpath Z the top of the bead. Moves that
// touch are joined into one bead with mitred rings; a sharp corner starts a new
// one, with end caps. The default 6-point ring gives about 12 triangles per move.
//
// Output is one MeshChunk per tool, in print-bed millimetres, the same shape
// parse3MF produces, so the rest of the app (scene build, recolor, GLB / USDZ /
// OBJ export, AR) works on it unchanged.

import type { MeshChunk } from '../../types/index.js';
import type { Feature, Segment } from './readGcode.js';

export type GcodeDetail = 'visible' | 'all';

export interface BeadOptions {
  /** 'visible' (default) keeps walls and skins only; 'all' keeps every extrusion. */
  detail?: GcodeDetail;
  /** Keep support material. */
  supports?: boolean;
  /** Keep the brim. */
  brim?: boolean;
  /** Keep ironing passes (they add triangles, not visible shape). */
  ironing?: boolean;
  /**
   * Inner walls: 'auto' (default) keeps them only near tops, bottoms and
   * overhangs, where they can show; elsewhere the outer wall hides them.
   */
  innerWalls?: 'auto' | 'all' | 'none';
  /** Arc steps per bead side: 2 = 6-sided bead (default), 4 = 10-sided. */
  smooth?: number;
  /** Merge near-straight moves within this many mm (0 = off). Default 0.01. */
  simplifyMm?: number;
  /** Start a new bead at turns sharper than this many degrees. Default 80. */
  splitAngleDeg?: number;
}

/** What a buyer can actually see on the finished part. */
const VISIBLE: ReadonlySet<Feature> = new Set<Feature>([
  'outer_wall', 'inner_wall', 'overhang', 'top_surface', 'bottom_surface', 'bridge', 'gap_fill', 'unknown',
]);
const ALL: ReadonlySet<Feature> = new Set<Feature>([
  ...VISIBLE, 'solid_infill', 'sparse_infill',
]);

/** Which segments to sweep. Exported for tests. */
export function selectSegments(segments: Segment[], opts: BeadOptions = {}): Segment[] {
  const keep = new Set<Feature>(opts.detail === 'all' ? ALL : VISIBLE);
  if (opts.supports) keep.add('support');
  if (opts.brim) keep.add('brim');
  if (opts.ironing) keep.add('ironing');
  let segs = segments.filter((s) => keep.has(s.feature));
  const inner = opts.innerWalls ?? 'auto';
  if (inner === 'none') segs = segs.filter((s) => s.feature !== 'inner_wall');
  else if (inner === 'auto') segs = cullHiddenInnerWalls(segs);
  return segs;
}

function cullHiddenInnerWalls(segs: Segment[], reachLayers = 3.5): Segment[] {
  if (!segs.length) return segs;
  const exposed = new Set<number>();
  let first = Infinity;
  for (const s of segs) {
    if (s.z1 < first) first = s.z1;
    if (s.feature === 'top_surface' || s.feature === 'bottom_surface' || s.feature === 'bridge' || s.feature === 'overhang') {
      exposed.add(Math.round(s.z1 * 1000) / 1000);
    }
  }
  const zs = Float64Array.from([...exposed, first]).sort();
  return segs.filter((s) => {
    if (s.feature !== 'inner_wall') return true;
    // nearest exposed layer, by binary search
    let lo = 0, hi = zs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (zs[mid] < s.z1) lo = mid + 1; else hi = mid;
    }
    const d = Math.min(Math.abs(zs[lo] - s.z1), lo > 0 ? Math.abs(zs[lo - 1] - s.z1) : Infinity);
    return d <= s.h * reachLayers;
  });
}

/** Bead width from the plastic pushed, kept near the slicer's own width when it gave one. */
export function beadWidth(len: number, e: number, h: number, wHint: number, filamentArea: number): number {
  if (len < 0.05 && wHint > 0) return wHint; // very short moves give noisy E
  const area = (e * filamentArea) / Math.max(len, 1e-6);
  let w = area / h + h * (1 - Math.PI / 4);
  const lo = wHint > 0 ? wHint * 0.5 : h;
  const hi = wHint > 0 ? wHint * 1.8 : h * 5;
  w = Math.min(Math.max(w, lo), hi);
  return Math.max(w, h);
}

/** Growable float buffer. */
class FloatList {
  data = new Float32Array(1 << 16);
  length = 0;
  push3(a: number, b: number, c: number) {
    if (this.length + 3 > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }
  toArray(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

interface Profile { uOff: number[]; uRad: number[]; vRad: number[] }

/** Stadium ring: point = (uOff * (w/2 - h/2) + uRad * h/2 sideways, vRad * h/2 up). */
function stadiumProfile(arcSteps: number): Profile {
  const p: Profile = { uOff: [], uRad: [], vRad: [] };
  for (const [side, startDeg] of [[1, -90], [-1, 90]] as const) {
    for (let i = 0; i <= arcSteps; i++) {
      const a = ((startDeg + (180 * i) / arcSteps) * Math.PI) / 180;
      p.uOff.push(side);
      p.uRad.push(Math.cos(a));
      p.vRad.push(Math.sin(a));
    }
  }
  return p;
}

interface Bead { pts: number[]; widths: number[]; h: number; tool: number }

function buildBeads(segs: Segment[], widths: Float64Array, splitTurnDeg: number): Bead[] {
  const out: Bead[] = [];
  if (!segs.length) return out;
  const cosSplit = Math.cos((splitTurnDeg * Math.PI) / 180);
  let cur: Bead | null = null;
  let prev: Segment | null = null;
  let hSum = 0;
  const flush = () => {
    if (cur && cur.widths.length) { cur.h = hSum / cur.widths.length; out.push(cur); }
  };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    let joined =
      prev !== null && cur !== null &&
      s.tool === prev.tool && s.feature === prev.feature &&
      Math.abs(s.x0 - prev.x1) < 1e-4 && Math.abs(s.y0 - prev.y1) < 1e-4 && Math.abs(s.z0 - prev.z1) < 1e-3 &&
      Math.abs(s.h - prev.h) < 1e-3;
    if (joined && prev) {
      const d0x = prev.x1 - prev.x0, d0y = prev.y1 - prev.y0;
      const d1x = s.x1 - s.x0, d1y = s.y1 - s.y0;
      const n0 = Math.hypot(d0x, d0y), n1 = Math.hypot(d1x, d1y);
      if (n0 > 0 && n1 > 0 && (d0x * d1x + d0y * d1y) / (n0 * n1) < cosSplit) joined = false; // sharp corner
    }
    if (!joined) {
      flush();
      cur = { pts: [s.x0, s.y0, s.z0], widths: [], h: s.h, tool: s.tool };
      hSum = 0;
    }
    cur!.pts.push(s.x1, s.y1, s.z1);
    cur!.widths.push(widths[i]);
    hSum += s.h;
    prev = s;
  }
  flush();
  return out;
}

/** Drop points on near-straight runs (keeps the path within tol mm); merges their widths. */
function simplify(bead: Bead, tol: number): Bead {
  const n = bead.pts.length / 3;
  if (tol <= 0 || n <= 2) return bead;
  const P = bead.pts, W = bead.widths;
  const keep = [0];
  const wk: number[] = [];
  let anchor = 0;
  let acc = W[0], accN = 1;
  for (let i = 1; i < n - 1; i++) {
    const ax = P[anchor * 3], ay = P[anchor * 3 + 1];
    const cx = P[(i + 1) * 3] - ax, cy = P[(i + 1) * 3 + 1] - ay;
    const L = Math.hypot(cx, cy);
    let ok = true;
    if (L > 1e-9) {
      for (let j = anchor + 1; j <= i; j++) {
        const px = P[j * 3] - ax, py = P[j * 3 + 1] - ay;
        if (Math.abs(cx * py - cy * px) / L > tol) { ok = false; break; }
      }
    }
    if (ok && Math.abs(W[i] - W[anchor]) < 0.05 && Math.abs(P[(i + 1) * 3 + 2] - P[anchor * 3 + 2]) < 0.02) {
      acc += W[i]; accN++;
      continue;
    }
    keep.push(i);
    wk.push(acc / accN);
    anchor = i;
    acc = W[i]; accN = 1;
  }
  keep.push(n - 1);
  wk.push(acc / accN);
  const pts: number[] = [];
  for (const k of keep) pts.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
  return { pts, widths: wk, h: bead.h, tool: bead.tool };
}

/** Sweep the stadium along one bead, appending triangles (non-indexed) to pos / nrm. */
function sweep(bead: Bead, prof: Profile, pos: FloatList, nrm: FloatList): number {
  const P = bead.pts;
  const n = P.length / 3;
  const k = prof.uOff.length;
  const h = bead.h;
  const halfH = h / 2;

  // Per-segment direction and left normal.
  const dx = new Float64Array(n - 1), dy = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const ex = P[(i + 1) * 3] - P[i * 3], ey = P[(i + 1) * 3 + 1] - P[i * 3 + 1];
    const L = Math.max(Math.hypot(ex, ey), 1e-9);
    dx[i] = ex / L; dy[i] = ey / L;
  }
  // Rings: vertex positions and normals, n * k each.
  const rv = new Float64Array(n * k * 3);
  const rn = new Float64Array(n * k * 3);
  for (let i = 0; i < n; i++) {
    // miter: lateral = normalised sum of the neighbouring left normals
    let lx: number, ly: number, scale = 1;
    const a = Math.max(i - 1, 0), b = Math.min(i, n - 2);
    const l0x = -dy[a], l0y = dx[a], l1x = -dy[b], l1y = dx[b];
    if (a === b) { lx = l0x; ly = l0y; } else {
      lx = l0x + l1x; ly = l0y + l1y;
      const m = Math.hypot(lx, ly);
      if (m > 1e-9) { lx /= m; ly /= m; } else { lx = l1x; ly = l1y; }
      scale = Math.min(Math.max(1 / Math.max(lx * l1x + ly * l1y, 1e-3), 1), 2);
    }
    const w = i === 0 ? bead.widths[0] : i === n - 1 ? bead.widths[n - 2] : 0.5 * (bead.widths[i - 1] + bead.widths[i]);
    const side = Math.max(w / 2 - halfH, 0);
    const px = P[i * 3], py = P[i * 3 + 1], cz = P[i * 3 + 2] - halfH; // toolpath Z is the top of the bead
    for (let j = 0; j < k; j++) {
      const u = (prof.uOff[j] * side + prof.uRad[j] * halfH) * scale;
      const o = (i * k + j) * 3;
      rv[o] = px + lx * u; rv[o + 1] = py + ly * u; rv[o + 2] = cz + prof.vRad[j] * halfH;
      let nx = lx * prof.uRad[j], ny = ly * prof.uRad[j], nz = prof.vRad[j];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      rn[o] = nx; rn[o + 1] = ny; rn[o + 2] = nz;
    }
  }
  const emit = (vi: number) => {
    const o = vi * 3;
    pos.push3(rv[o], rv[o + 1], rv[o + 2]);
    nrm.push3(rn[o], rn[o + 1], rn[o + 2]);
  };
  let faces = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < k; j++) {
      const jn = (j + 1) % k;
      const va = i * k + j, vb = i * k + jn, vc = (i + 1) * k + jn, vd = (i + 1) * k + j;
      emit(va); emit(vb); emit(vc);
      emit(va); emit(vc); emit(vd);
      faces += 2;
    }
  }
  // Flat end caps.
  for (const [ring, dir] of [[0, -1], [n - 1, 1]] as const) {
    const si = ring === 0 ? 0 : n - 2;
    const cnx = dx[si] * dir, cny = dy[si] * dir;
    const cx = P[ring * 3], cy = P[ring * 3 + 1], cz = P[ring * 3 + 2] - halfH;
    for (let j = 0; j < k; j++) {
      const jn = (j + 1) % k;
      const [p, q] = dir > 0 ? [ring * k + j, ring * k + jn] : [ring * k + jn, ring * k + j];
      pos.push3(cx, cy, cz); nrm.push3(cnx, cny, 0);
      pos.push3(rv[p * 3], rv[p * 3 + 1], rv[p * 3 + 2]); nrm.push3(cnx, cny, 0);
      pos.push3(rv[q * 3], rv[q * 3 + 1], rv[q * 3 + 2]); nrm.push3(cnx, cny, 0);
      faces++;
    }
  }
  return faces;
}

export interface BeadStats {
  movesKept: number;
  beads: number;
  faces: number;
}

/**
 * Sweep beads along the selected segments. Returns one MeshChunk per tool
 * (filamentIndex = tool + 1), in print-bed millimetres.
 */
export function buildBeadChunks(
  segments: Segment[],
  filamentDiameter: number,
  opts: BeadOptions = {},
  name = 'printed',
): { chunks: MeshChunk[]; stats: BeadStats } {
  const segs = selectSegments(segments, opts);
  const area = Math.PI * (filamentDiameter / 2) ** 2;
  const widths = new Float64Array(segs.length);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    widths[i] = beadWidth(Math.hypot(s.x1 - s.x0, s.y1 - s.y0), s.e, s.h, s.wHint, area);
  }
  const prof = stadiumProfile(Math.max(1, opts.smooth ?? 2));
  const beads = buildBeads(segs, widths, opts.splitAngleDeg ?? 80);
  const tol = opts.simplifyMm ?? 0.01;

  const perTool = new Map<number, { pos: FloatList; nrm: FloatList; faces: number }>();
  let moves = 0, faces = 0;
  for (const raw of beads) {
    const bead = simplify(raw, tol);
    moves += bead.widths.length;
    let t = perTool.get(bead.tool);
    if (!t) { t = { pos: new FloatList(), nrm: new FloatList(), faces: 0 }; perTool.set(bead.tool, t); }
    const f = sweep(bead, prof, t.pos, t.nrm);
    t.faces += f;
    faces += f;
  }
  const chunks: MeshChunk[] = [...perTool.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tool, t]) => ({
      name: `${name}_T${tool}`,
      filamentIndex: tool + 1,
      positions: t.pos.toArray(),
      normals: t.nrm.toArray(),
      faceCount: t.faces,
      smoothShaded: true,
    }));
  return { chunks, stats: { movesKept: moves, beads: beads.length, faces } };
}
