// Manifold + per-vertex-color regression checker for exported OBJ files.
//
// Streams a .obj (positions can reach millions of lines), then reports:
//   - open edges (an edge referenced by exactly one face): a watertight mesh
//     has none, and this is the metric Bambu Studio reports as "open edges"
//   - non-manifold edges (three or more faces): reported for visibility but not
//     a hard failure. Painted models legitimately have internal-wall junctions
//     (four distinct triangles meeting along one color-region edge), which are
//     watertight and present identically in the accepted GLB.
//   - degenerate faces (a face line that repeats a vertex index)
//   - duplicate-position vertices: exact string dups (a weld that should have
//     collapsed them but did not) plus near-miss pairs within --eps-mm on a
//     grid (the float-divergence signature the layer-clip path can leave)
//   - when open edges exist, each is classified to point at the cause:
//       T-junction: a third vertex sits strictly inside the edge (a neighbor
//                   split an edge this face did not conform to)
//       weld-miss:  an anti-parallel open twin edge exists within eps (two
//                   coincident corners quantized to different vertices)
//       hole:       neither (a genuinely missing face)
//   - per-vertex-color format compliance: every `v` line carries 6 numbers,
//     RGB in [0,1], no mtllib / usemtl, at least one `g` group
//   - winding, checked two independent ways, because neither alone is enough
//     and the open-edge count above sees neither (it keys edges as unordered
//     pairs, so a backwards mesh scores identically to a correct one):
//       inconsistent winding: a manifold edge whose two faces traverse it the
//                   SAME way, i.e. one of them is flipped relative to its
//                   neighbour. Catches a LOCAL tear, like one branch of the
//                   Z-clip path emitting its triangles reverse-wound.
//       signed volume: per connected component. A solid wound CCW-outward
//                   encloses POSITIVE volume. Catches a GLOBAL inversion, where
//                   winding is perfectly consistent but the whole object is
//                   inside-out and renders hollow under THREE.FrontSide
//                   (issue #9: a mirrored, negative-determinant build-item
//                   transform reverses every triangle).
//
// Exit code 1 on any open edge, winding fault, or format violation, so it gates
// exporter and parser-topology changes. See CLAUDE.md.
//
// Usage: node inspect-obj.mjs <file.obj> [--eps-mm 0.0002] [--examples 8]

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node inspect-obj.mjs <file.obj> [--eps-mm 0.0002] [--examples 8]');
  process.exit(2);
}
const epsMm = numFlag('--eps-mm', 2e-4);
const maxExamples = numFlag('--examples', 8);
// Cap the O(open x probe) T-junction/weld-miss classification so a pathological
// file with millions of open edges cannot hang the checker.
const CLASSIFY_CAP = 200000;

function numFlag(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
}

// ---------------------------------------------------------------------------
// Parse pass
// ---------------------------------------------------------------------------

const xs = [];
const ys = [];
const zs = [];
let coloredVertices = 0;
let badArity = 0; // v lines whose number count is not 6
let rgbOutOfRange = 0;
const firstBadArity = [];

let vnCount = 0;
let gCount = 0;
let mtllibCount = 0;
let usemtlCount = 0;
let faceCount = 0;
let degenerateFaces = 0;

// Edge multiset. Key packs the sorted 0-based vertex indices into one integer:
// min * 2^26 + max. 2^26 = 67,108,864 > any vertex count we produce.
const EDGE_SHIFT = 2 ** 26;
// The value packs TWO counters so winding consistency costs no extra map:
//   packed = count * EDGE_COUNT_SCALE + (EDGE_DIR_BIAS + imbalance)
// `count` is how many faces touch the edge; `imbalance` is +1 per face that
// traverses it low->high minus 1 per face that traverses it high->low. Two
// faces sharing an edge with consistent winding traverse it in OPPOSITE
// directions, so a correctly wound manifold edge has count 2 and imbalance 0.
// Imbalance stays far inside the bias, so the two never collide.
const EDGE_COUNT_SCALE = 4096;
const EDGE_DIR_BIAS = 2048;
const edgeUse = new Map(); // key -> packed(count, imbalance)
// Retain a couple of example faces per open edge for the T-junction probe.
const openEdgeList = []; // [aIdx, bIdx]

// Triangle corners, retained for the orientation pass (component labelling +
// signed volume). Int32Array rather than a plain array: 3 x 4 bytes per face
// keeps a 1.4M-face export around 17 MB.
let triBuf = new Int32Array(1 << 16);
let triLen = 0;

function pushTri(a, b, c) {
  if (triLen + 3 > triBuf.length) {
    const grown = new Int32Array(triBuf.length * 2);
    grown.set(triBuf);
    triBuf = grown;
  }
  triBuf[triLen++] = a;
  triBuf[triLen++] = b;
  triBuf[triLen++] = c;
}

const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });

for await (const line of rl) {
  if (line.length === 0) continue;
  const c0 = line.charCodeAt(0);
  // Fast reject for the common `v ` and `f ` cases before slicing.
  if (c0 === 118 /* v */) {
    if (line[1] === ' ') {
      parseVertex(line);
    } else if (line[1] === 'n') {
      vnCount++;
    }
    continue;
  }
  if (c0 === 102 /* f */ && line[1] === ' ') {
    parseFace(line);
    continue;
  }
  if (c0 === 103 /* g */ && line[1] === ' ') {
    gCount++;
    continue;
  }
  if (line.startsWith('mtllib')) mtllibCount++;
  else if (line.startsWith('usemtl')) usemtlCount++;
}

function parseVertex(line) {
  const parts = line.split(/\s+/);
  // parts[0] === 'v'
  const nums = parts.length - 1;
  const x = +parts[1];
  const y = +parts[2];
  const z = +parts[3];
  xs.push(x);
  ys.push(y);
  zs.push(z);
  if (nums !== 6) {
    badArity++;
    if (firstBadArity.length < maxExamples) firstBadArity.push({ n: nums, line: line.slice(0, 80) });
    return;
  }
  const r = +parts[4];
  const g = +parts[5];
  const b = +parts[6];
  if (r < 0 || r > 1 || g < 0 || g > 1 || b < 0 || b > 1) rgbOutOfRange++;
  // A vertex is "colored" when it is not pure white; white is the neutral fill.
  if (r !== 1 || g !== 1 || b !== 1) coloredVertices++;
}

function parseFace(line) {
  const parts = line.split(/\s+/);
  // Collect the position index (token before the first slash) for each corner.
  const idx = [];
  for (let i = 1; i < parts.length; i++) {
    if (!parts[i]) continue;
    const slash = parts[i].indexOf('/');
    const vi = parseInt(slash === -1 ? parts[i] : parts[i].slice(0, slash), 10);
    idx.push(vi > 0 ? vi - 1 : vi); // to 0-based (negative OBJ refs left as-is)
  }
  if (idx.length < 3) return;
  faceCount++;
  // Only triangles are emitted by this app; fan-triangulate defensively anyway.
  for (let t = 2; t < idx.length; t++) {
    const a = idx[0], b = idx[t - 1], c = idx[t];
    if (a === b || b === c || a === c) {
      degenerateFaces++;
      continue;
    }
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
    pushTri(a, b, c);
  }
}

function addEdge(a, b) {
  const ascending = a < b;
  const lo = ascending ? a : b;
  const hi = ascending ? b : a;
  const dir = ascending ? 1 : -1;
  const key = lo * EDGE_SHIFT + hi;
  const prev = edgeUse.get(key);
  edgeUse.set(
    key,
    prev === undefined
      ? EDGE_COUNT_SCALE + EDGE_DIR_BIAS + dir
      : prev + EDGE_COUNT_SCALE + dir,
  );
}

// ---------------------------------------------------------------------------
// Edge analysis
// ---------------------------------------------------------------------------

let openEdges = 0;
let nonManifoldEdges = 0;
// Manifold edges whose two faces traverse them the SAME way: one of the pair is
// wound backwards relative to its neighbour. Unlike a whole mirrored object
// (consistent winding, just inverted -- caught by signed volume below), this is
// a local tear, e.g. the Z-clip path emitting one of its cases reverse-wound.
let inconsistentEdges = 0;
const inconsistentExamples = [];
for (const [key, packed] of edgeUse) {
  const count = Math.floor(packed / EDGE_COUNT_SCALE);
  const imbalance = packed - count * EDGE_COUNT_SCALE - EDGE_DIR_BIAS;
  if (count === 1) {
    openEdges++;
    if (openEdgeList.length < CLASSIFY_CAP) {
      const hi = key % EDGE_SHIFT;
      const lo = (key - hi) / EDGE_SHIFT;
      openEdgeList.push([lo, hi]);
    }
  } else if (count >= 3) {
    nonManifoldEdges++;
  } else if (imbalance !== 0) {
    // count === 2
    inconsistentEdges++;
    if (inconsistentExamples.length < maxExamples) {
      const hi = key % EDGE_SHIFT;
      const lo = (key - hi) / EDGE_SHIFT;
      inconsistentExamples.push([lo, hi]);
    }
  }
}

const vCount = xs.length;

// ---------------------------------------------------------------------------
// Orientation: per-connected-component signed volume
//
// For a closed surface wound CCW-outward, sum(dot(a, cross(b, c))) / 6 over its
// triangles is the enclosed volume and is POSITIVE. Reflecting a mesh (a
// negative-determinant build-item transform, i.e. Bambu's Mirror along X/Y/Z)
// reverses every triangle's winding and flips that sign, which is invisible to
// every other check here. Components are found by union-find over the triangle
// corners, so one inverted object on a plate of correct ones is still caught.
// ---------------------------------------------------------------------------

const parent = new Int32Array(vCount);
for (let i = 0; i < vCount; i++) parent[i] = i;

function findRoot(x) {
  let r = x;
  while (parent[r] !== r) r = parent[r];
  // Path-compress so repeated lookups over millions of faces stay near O(1).
  while (parent[x] !== r) {
    const next = parent[x];
    parent[x] = r;
    x = next;
  }
  return r;
}

function union(a, b) {
  const ra = findRoot(a);
  const rb = findRoot(b);
  if (ra !== rb) parent[rb] = ra;
}

// Faces referencing an out-of-range or negative (relative) index are skipped
// rather than trusted; this app never emits them.
let orientationSkipped = 0;
const inRange = (i) => i >= 0 && i < vCount;

for (let t = 0; t < triLen; t += 3) {
  const a = triBuf[t], b = triBuf[t + 1], c = triBuf[t + 2];
  if (!inRange(a) || !inRange(b) || !inRange(c)) {
    orientationSkipped++;
    continue;
  }
  union(a, b);
  union(b, c);
}

// root -> { volume, faces, bbox }
const components = new Map();

for (let t = 0; t < triLen; t += 3) {
  const a = triBuf[t], b = triBuf[t + 1], c = triBuf[t + 2];
  if (!inRange(a) || !inRange(b) || !inRange(c)) continue;
  const root = findRoot(a);
  let comp = components.get(root);
  if (!comp) {
    comp = {
      volume: 0,
      faces: 0,
      openEdges: 0,
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    };
    components.set(root, comp);
  }
  const ax = xs[a], ay = ys[a], az = zs[a];
  const bx = xs[b], by = ys[b], bz = zs[b];
  const cx = xs[c], cy = ys[c], cz = zs[c];
  // dot(a, cross(b, c)) / 6
  comp.volume +=
    (ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx)) / 6;
  comp.faces++;
  for (const [px, py, pz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
    if (px < comp.minX) comp.minX = px;
    if (py < comp.minY) comp.minY = py;
    if (pz < comp.minZ) comp.minZ = pz;
    if (px > comp.maxX) comp.maxX = px;
    if (py > comp.maxY) comp.maxY = py;
    if (pz > comp.maxZ) comp.maxZ = pz;
  }
}

// Attribute open edges to their component so the report can say whether a
// negative volume came from a closed solid (conclusive) or a torn one.
for (const [lo, hi] of openEdgeList) {
  if (!inRange(lo) || !inRange(hi)) continue;
  const comp = components.get(findRoot(lo));
  if (comp) comp.openEdges++;
}

// A component is judged only when its signed volume is a real volume rather
// than float noise: compare against its own bounding box, so the test is
// scale-free and a small mirrored part on a big plate is still judged.
const VOLUME_NOISE_FRACTION = 1e-6;
const invertedComponents = [];
const componentList = [...components.values()].sort((p, q) => Math.abs(q.volume) - Math.abs(p.volume));
for (const comp of componentList) {
  const bboxVol =
    Math.max(comp.maxX - comp.minX, 0) *
    Math.max(comp.maxY - comp.minY, 0) *
    Math.max(comp.maxZ - comp.minZ, 0);
  comp.significant = Math.abs(comp.volume) > bboxVol * VOLUME_NOISE_FRACTION;
  if (comp.significant && comp.volume < 0) invertedComponents.push(comp);
}

// ---------------------------------------------------------------------------
// Spatial grid over vertex positions for duplicate + classification probes
// ---------------------------------------------------------------------------

const cell = Math.max(epsMm, 1e-6);
const grid = new Map(); // cellKey -> array of vertex indices
const cellKey = (x, y, z) =>
  `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
for (let i = 0; i < vCount; i++) {
  const k = cellKey(xs[i], ys[i], zs[i]);
  const bucket = grid.get(k);
  if (bucket) bucket.push(i);
  else grid.set(k, [i]);
}

function neighbors(x, y, z) {
  const cx = Math.round(x / cell);
  const cy = Math.round(y / cell);
  const cz = Math.round(z / cell);
  const out = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (bucket) out.push(...bucket);
      }
  return out;
}

const eps = epsMm;
const eps2 = eps * eps;
const dist2 = (i, j) => {
  const dx = xs[i] - xs[j], dy = ys[i] - ys[j], dz = zs[i] - zs[j];
  return dx * dx + dy * dy + dz * dz;
};

// Duplicate positions: distinct vertex indices closer than eps.
let dupPairs = 0;
const dupExamples = [];
const seenDup = new Set();
for (const bucket of grid.values()) {
  if (bucket.length < 2) continue;
  for (let a = 0; a < bucket.length; a++) {
    for (const j of neighbors(xs[bucket[a]], ys[bucket[a]], zs[bucket[a]])) {
      const i = bucket[a];
      if (j <= i) continue;
      if (dist2(i, j) <= eps2) {
        const pk = i * EDGE_SHIFT + j;
        if (seenDup.has(pk)) continue;
        seenDup.add(pk);
        dupPairs++;
        if (dupExamples.length < maxExamples) dupExamples.push([i, j]);
      }
    }
  }
}

// Classify open edges.
let tJunctions = 0;
let weldMisses = 0;
let holes = 0;
const classifyExamples = { tj: [], wm: [], hole: [] };

// Build a lookup of open edges by endpoint-cell so weld-miss twins are findable.
const onSegment = (px, py, pz, ax, ay, az, bx, by, bz) => {
  // Distance from point p to segment ab, plus a strict-interior test.
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const abLen2 = abx * abx + aby * aby + abz * abz;
  if (abLen2 === 0) return false;
  const t = (apx * abx + apy * aby + apz * abz) / abLen2;
  if (t <= 1e-4 || t >= 1 - 1e-4) return false; // strictly interior only
  const cx = ax + t * abx, cy = ay + t * aby, cz = az + t * abz;
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  return dx * dx + dy * dy + dz * dz <= eps2;
};

let classified = 0;
for (const [a, b] of openEdgeList) {
  if (classified >= CLASSIFY_CAP) break;
  classified++;
  const ax = xs[a], ay = ys[a], az = zs[a];
  const bx = xs[b], by = ys[b], bz = zs[b];
  const midx = (ax + bx) / 2, midy = (ay + by) / 2, midz = (az + bz) / 2;

  // T-junction: any vertex strictly interior to the segment within eps.
  let isTj = false;
  for (const v of neighbors(midx, midy, midz)) {
    if (v === a || v === b) continue;
    if (onSegment(xs[v], ys[v], zs[v], ax, ay, az, bx, by, bz)) {
      isTj = true;
      break;
    }
  }
  if (isTj) {
    tJunctions++;
    if (classifyExamples.tj.length < maxExamples) classifyExamples.tj.push([a, b]);
    continue;
  }

  // Weld-miss: a distinct open edge whose endpoints coincide (within eps) with
  // this one's. Probe vertices near a and b for near-duplicate partners that
  // form an open edge.
  let isWm = false;
  const nearA = neighbors(ax, ay, az).filter((v) => v !== a && dist2(v, a) <= eps2);
  const nearB = neighbors(bx, by, bz).filter((v) => v !== b && dist2(v, b) <= eps2);
  outer: for (const a2 of [a, ...nearA]) {
    for (const b2 of [b, ...nearB]) {
      if (a2 === a && b2 === b) continue;
      const lo = a2 < b2 ? a2 : b2;
      const hi = a2 < b2 ? b2 : a2;
      if (edgeUse.get(lo * EDGE_SHIFT + hi) === 1) {
        isWm = true;
        break outer;
      }
    }
  }
  if (isWm) {
    weldMisses++;
    if (classifyExamples.wm.length < maxExamples) classifyExamples.wm.push([a, b]);
    continue;
  }

  holes++;
  if (classifyExamples.hole.length < maxExamples) classifyExamples.hole.push([a, b]);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const fmtPt = (i) =>
  `#${i} (${xs[i].toFixed(4)}, ${ys[i].toFixed(4)}, ${zs[i].toFixed(4)})`;

console.log(`file: ${file}`);
console.log(`eps: ${epsMm} mm`);
console.log('');
console.log(`vertices:        ${vCount.toLocaleString()}`);
console.log(`  colored:       ${coloredVertices.toLocaleString()} (non-white)`);
console.log(`normals (vn):    ${vnCount.toLocaleString()}`);
console.log(`faces:           ${faceCount.toLocaleString()}`);
console.log(`groups (g):      ${gCount}`);
console.log('');
console.log(`open edges:      ${openEdges.toLocaleString()}`);
if (openEdges > 0) {
  const capped = classified < openEdges ? ` (classified first ${classified.toLocaleString()})` : '';
  console.log(`  T-junction:    ${tJunctions.toLocaleString()}${capped}`);
  console.log(`  weld-miss:     ${weldMisses.toLocaleString()}`);
  console.log(`  hole:          ${holes.toLocaleString()}`);
  for (const [label, ex] of [['T-junction', classifyExamples.tj], ['weld-miss', classifyExamples.wm], ['hole', classifyExamples.hole]]) {
    for (const [a, b] of ex) console.log(`    ${label}: ${fmtPt(a)} -- ${fmtPt(b)}`);
  }
}
console.log(`non-manifold:    ${nonManifoldEdges.toLocaleString()} (informational; internal walls are legitimate)`);
console.log(`inconsistent winding: ${inconsistentEdges.toLocaleString()} manifold edges whose two faces run the same way`);
for (const [a, b] of inconsistentExamples) console.log(`    ${fmtPt(a)} -- ${fmtPt(b)}`);
console.log('');
console.log(`components:      ${componentList.length} (signed volume; negative = inside-out)`);
for (const comp of componentList.slice(0, Math.max(maxExamples, 8))) {
  const flag = comp.significant && comp.volume < 0 ? '  <== INVERTED' : '';
  const torn = comp.openEdges > 0 ? `, ${comp.openEdges.toLocaleString()} open` : '';
  const noise = comp.significant ? '' : ', below noise floor (not judged)';
  console.log(
    `  vol ${comp.volume.toFixed(4)} mm^3, ${comp.faces.toLocaleString()} faces${torn}${noise}${flag}`,
  );
}
if (componentList.length > Math.max(maxExamples, 8)) {
  console.log(`  ... ${componentList.length - Math.max(maxExamples, 8)} more`);
}
if (orientationSkipped > 0) {
  console.log(`  skipped ${orientationSkipped.toLocaleString()} faces with out-of-range indices`);
}
console.log(`degenerate faces: ${degenerateFaces.toLocaleString()}`);
console.log(`dup-position pairs (<= eps): ${dupPairs.toLocaleString()}`);
for (const [i, j] of dupExamples) console.log(`    dup: ${fmtPt(i)} == ${fmtPt(j)}`);
console.log('');
console.log('format:');
console.log(`  v lines with != 6 numbers: ${badArity.toLocaleString()}`);
for (const e of firstBadArity) console.log(`    (${e.n} nums) ${e.line}`);
console.log(`  RGB out of [0,1]: ${rgbOutOfRange.toLocaleString()}`);
console.log(`  mtllib lines: ${mtllibCount}`);
console.log(`  usemtl lines: ${usemtlCount}`);
console.log('');

const failures = [];
if (openEdges > 0) failures.push(`${openEdges} open edges`);
if (invertedComponents.length > 0) {
  failures.push(`${invertedComponents.length} inside-out component(s) (negative signed volume)`);
}
if (inconsistentEdges > 0) {
  failures.push(`${inconsistentEdges} edges with inconsistent winding`);
}
if (badArity > 0) failures.push(`${badArity} v lines without 6 numbers`);
if (rgbOutOfRange > 0) failures.push(`${rgbOutOfRange} RGB values out of range`);
if (mtllibCount > 0) failures.push(`${mtllibCount} mtllib lines (MTL must be gone)`);
if (usemtlCount > 0) failures.push(`${usemtlCount} usemtl lines (MTL must be gone)`);
if (gCount === 0) failures.push('no g groups');

if (failures.length === 0) {
  console.log('PASS: watertight, outward-wound, per-vertex-color OBJ');
  process.exit(0);
} else {
  console.log(`FAIL: ${failures.join('; ')}`);
  process.exit(1);
}
