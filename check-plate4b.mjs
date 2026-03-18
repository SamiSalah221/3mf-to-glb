import JSZip from 'jszip';
import { readFileSync } from 'fs';

const buf = readFileSync('Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(buf);

// Parts reference these sub-model files:
// Part 17,18,19,20 -> object_46.model (objectids 17,18,19,20 within)
// Part 7 -> object_8.model (objectid 7)
// Part 9 -> object_9.model (objectid 9)
// Part 11 -> object_12.model (objectid 11)
// Part 22 -> object_59.model (objectid 22)

const files = ['object_46.model', 'object_8.model', 'object_9.model', 'object_12.model', 'object_59.model'];

for (const fname of files) {
  const path = `3D/Objects/${fname}`;
  const f = zip.file(path);
  if (!f) { console.log(`${fname}: NOT FOUND`); continue; }
  const xml = await f.async('text');
  const triCount = (xml.match(/<triangle /g) || []).length;
  const paintCount = (xml.match(/paint_color/g) || []).length;

  // Check which object IDs are in this file
  const objIds = [];
  const objRegex = /object id="(\d+)"/g;
  let om;
  while ((om = objRegex.exec(xml)) !== null) objIds.push(om[1]);

  console.log(`\n${fname}: ${triCount} tris, ${paintCount} painted, objectIds: [${objIds.join(', ')}]`);

  if (paintCount > 0) {
    // Full decode to check for extruder 3 (state=3 means extended)
    const paintRegex = /paint_color="([^"]+)"/g;
    let pm;
    const decodedExtCounts = {};
    while ((pm = paintRegex.exec(xml)) !== null) {
      const ext = decodePaintColor(pm[1]);
      decodedExtCounts[`ext_${ext}`] = (decodedExtCounts[`ext_${ext}`] || 0) + 1;
    }
    console.log('  Decoded extruder distribution:', decodedExtCounts);
  }
}

// Full paint_color decoder
function decodePaintColor(hex) {
  if (!hex || hex.length === 0) return 0;
  if (hex.length === 1) {
    const nibble = parseInt(hex, 16);
    const state = nibble >> 2;
    const split = nibble & 3;
    if (split === 0) return state;
  }
  const reader = { pos: 0 };
  return decodePaintTree(hex, reader);
}

function decodePaintTree(hex, reader) {
  if (reader.pos >= hex.length) return 0;
  const nibble = parseInt(hex[reader.pos++], 16);
  if (isNaN(nibble)) return 0;
  let state = nibble >> 2;
  const split = nibble & 3;
  if (state === 3) {
    if (reader.pos >= hex.length) return 0;
    const ext = parseInt(hex[reader.pos++], 16);
    if (isNaN(ext)) return 0;
    state = 3 + ext;
  }
  if (split === 0) return state;
  const numChildren = split + 1;
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

// Summary
console.log('\n=== Expected plate 4 color mapping ===');
console.log('Filament 1 = #FFF144 (Yellow)');
console.log('Filament 2 = #161616 (Black)');
console.log('Filament 3 = #FFFFFF (White)');
console.log('Filament 4 = #0078BF (Blue)');
console.log('\nPart assignments:');
console.log('Part 17 (Assembly body): ext=2 (Black)');
console.log('Part 18 (La Ilaha calligraphy): ext=1 (Yellow)');
console.log('Part 19 (Assembly ring): ext=1 (Yellow)');
console.log('Part 7 (hijri-days tile): ext=1 (Yellow) + paint_color');
console.log('Part 9 (hijri-months tile): ext=1 (Yellow) + paint_color');
console.log('Part 11 (hijri-weekdays tile): ext=1 (Yellow) + paint_color?');
console.log('Part 22 (object_59): ext=2 (Black)');
