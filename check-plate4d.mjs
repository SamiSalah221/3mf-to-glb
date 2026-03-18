import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'fs';

const buf = readFileSync('Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(buf);

// Save plate 4 thumbnail so user can view it
const thumb = await zip.file('Metadata/plate_4.png').async('nodebuffer');
writeFileSync('plate4_thumb.png', thumb);
console.log('Saved plate4_thumb.png');

// Check object_46.model for basematerials/colorgroup
const obj46 = await zip.file('3D/Objects/object_46.model').async('text');
console.log('\n=== object_46.model basematerials/colorgroup ===');
if (obj46.includes('basematerials')) console.log('Has basematerials');
if (obj46.includes('colorgroup')) console.log('Has colorgroup');
if (obj46.includes('pid=')) {
  const pidLines = obj46.split('\n').filter(l => l.includes('pid=')).slice(0, 5);
  console.log('Sample pid lines:', pidLines.map(l => l.trim().substring(0, 200)));
}

// Check object_59.model for basematerials/colorgroup
const obj59 = await zip.file('3D/Objects/object_59.model').async('text');
console.log('\n=== object_59.model basematerials/colorgroup ===');
if (obj59.includes('basematerials')) console.log('Has basematerials');
if (obj59.includes('colorgroup')) console.log('Has colorgroup');
if (obj59.includes('pid=')) {
  const pidLines = obj59.split('\n').filter(l => l.includes('pid=')).slice(0, 5);
  console.log('Sample pid lines:', pidLines.map(l => l.trim().substring(0, 200)));
}

// Count object_46 triangles by objectid
const objects46 = obj46.match(/<object[^>]*id="(\d+)"[^>]*>/g);
console.log('\nobject_46 objects:', objects46?.map(s => s.match(/id="(\d+)"/)?.[1]));

// Check each object within object_46 for paint_color
for (const objId of [17, 18, 19, 20]) {
  const objStart = obj46.indexOf(`id="${objId}"`);
  if (objStart === -1) continue;
  const objEnd = obj46.indexOf('</object>', objStart);
  const objSection = obj46.substring(objStart, objEnd);
  const paintCount = (objSection.match(/paint_color/g) || []).length;
  const triCount = (objSection.match(/<triangle /g) || []).length;
  console.log(`  Object ${objId} in obj46: ${triCount} tris, ${paintCount} painted`);

  // Check for any extended paint states (extruder 3+)
  if (paintCount > 0) {
    const paintRegex = /paint_color="([^"]+)"/g;
    let pm;
    let hasExt3Plus = false;
    while ((pm = paintRegex.exec(objSection)) !== null) {
      const hex = pm[1];
      // Check if any nibble has state=3 (extended)
      for (let i = 0; i < hex.length; i++) {
        const nibble = parseInt(hex[i], 16);
        if ((nibble >> 2) === 3) { hasExt3Plus = true; break; }
      }
      if (hasExt3Plus) break;
    }
    console.log(`    Has extended states (ext 3+): ${hasExt3Plus}`);
  }
}

// Check all models for any reference to extruder 3
const allFiles = ['object_5.model', 'object_8.model', 'object_9.model', 'object_12.model', 'object_46.model', 'object_59.model'];
console.log('\n=== Checking ALL models for extruder 3 references ===');
for (const fname of allFiles) {
  const f = zip.file(`3D/Objects/${fname}`);
  if (!f) continue;
  const xml = await f.async('text');
  // Check for state=3 extended paint values
  const paintRegex = /paint_color="([^"]+)"/g;
  let pm;
  let ext3Count = 0;
  while ((pm = paintRegex.exec(xml)) !== null) {
    const ext = decodePaintColor(pm[1]);
    if (ext >= 3) ext3Count++;
  }
  if (ext3Count > 0) console.log(`  ${fname}: ${ext3Count} triangles with extruder 3+`);
  else console.log(`  ${fname}: no extruder 3+ references`);
}

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
