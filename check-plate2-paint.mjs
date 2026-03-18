import JSZip from 'jszip';
import { readFileSync } from 'fs';

const buf = readFileSync('Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(buf);

// Plate 2 objects are 8, 10, 12 which live in object_8.model, object_9.model, object_12.model
// (object 8 is in object_8.model, object 10 is in object_9.model, object 12 is in object_12.model)

const files = ['object_8.model', 'object_9.model', 'object_12.model'];

for (const fname of files) {
  const f = zip.file(`3D/Objects/${fname}`);
  if (!f) { console.log(`${fname}: NOT FOUND`); continue; }
  const xml = await f.async('text');

  const paintRegex = /paint_color="([^"]+)"/g;
  let pm;
  const allHexValues = [];
  while ((pm = paintRegex.exec(xml)) !== null) {
    allHexValues.push(pm[1]);
  }

  console.log(`\n=== ${fname}: ${allHexValues.length} paint_color values ===`);

  if (allHexValues.length === 0) continue;

  // Show unique first characters (nibbles) and their frequencies
  const firstNibbles = {};
  const uniqueValues = new Set();
  const allNibbles = {};

  for (const hex of allHexValues) {
    uniqueValues.add(hex);
    for (let i = 0; i < hex.length; i++) {
      const ch = hex[i].toUpperCase();
      allNibbles[ch] = (allNibbles[ch] || 0) + 1;
    }
    const first = hex[0].toUpperCase();
    firstNibbles[first] = (firstNibbles[first] || 0) + 1;
  }

  console.log('Unique paint values count:', uniqueValues.size);
  console.log('First nibble distribution:', firstNibbles);
  console.log('All nibble distribution:', allNibbles);

  // Show sample values
  const samples = [...uniqueValues].slice(0, 20);
  console.log('Sample unique values:', samples);

  // Now decode each unique value and tally extruders found
  const extruderCounts = {};
  for (const hex of allHexValues) {
    const extruders = decodeAllExtruders(hex);
    for (const ext of extruders) {
      extruderCounts[`ext_${ext}`] = (extruderCounts[`ext_${ext}`] || 0) + 1;
    }
  }
  console.log('Decoded extruder distribution:', extruderCounts);

  // Specifically look for any nibble with upper bits = 11 (state=3, i.e. hex C,D,E,F)
  let hasExtended = false;
  for (const hex of allHexValues) {
    for (let i = 0; i < hex.length; i++) {
      const n = parseInt(hex[i], 16);
      if ((n >> 2) === 3) {
        hasExtended = true;
        console.log(`FOUND extended state nibble in: "${hex}" at position ${i} (nibble=${hex[i]}=${n})`);
        // Decode this one fully
        console.log('  Full decode:', decodeAllExtruders(hex));
        break;
      }
    }
    if (hasExtended) break;
  }
  if (!hasExtended) {
    console.log('NO extended state (state=3) nibbles found in any paint_color value');
  }
}

// Decode ALL extruder states found in a paint_color tree (not just majority vote)
function decodeAllExtruders(hex) {
  if (!hex || hex.length === 0) return [0];
  const reader = { pos: 0 };
  const extruders = new Set();
  collectExtruders(hex, reader, extruders);
  return [...extruders];
}

function collectExtruders(hex, reader, extruders) {
  if (reader.pos >= hex.length) { extruders.add(0); return; }
  const nibble = parseInt(hex[reader.pos++], 16);
  if (isNaN(nibble)) { extruders.add(0); return; }
  let state = nibble >> 2;
  const split = nibble & 3;
  if (state === 3) {
    if (reader.pos >= hex.length) { extruders.add(0); return; }
    const ext = parseInt(hex[reader.pos++], 16);
    if (isNaN(ext)) { extruders.add(0); return; }
    state = 3 + ext;
  }
  if (split === 0) {
    extruders.add(state);
    return;
  }
  const numChildren = split + 1;
  for (let i = 0; i < numChildren; i++) {
    collectExtruders(hex, reader, extruders);
  }
}
