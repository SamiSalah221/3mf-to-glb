import JSZip from 'jszip';
import { readFileSync } from 'fs';

const buf = readFileSync('Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(buf);

// Fixed decoder: read RIGHT-TO-LEFT, lower 2 bits = split, upper 2 bits = state/special_side
function decodePaintColor(hex) {
  if (!hex || hex.length === 0) return 0;
  const reversed = hex.split('').reverse().join('');
  const reader = { pos: 0 };
  return decodePaintTree(reversed, reader);
}

function decodePaintTree(hex, reader) {
  if (reader.pos >= hex.length) return 0;
  const nibble = parseInt(hex[reader.pos++], 16);
  if (isNaN(nibble)) return 0;
  const splitSides = nibble & 3;
  const upper = (nibble >> 2) & 3;

  if (splitSides === 0) {
    if (upper < 3) return upper;
    // Extended (C nibble): read next nibble(s) for ext 3+
    let extState = 0;
    while (reader.pos < hex.length) {
      const ext = parseInt(hex[reader.pos++], 16);
      if (isNaN(ext)) return 0;
      if (ext === 0xF) { extState += 15; }
      else { extState += ext; break; }
    }
    return 3 + extState;
  }

  const numChildren = splitSides + 1;
  const votes = new Map();
  for (let i = 0; i < numChildren; i++) {
    const childState = decodePaintTree(hex, reader);
    votes.set(childState, (votes.get(childState) || 0) + 1);
  }
  let bestState = 0, bestCount = 0;
  for (const [s, count] of votes) {
    if (s > 0 && count > bestCount) { bestState = s; bestCount = count; }
  }
  return bestState || 0;
}

// Test plate 2 objects
const files = ['object_8.model', 'object_9.model', 'object_12.model'];
for (const fname of files) {
  const f = zip.file(`3D/Objects/${fname}`);
  if (!f) continue;
  const xml = await f.async('text');

  const paintRegex = /paint_color="([^"]+)"/g;
  let pm;
  const extCounts = {};
  while ((pm = paintRegex.exec(xml)) !== null) {
    const ext = decodePaintColor(pm[1]);
    extCounts[`ext_${ext}`] = (extCounts[`ext_${ext}`] || 0) + 1;
  }
  console.log(`${fname}: decoded extruder distribution:`, extCounts);
}

// Quick test cases
console.log('\n=== Quick decode tests ===');
console.log('  "8"  →', decodePaintColor('8'), '(expect 2=Black)');
console.log('  "0C" →', decodePaintColor('0C'), '(expect 3=White)');
console.log('  "0"  →', decodePaintColor('0'), '(expect 0=inherit)');
console.log('  "4"  →', decodePaintColor('4'), '(expect 1=Ext1)');
