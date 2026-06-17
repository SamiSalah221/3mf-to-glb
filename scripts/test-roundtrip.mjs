// Smoke test for the headless library + CLI.
//
// Parses every fixture in samples/, runs each through convertToGLB (with and
// without a recolor), and asserts the GLB header is valid. No assertions on
// pixel-exact color content yet — that comes in Phase 2 when we add 3MF
// write-back and can do a true round-trip.

import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import '../dist-lib/cli/nodePolyfills.js';
import { setDefaultDomParser, convertToGLB, parse3MF, applyRecolor } from '../dist-lib/lib/index.js';

setDefaultDomParser(new DOMParser());

const SAMPLES = readdirSync('samples').filter((n) => n.endsWith('.3mf'));
if (SAMPLES.length === 0) {
  console.error('no .3mf fixtures found in samples/');
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
let pass = 0;
let fail = 0;

for (const name of SAMPLES) {
  const path = resolve('samples', name);
  const buf = await readFile(path);
  try {
    const parsed = await parse3MF(buf);
    const recolor = Object.fromEntries(parsed.filaments.map((f) => [f.index, '#FF00FF']));
    const recolored = applyRecolor(parsed, recolor);
    for (const f of recolored.filaments) {
      if (f.currentColor !== '#FF00FF') throw new Error(`filament ${f.index} not recolored`);
    }
    const bytes = await convertToGLB(buf, { recolor });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('GLB magic mismatch');
    if (view.getUint32(4, true) !== 2) throw new Error('GLB version != 2');
    console.log(`  PASS ${name}: ${parsed.plates.length} plates, ${parsed.filaments.length} filaments, GLB ${bytes.byteLength.toLocaleString()} bytes`);
    pass++;
  } catch (err) {
    console.error(`  FAIL ${name}: ${(err && err.message) || err}`);
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
