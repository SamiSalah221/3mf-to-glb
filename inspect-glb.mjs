/**
 * inspect-glb.mjs — dump node TRS, per-mesh world AABB, and asset.extras
 * from a GLB file so we can see the up-axis frame before/after the Y-up fix.
 *
 * Usage: node inspect-glb.mjs <file.glb>
 *
 * Expected pre-fix:  geometry tall along Z, up_axis:"z"
 * Expected post-fix: geometry tall along Y, up_axis:"y"
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const GLB_MAGIC = 0x46546c67; // 'glTF'

const path = process.argv[2];
if (!path) {
  console.error('Usage: node inspect-glb.mjs <file.glb>');
  process.exit(1);
}

const buf = await readFile(resolve(path));
const glb = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);

// Validate GLB header
const magic = view.getUint32(0, true);
if (magic !== GLB_MAGIC) {
  console.error(`Not a GLB file (magic 0x${magic.toString(16)})`);
  process.exit(1);
}
const version = view.getUint32(4, true);
const totalLen = view.getUint32(8, true);
console.log(`GLB version ${version}, ${totalLen} bytes (file: ${glb.byteLength})`);

// Parse JSON chunk (chunk 0)
const jsonChunkLen = view.getUint32(12, true);
const jsonChunkType = view.getUint32(16, true);
if (jsonChunkType !== 0x4e4f534a /* JSON */) {
  console.error('First chunk is not JSON');
  process.exit(1);
}
const jsonBytes = new Uint8Array(glb.buffer, glb.byteOffset + 20, jsonChunkLen);
const json = JSON.parse(new TextDecoder().decode(jsonBytes));

// ── asset.extras ─────────────────────────────────────────────────────────────
console.log('\n── asset.extras ──────────────────────────────────────────────');
const extras = json.asset?.extras ?? null;
if (!extras) {
  console.log('  (none)');
} else {
  for (const [k, v] of Object.entries(extras)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
}

// ── node hierarchy with TRS ───────────────────────────────────────────────────
console.log('\n── nodes (TRS) ───────────────────────────────────────────────');
const nodes = json.nodes ?? [];
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i];
  const t = n.translation ?? [0, 0, 0];
  const r = n.rotation   ?? [0, 0, 0, 1];
  const s = n.scale      ?? [1, 1, 1];
  const identity =
    t.every((v) => Math.abs(v) < 1e-9) &&
    Math.abs(r[0]) < 1e-9 && Math.abs(r[1]) < 1e-9 &&
    Math.abs(r[2]) < 1e-9 && Math.abs(r[3] - 1) < 1e-9 &&
    s.every((v) => Math.abs(v - 1) < 1e-9);
  const label = identity ? '(identity)' : '';
  console.log(`  node[${i}] ${n.name ?? ''} ${label}`);
  if (!identity) {
    console.log(`    T: [${t.map((v) => v.toFixed(4)).join(', ')}]`);
    console.log(`    R: [${r.map((v) => v.toFixed(4)).join(', ')}]`);
    console.log(`    S: [${s.map((v) => v.toFixed(4)).join(', ')}]`);
  }
}

// ── per-mesh POSITION AABB ────────────────────────────────────────────────────
console.log('\n── mesh AABBs (from POSITION accessor min/max) ───────────────');
const accessors = json.accessors ?? [];
const meshes = json.meshes ?? [];

let globalMin = [Infinity, Infinity, Infinity];
let globalMax = [-Infinity, -Infinity, -Infinity];
let anyAabb = false;

for (let mi = 0; mi < meshes.length; mi++) {
  const mesh = meshes[mi];
  for (const prim of mesh.primitives ?? []) {
    const accIdx = prim.attributes?.POSITION;
    if (accIdx == null) continue;
    const acc = accessors[accIdx];
    if (!acc?.min || !acc?.max) continue;
    anyAabb = true;
    for (let ax = 0; ax < 3; ax++) {
      if (acc.min[ax] < globalMin[ax]) globalMin[ax] = acc.min[ax];
      if (acc.max[ax] > globalMax[ax]) globalMax[ax] = acc.max[ax];
    }
    console.log(
      `  mesh[${mi}] "${mesh.name ?? ''}" ` +
        `min=[${acc.min.map((v) => v.toFixed(4)).join(', ')}] ` +
        `max=[${acc.max.map((v) => v.toFixed(4)).join(', ')}]`,
    );
  }
}

if (anyAabb) {
  const size = globalMin.map((v, i) => globalMax[i] - v);
  const axes = ['X', 'Y', 'Z'];
  const tallIdx = size.indexOf(Math.max(...size));
  console.log(
    `\n  GLOBAL  min=[${globalMin.map((v) => v.toFixed(4)).join(', ')}] ` +
      `max=[${globalMax.map((v) => v.toFixed(4)).join(', ')}]`,
  );
  console.log(
    `  SIZE    [${size.map((v) => v.toFixed(4)).join(', ')}] m  ` +
      `  ← TALLEST AXIS: ${axes[tallIdx]}`,
  );
}

console.log('');
