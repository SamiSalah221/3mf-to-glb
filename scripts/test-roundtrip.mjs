// End-to-end smoke for the headless library, CLI, and the new 3MF write-back.
//
// For every fixture in samples/:
//   1. parse → produces ParseResult
//   2. recolor every filament to #FF00FF
//   3. exportRecolored3MF → fresh 3MF bytes
//   4. parse the rewritten 3MF → assert every filament's currentColor is #FF00FF
//   5. convertToGLB on the rewritten 3MF → assert GLB magic + version

import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import '../dist-lib/cli/nodePolyfills.js';
import {
  setDefaultDomParser,
  convertToGLB,
  parse3MF,
  applyRecolor,
  exportRecolored3MF,
} from '../dist-lib/lib/index.js';

setDefaultDomParser(new DOMParser());

const SAMPLES = readdirSync('samples').filter((n) => n.endsWith('.3mf'));
if (SAMPLES.length === 0) {
  console.error('no .3mf fixtures found in samples/');
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67;
const TARGET = '#FF00FF';

let pass = 0;
let fail = 0;

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

    console.log(
      `  PASS ${name}: ${parsed.plates.length}p / ${parsed.filaments.length}f, rewritten 3MF ${rewritten.byteLength.toLocaleString()}B, GLB ${bytes.byteLength.toLocaleString()}B`,
    );
    pass++;
  } catch (err) {
    console.error(`  FAIL ${name}: ${(err && err.message) || err}`);
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
