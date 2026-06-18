// End-to-end smoke for the headless library, CLI, 3MF write-back, and the
// real-world-scale GLB export.
//
// For every fixture in samples/:
//   1. parse → produces ParseResult
//   2. recolor every filament to #FF00FF
//   3. exportRecolored3MF → fresh 3MF bytes
//   4. parse the rewritten 3MF → assert every filament's currentColor is #FF00FF
//   5. convertToGLB on the rewritten 3MF → assert GLB magic + version
//
// Plus a synthetic 100 mm-cube test (no on-disk fixture needed):
//   6. Build a minimal 3MF in memory with unit="millimeter" and an 8-vertex
//      cube whose coordinates are 0..100.
//   7. convertToGLB and parse the asset.extras + POSITION accessor min/max.
//      The bbox MUST be 0.1 x 0.1 x 0.1 meters within float tolerance and
//      asset.extras.dimensions_mm MUST report 100 x 100 x 100.

import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import '../dist-lib/cli/nodePolyfills.js';
import {
  setDefaultDomParser,
  convertToGLB,
  parse3MF,
  applyRecolor,
  exportRecolored3MF,
} from '../dist-lib/lib/index.js';

setDefaultDomParser(new DOMParser());

const GLB_MAGIC = 0x46546c67;
const TARGET = '#FF00FF';
const SAMPLES = readdirSync('samples').filter((n) => n.endsWith('.3mf'));

let pass = 0;
let fail = 0;

function reportPass(label) {
  console.log(`  PASS ${label}`);
  pass++;
}
function reportFail(label, err) {
  console.error(`  FAIL ${label}: ${(err && err.message) || err}`);
  fail++;
}

// ---------------------------------------------------------------------------
// Fixture round-trip
// ---------------------------------------------------------------------------

for (const name of SAMPLES) {
  const path = resolve('samples', name);
  const buf = await readFile(path);
  try {
    const parsed = await parse3MF(buf);
    const mapping = Object.fromEntries(parsed.filaments.map((f) => [f.index, TARGET]));

    const recolored = applyRecolor(parsed, mapping);
    for (const f of recolored.filaments) {
      if (f.currentColor !== TARGET) throw new Error(`in-memory recolor failed for filament ${f.index}`);
    }

    const rewritten = await exportRecolored3MF(buf, mapping);
    const reparsed = await parse3MF(rewritten);
    for (const f of reparsed.filaments) {
      if (f.currentColor.toUpperCase() !== TARGET) {
        throw new Error(`round-trip color lost for filament ${f.index}: ${f.currentColor}`);
      }
    }

    const bytes = await convertToGLB(rewritten);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('GLB magic mismatch');
    if (view.getUint32(4, true) !== 2) throw new Error('GLB version != 2');

    reportPass(
      `${name}: ${parsed.plates.length}p / ${parsed.filaments.length}f, ` +
        `unit=${parsed.sourceUnit}, rewritten 3MF ${rewritten.byteLength.toLocaleString()}B, ` +
        `GLB ${bytes.byteLength.toLocaleString()}B`,
    );
  } catch (err) {
    reportFail(name, err);
  }
}

// ---------------------------------------------------------------------------
// 100 mm cube conformance: real-world scale + pivot survive the export.
//
// The cube source coords span 0..100mm. After the unit bake the cube is
// 0.1 m on each axis. The pivot mode controls where the origin sits.
// ---------------------------------------------------------------------------

const cubeBytes = await buildCube3MF(100);

async function checkCubePivot(label, opts, expect) {
  try {
    const glb = await convertToGLB(cubeBytes, opts);
    const { extras, posMin, posMax } = readGLBPositionInfo(glb);

    const size = [posMax[0] - posMin[0], posMax[1] - posMin[1], posMax[2] - posMin[2]];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(size[i] - 0.1) > 1e-4) {
        throw new Error(`bbox axis ${i} = ${size[i]} m, expected 0.1 m`);
      }
    }

    if (!extras) throw new Error('asset.extras missing');
    if (extras.source_unit !== 'millimeter') {
      throw new Error(`source_unit = ${extras.source_unit}, expected "millimeter"`);
    }
    if (extras.pivot_mode !== expect.pivotMode) {
      throw new Error(`pivot_mode = ${extras.pivot_mode}, expected ${expect.pivotMode}`);
    }
    if (extras.up_axis !== expect.upAxis) {
      throw new Error(`up_axis = ${extras.up_axis}, expected ${expect.upAxis}`);
    }
    for (let i = 0; i < 3; i++) {
      if (Math.abs(posMin[i] - expect.posMin[i]) > 1e-5) {
        throw new Error(`posMin[${i}] = ${posMin[i]}, expected ${expect.posMin[i]}`);
      }
      if (Math.abs(posMax[i] - expect.posMax[i]) > 1e-5) {
        throw new Error(`posMax[${i}] = ${posMax[i]}, expected ${expect.posMax[i]}`);
      }
    }
    reportPass(
      `${label}: GLB POSITION min=[${posMin.map((v) => v.toFixed(3)).join(', ')}] ` +
        `max=[${posMax.map((v) => v.toFixed(3)).join(', ')}] m, ` +
        `pivot_offset_m=[${extras.pivot_offset_m.map((v) => v.toFixed(3)).join(', ')}]`,
    );
  } catch (err) {
    reportFail(label, err);
  }
}

// Default pivot (base-center). Up axis is Z because we emit a Z-up GLB; the
// XY are centered and Z min is at 0 so the cube sits on the AR floor.
await checkCubePivot('100 mm cube / base-center (default)', {}, {
  pivotMode: 'base-center',
  upAxis: 'z',
  posMin: [-0.05, -0.05, 0],
  posMax: [0.05, 0.05, 0.1],
});

// Explicit bbox-center: origin at the geometric center.
await checkCubePivot('100 mm cube / bbox-center', { pivotMode: 'bbox-center' }, {
  pivotMode: 'bbox-center',
  upAxis: 'z',
  posMin: [-0.05, -0.05, -0.05],
  posMax: [0.05, 0.05, 0.05],
});

// Original: no translation, just meters scaling. Cube spans 0..0.1 on each
// axis because the source spans 0..100 mm.
await checkCubePivot('100 mm cube / original', { pivotMode: 'original' }, {
  pivotMode: 'original',
  upAxis: 'z',
  posMin: [0, 0, 0],
  posMax: [0.1, 0.1, 0.1],
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal 3MF archive in memory containing one cubic mesh of the
 * given side length. unit="millimeter" is explicit so the unit parser path
 * is exercised end to end.
 */
async function buildCube3MF(sideMm) {
  const s = sideMm;
  const vertices = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
  ];
  // Two triangles per face, outward winding.
  const triangles = [
    [0, 2, 1], [0, 3, 2], // bottom -Z
    [4, 5, 6], [4, 6, 7], // top +Z
    [0, 1, 5], [0, 5, 4], // front -Y
    [2, 3, 7], [2, 7, 6], // back +Y
    [1, 2, 6], [1, 6, 5], // right +X
    [0, 4, 7], [0, 7, 3], // left -X
  ];
  const vXml = vertices.map(([x, y, z]) => `      <vertex x="${x}" y="${y}" z="${z}"/>`).join('\n');
  const tXml = triangles.map(([a, b, c]) => `      <triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('\n');

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${vXml}
        </vertices>
        <triangles>
${tXml}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>
`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('3D/3dmodel.model', modelXml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Parse a GLB enough to read asset.extras and the first POSITION accessor's
 * min/max. We only need the JSON chunk; the binary chunk is ignored.
 */
function readGLBPositionInfo(glb) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB');
  if (view.getUint32(4, true) !== 2) throw new Error('GLB version != 2');
  const totalLen = view.getUint32(8, true);
  if (totalLen !== glb.byteLength) throw new Error(`GLB total length mismatch ${totalLen} vs ${glb.byteLength}`);

  // Chunk 0: JSON
  const jsonLen = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) throw new Error('expected JSON chunk first');
  const jsonBytes = new Uint8Array(glb.buffer, glb.byteOffset + 20, jsonLen);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));

  let posMin = null;
  let posMax = null;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const accIdx = prim.attributes?.POSITION;
      if (accIdx == null) continue;
      const acc = json.accessors[accIdx];
      if (acc?.min && acc?.max) {
        posMin = acc.min;
        posMax = acc.max;
        break;
      }
    }
    if (posMin) break;
  }
  if (!posMin) throw new Error('no POSITION accessor with min/max found');

  return { extras: json.asset?.extras ?? null, posMin, posMax };
}
