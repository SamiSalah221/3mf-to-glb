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
// Output is indexed geometry, one MeshChunk per tool, in print-bed millimetres:
// every ring vertex is written once and shared by the six triangles around it,
// so a print costs about a third of the bytes of a triangle soup. Buffers are
// sized by an exact count pass and filled once, never grown.
//
// A face budget (optional) steps the fidelity down on big prints, the same
// pattern as the paint path's PAINT_FACE_BUDGET: the full-detail output is
// kept whenever it fits, and only a print that would overflow is simplified,
// one notch at a time, until it fits. The caller decides the budget (the
// viewer uses a small one, export a large one, the CLI none).

import type { MeshChunk } from '../../types/index.js';
import { FEATURES, featureId, type Feature, type Segments } from './readGcode.js';

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
  /**
   * Largest triangle count to produce. When the full-detail sweep would
   * exceed it, fidelity steps down the FIDELITY_LADDER until it fits. Options
   * given explicitly above are pinned and never changed by the ladder.
   * Default: no budget (exact).
   */
  faceBudget?: number;
}

/** Triangle budget for the live viewer. Above it the ladder engages. */
export const BEAD_FACE_BUDGET_VIEWER = 6_000_000;
/** Triangle budget for export: full detail unless the file is truly enormous. */
export const BEAD_FACE_BUDGET_EXPORT = 30_000_000;

/** The knobs the ladder may turn, with their full-detail defaults. */
export interface FidelityTier {
  simplifyMm: number;
  smooth: number;
  splitAngleDeg: number;
  innerWalls: 'auto' | 'all' | 'none';
}

/**
 * Fidelity steps, full detail first. Each later step only loosens one knob,
 * so the first tier that fits the budget is the closest to the slicer's view.
 */
export const FIDELITY_LADDER: readonly FidelityTier[] = [
  { simplifyMm: 0.01, smooth: 2, splitAngleDeg: 80, innerWalls: 'auto' },
  { simplifyMm: 0.03, smooth: 2, splitAngleDeg: 80, innerWalls: 'auto' },
  { simplifyMm: 0.05, smooth: 2, splitAngleDeg: 80, innerWalls: 'auto' },
  { simplifyMm: 0.05, smooth: 1, splitAngleDeg: 80, innerWalls: 'auto' },
  { simplifyMm: 0.05, smooth: 1, splitAngleDeg: 110, innerWalls: 'auto' },
  { simplifyMm: 0.05, smooth: 1, splitAngleDeg: 110, innerWalls: 'none' },
  { simplifyMm: 0.1, smooth: 1, splitAngleDeg: 110, innerWalls: 'none' },
  { simplifyMm: 0.2, smooth: 1, splitAngleDeg: 110, innerWalls: 'none' },
];

/** What a buyer can actually see on the finished part. */
const VISIBLE: readonly Feature[] = [
  'outer_wall', 'inner_wall', 'overhang', 'top_surface', 'bottom_surface', 'bridge', 'gap_fill', 'unknown',
];
const ALL: readonly Feature[] = [...VISIBLE, 'solid_infill', 'sparse_infill'];

const F_INNER = featureId('inner_wall');
const F_TOP = featureId('top_surface');
const F_BOTTOM = featureId('bottom_surface');
const F_BRIDGE = featureId('bridge');
const F_OVERHANG = featureId('overhang');

/** Indices of the segments to sweep, in file order. Exported for tests. */
export function selectSegments(segments: Segments, opts: BeadOptions = {}): Uint32Array<ArrayBuffer> {
  const keep = new Uint8Array(FEATURES.length);
  for (const f of opts.detail === 'all' ? ALL : VISIBLE) keep[featureId(f)] = 1;
  if (opts.supports) keep[featureId('support')] = 1;
  if (opts.brim) keep[featureId('brim')] = 1;
  if (opts.ironing) keep[featureId('ironing')] = 1;
  const inner = opts.innerWalls ?? 'auto';
  if (inner === 'none') keep[F_INNER] = 0;

  const feat = segments.feature;
  let n = 0;
  for (let i = 0; i < segments.count; i++) if (keep[feat[i]]) n++;
  const kept = new Uint32Array(n);
  n = 0;
  for (let i = 0; i < segments.count; i++) if (keep[feat[i]]) kept[n++] = i;
  return inner === 'auto' ? cullHiddenInnerWalls(segments, kept) : kept;
}

function cullHiddenInnerWalls(segments: Segments, kept: Uint32Array<ArrayBuffer>, reachLayers = 3.5): Uint32Array<ArrayBuffer> {
  if (!kept.length) return kept;
  const exposed = new Set<number>();
  let first = Infinity;
  const feat = segments.feature, z1 = segments.z1, hh = segments.h;
  for (let k = 0; k < kept.length; k++) {
    const i = kept[k];
    const z = z1[i];
    if (z < first) first = z;
    const f = feat[i];
    if (f === F_TOP || f === F_BOTTOM || f === F_BRIDGE || f === F_OVERHANG) exposed.add(Math.round(z * 1000) / 1000);
  }
  const zs = Float64Array.from([...exposed, first]).sort();
  let n = 0;
  const out = new Uint32Array(kept.length);
  for (let k = 0; k < kept.length; k++) {
    const i = kept[k];
    if (feat[i] !== F_INNER) { out[n++] = i; continue; }
    const z = z1[i];
    // nearest exposed layer, by binary search
    let lo = 0, hi = zs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (zs[mid] < z) lo = mid + 1; else hi = mid;
    }
    const d = Math.min(Math.abs(zs[lo] - z), lo > 0 ? Math.abs(zs[lo - 1] - z) : Infinity);
    if (d <= hh[i] * reachLayers) out[n++] = i;
  }
  return out.slice(0, n) as Uint32Array<ArrayBuffer>;
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

/**
 * Polylines ready to sweep: bead b runs over points ptStart[b] .. ptStart[b+1]
 * (exclusive) of px/py/pz, with pw[p] the bead width between point p and p+1.
 */
interface Polylines {
  beads: number;
  ptStart: Uint32Array;
  px: Float32Array; py: Float32Array; pz: Float32Array; pw: Float32Array;
  h: Float32Array;
  tool: Uint8Array;
  moves: number;
}

/**
 * Join touching moves into beads (a sharp corner or a change of tool, feature,
 * or layer height starts a new one), then drop points on near-straight runs
 * (within `tol` mm), merging their widths. Two passes over typed arrays sized
 * by the kept move count; no per-bead objects.
 */
function buildPolylines(
  segments: Segments, kept: Uint32Array, filamentArea: number, splitTurnDeg: number, tol: number,
): Polylines {
  const m = kept.length;
  const { x0, y0, z0, x1, y1, z1, e, h: hh, wHint, feature, tool } = segments;
  const cosSplit = Math.cos((splitTurnDeg * Math.PI) / 180);

  // Pass 1: raw beads. Point p of the raw stream, width rw[p] for the segment
  // starting at p. Bead b spans raw points rawStart[b] .. rawStart[b+1].
  const cap = m * 2 + 2;
  const rx = new Float32Array(cap), ry = new Float32Array(cap), rz = new Float32Array(cap), rw = new Float32Array(cap);
  const rawStart: number[] = [];
  const hs: number[] = [];
  const tools: number[] = [];
  let np = 0;
  let prev = -1;
  let hSum = 0, hN = 0;
  for (let k = 0; k < m; k++) {
    const i = kept[k];
    let joined =
      prev >= 0 &&
      tool[i] === tool[prev] && feature[i] === feature[prev] &&
      Math.abs(x0[i] - x1[prev]) < 1e-4 && Math.abs(y0[i] - y1[prev]) < 1e-4 && Math.abs(z0[i] - z1[prev]) < 1e-3 &&
      Math.abs(hh[i] - hh[prev]) < 1e-3;
    if (joined) {
      const d0x = x1[prev] - x0[prev], d0y = y1[prev] - y0[prev];
      const d1x = x1[i] - x0[i], d1y = y1[i] - y0[i];
      const n0 = Math.hypot(d0x, d0y), n1 = Math.hypot(d1x, d1y);
      if (n0 > 0 && n1 > 0 && (d0x * d1x + d0y * d1y) / (n0 * n1) < cosSplit) joined = false; // sharp corner
    }
    if (!joined) {
      if (prev >= 0) { hs.push(hSum / hN); tools.push(tool[prev]); }
      hSum = 0; hN = 0;
      rawStart.push(np);
      rx[np] = x0[i]; ry[np] = y0[i]; rz[np] = z0[i];
      np++;
    }
    rw[np - 1] = beadWidth(Math.hypot(x1[i] - x0[i], y1[i] - y0[i]), e[i], hh[i], wHint[i], filamentArea);
    rx[np] = x1[i]; ry[np] = y1[i]; rz[np] = z1[i];
    np++;
    hSum += hh[i]; hN++;
    prev = i;
  }
  if (prev >= 0) { hs.push(hSum / hN); tools.push(tool[prev]); }
  rawStart.push(np);
  const beads = hs.length;

  // Pass 2: simplify each bead into the output stream.
  const px = new Float32Array(np), py = new Float32Array(np), pz = new Float32Array(np), pw = new Float32Array(np);
  const ptStart = new Uint32Array(beads + 1);
  let op = 0;
  for (let b = 0; b < beads; b++) {
    const s0 = rawStart[b];
    const n = rawStart[b + 1] - s0;
    ptStart[b] = op;
    if (tol <= 0 || n <= 2) {
      for (let i = 0; i < n; i++) { px[op] = rx[s0 + i]; py[op] = ry[s0 + i]; pz[op] = rz[s0 + i]; pw[op] = rw[s0 + i]; op++; }
      continue;
    }
    let anchor = 0;
    let acc = rw[s0], accN = 1;
    px[op] = rx[s0]; py[op] = ry[s0]; pz[op] = rz[s0]; op++;
    for (let i = 1; i < n - 1; i++) {
      const ax = rx[s0 + anchor], ay = ry[s0 + anchor];
      const cx = rx[s0 + i + 1] - ax, cy = ry[s0 + i + 1] - ay;
      const L = Math.hypot(cx, cy);
      let ok = true;
      if (L > 1e-9) {
        for (let j = anchor + 1; j <= i; j++) {
          const qx = rx[s0 + j] - ax, qy = ry[s0 + j] - ay;
          if (Math.abs(cx * qy - cy * qx) / L > tol) { ok = false; break; }
        }
      }
      if (ok && Math.abs(rw[s0 + i] - rw[s0 + anchor]) < 0.05 && Math.abs(rz[s0 + i + 1] - rz[s0 + anchor]) < 0.02) {
        acc += rw[s0 + i]; accN++;
        continue;
      }
      pw[op - 1] = acc / accN;
      px[op] = rx[s0 + i]; py[op] = ry[s0 + i]; pz[op] = rz[s0 + i]; op++;
      anchor = i;
      acc = rw[s0 + i]; accN = 1;
    }
    pw[op - 1] = acc / accN;
    px[op] = rx[s0 + n - 1]; py[op] = ry[s0 + n - 1]; pz[op] = rz[s0 + n - 1]; op++;
  }
  ptStart[beads] = op;

  return {
    beads,
    ptStart,
    px: px.subarray(0, op), py: py.subarray(0, op), pz: pz.subarray(0, op), pw: pw.subarray(0, op),
    h: Float32Array.from(hs),
    tool: Uint8Array.from(tools),
    moves: m,
  };
}

/** Vertex and triangle counts of one swept bead with n points and a k-point ring. */
function beadVerts(n: number, k: number): number { return n * k + 2 * (k + 1); }
function beadFaces(n: number, k: number): number { return (n - 1) * k * 2 + 2 * k; }

interface ToolBuffers {
  pos: Float32Array; nrm: Float32Array; idx: Uint32Array;
  v: number; f: number; // write cursors (vertices, triangles)
}

/** Sweep the stadium along bead b of `pl`, appending indexed triangles to `t`. */
function sweep(pl: Polylines, b: number, prof: Profile, h: number, t: ToolBuffers): void {
  const p0 = pl.ptStart[b];
  const n = pl.ptStart[b + 1] - p0;
  const k = prof.uOff.length;
  const halfH = h / 2;
  const { px, py, pz, pw } = pl;
  const { pos, nrm, idx } = t;
  const base = t.v;

  // Per-segment direction.
  const dx = new Float64Array(n - 1), dy = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const ex = px[p0 + i + 1] - px[p0 + i], ey = py[p0 + i + 1] - py[p0 + i];
    const L = Math.max(Math.hypot(ex, ey), 1e-9);
    dx[i] = ex / L; dy[i] = ey / L;
  }
  // Rings: n * k vertices, shared by the side quads.
  let v = base;
  for (let i = 0; i < n; i++) {
    // miter: lateral = normalised sum of the neighbouring left normals
    let lx: number, ly: number, scale = 1;
    const a = Math.max(i - 1, 0), bb = Math.min(i, n - 2);
    const l0x = -dy[a], l0y = dx[a], l1x = -dy[bb], l1y = dx[bb];
    if (a === bb) { lx = l0x; ly = l0y; } else {
      lx = l0x + l1x; ly = l0y + l1y;
      const mm = Math.hypot(lx, ly);
      if (mm > 1e-9) { lx /= mm; ly /= mm; } else { lx = l1x; ly = l1y; }
      scale = Math.min(Math.max(1 / Math.max(lx * l1x + ly * l1y, 1e-3), 1), 2);
    }
    const w = i === 0 ? pw[p0] : i === n - 1 ? pw[p0 + n - 2] : 0.5 * (pw[p0 + i - 1] + pw[p0 + i]);
    const side = Math.max(w / 2 - halfH, 0);
    const cx = px[p0 + i], cy = py[p0 + i], cz = pz[p0 + i] - halfH; // toolpath Z is the top of the bead
    for (let j = 0; j < k; j++) {
      const u = (prof.uOff[j] * side + prof.uRad[j] * halfH) * scale;
      const o = v * 3;
      pos[o] = cx + lx * u; pos[o + 1] = cy + ly * u; pos[o + 2] = cz + prof.vRad[j] * halfH;
      const nx = lx * prof.uRad[j], ny = ly * prof.uRad[j], nz = prof.vRad[j];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm[o] = nx / nl; nrm[o + 1] = ny / nl; nrm[o + 2] = nz / nl;
      v++;
    }
  }
  let f = t.f;
  for (let i = 0; i < n - 1; i++) {
    const r0 = base + i * k, r1 = r0 + k;
    for (let j = 0; j < k; j++) {
      const jn = (j + 1) % k;
      const va = r0 + j, vb = r0 + jn, vc = r1 + jn, vd = r1 + j;
      let o = f * 3;
      idx[o] = va; idx[o + 1] = vb; idx[o + 2] = vc;
      o += 3;
      idx[o] = va; idx[o + 1] = vc; idx[o + 2] = vd;
      f += 2;
    }
  }
  // Flat end caps: their own k + 1 vertices each, so the cap normal stays flat.
  for (const [ring, dir] of [[0, -1], [n - 1, 1]] as const) {
    const si = ring === 0 ? 0 : n - 2;
    const cnx = dx[si] * dir, cny = dy[si] * dir;
    const center = v;
    let o = v * 3;
    pos[o] = px[p0 + ring]; pos[o + 1] = py[p0 + ring]; pos[o + 2] = pz[p0 + ring] - halfH;
    nrm[o] = cnx; nrm[o + 1] = cny; nrm[o + 2] = 0;
    v++;
    const rimBase = v;
    const ringBase = base + ring * k;
    for (let j = 0; j < k; j++) {
      o = v * 3;
      const src = (ringBase + j) * 3;
      pos[o] = pos[src]; pos[o + 1] = pos[src + 1]; pos[o + 2] = pos[src + 2];
      nrm[o] = cnx; nrm[o + 1] = cny; nrm[o + 2] = 0;
      v++;
    }
    for (let j = 0; j < k; j++) {
      const jn = (j + 1) % k;
      const p = dir > 0 ? rimBase + j : rimBase + jn;
      const q = dir > 0 ? rimBase + jn : rimBase + j;
      o = f * 3;
      idx[o] = center; idx[o + 1] = p; idx[o + 2] = q;
      f++;
    }
  }
  t.v = v;
  t.f = f;
}

export interface BeadStats {
  movesKept: number;
  beads: number;
  faces: number;
  vertices: number;
  /** The fidelity the sweep ran at. `reduced` is true when a budget forced a step down. */
  tier: FidelityTier & { index: number; reduced: boolean };
}

/** Apply pinned (explicit) options over a ladder tier. */
function resolveTier(opts: BeadOptions, tier: FidelityTier): FidelityTier {
  return {
    simplifyMm: opts.simplifyMm ?? tier.simplifyMm,
    smooth: Math.max(1, opts.smooth ?? tier.smooth),
    splitAngleDeg: opts.splitAngleDeg ?? tier.splitAngleDeg,
    innerWalls: opts.innerWalls ?? tier.innerWalls,
  };
}

/**
 * Sweep beads along the selected segments. Returns one indexed MeshChunk per
 * tool (filamentIndex = tool + 1), in print-bed millimetres.
 */
export function buildBeadChunks(
  segments: Segments,
  filamentDiameter: number,
  opts: BeadOptions = {},
  name = 'printed',
): { chunks: MeshChunk[]; stats: BeadStats } {
  const area = Math.PI * (filamentDiameter / 2) ** 2;
  const budget = opts.faceBudget ?? Infinity;

  // Walk the ladder until the exact face count fits the budget. The last tier
  // is used regardless, so a budget never produces an empty model.
  let pl: Polylines | null = null;
  let tier: FidelityTier = resolveTier(opts, FIDELITY_LADDER[0]);
  let tierIndex = 0;
  let faces = 0, verts = 0;
  const keptCache = new Map<string, Uint32Array>();
  for (let ti = 0; ti < FIDELITY_LADDER.length; ti++) {
    const t = resolveTier(opts, FIDELITY_LADDER[ti]);
    if (ti > 0 && t.simplifyMm === tier.simplifyMm && t.smooth === tier.smooth &&
        t.splitAngleDeg === tier.splitAngleDeg && t.innerWalls === tier.innerWalls) {
      continue; // pinned options made this step identical to the previous one
    }
    tier = t;
    tierIndex = ti;
    let kept = keptCache.get(t.innerWalls);
    if (!kept) { kept = selectSegments(segments, { ...opts, innerWalls: t.innerWalls }); keptCache.set(t.innerWalls, kept); }
    pl = buildPolylines(segments, kept, area, t.splitAngleDeg, t.simplifyMm);
    const k = 2 * (t.smooth + 1);
    faces = 0; verts = 0;
    for (let b = 0; b < pl.beads; b++) {
      const n = pl.ptStart[b + 1] - pl.ptStart[b];
      faces += beadFaces(n, k);
      verts += beadVerts(n, k);
    }
    if (faces <= budget) break;
  }
  if (!pl) throw new Error('no fidelity tier');
  const reduced = tierIndex > 0;

  const prof = stadiumProfile(tier.smooth);
  const k = prof.uOff.length;

  // Exact per-tool allocation.
  const perTool = new Map<number, ToolBuffers>();
  const toolVerts = new Map<number, number>(), toolFaces = new Map<number, number>();
  for (let b = 0; b < pl.beads; b++) {
    const n = pl.ptStart[b + 1] - pl.ptStart[b];
    const tool = pl.tool[b];
    toolVerts.set(tool, (toolVerts.get(tool) ?? 0) + beadVerts(n, k));
    toolFaces.set(tool, (toolFaces.get(tool) ?? 0) + beadFaces(n, k));
  }
  for (const [tool, nv] of toolVerts) {
    const nf = toolFaces.get(tool)!;
    perTool.set(tool, {
      pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), idx: new Uint32Array(nf * 3), v: 0, f: 0,
    });
  }
  for (let b = 0; b < pl.beads; b++) sweep(pl, b, prof, pl.h[b], perTool.get(pl.tool[b])!);

  const chunks: MeshChunk[] = [...perTool.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tool, t]) => ({
      name: `${name}_T${tool}`,
      filamentIndex: tool + 1,
      positions: t.pos,
      normals: t.nrm,
      indices: t.idx,
      faceCount: t.f,
      smoothShaded: true,
    }));
  return {
    chunks,
    stats: { movesKept: pl.moves, beads: pl.beads, faces, vertices: verts, tier: { ...tier, index: tierIndex, reduced } },
  };
}
