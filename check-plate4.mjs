import JSZip from 'jszip';
import { readFileSync } from 'fs';

const buf = readFileSync('Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(buf);

// Check each sub-model for paint_color on plate 4 parts
const partIds = [17, 18, 19, 7, 9, 11, 22];
for (const pid of partIds) {
  const path = `3D/Objects/object_${pid}.model`;
  const f = zip.file(path);
  if (!f) { console.log(`Part ${pid}: file not found`); continue; }
  const xml = await f.async('text');
  const paintCount = (xml.match(/paint_color/g) || []).length;
  const triCount = (xml.match(/<triangle /g) || []).length;

  if (paintCount > 0) {
    const paintRegex = /paint_color="([^"]+)"/g;
    let pm;
    const extCounts = {};
    while ((pm = paintRegex.exec(xml)) !== null) {
      const hex = pm[1];
      const nibble = parseInt(hex[0], 16);
      const state = nibble >> 2;
      extCounts[`state_${state}`] = (extCounts[`state_${state}`] || 0) + 1;
    }
    console.log(`Part ${pid}: ${triCount} tris, ${paintCount} painted, states:`, extCounts);
  } else {
    console.log(`Part ${pid}: ${triCount} tris, no paint_color`);
  }
}

// Also check root model for object 23 components with their objectids
const root = await zip.file('3D/3dmodel.model').async('text');
const lines = root.split('\n');
console.log('\nObject 23 component lines:');
let inObj23 = false;
for (const line of lines) {
  if (line.includes('id="23"')) inObj23 = true;
  if (inObj23 && line.includes('component')) console.log(' ', line.trim());
  if (inObj23 && line.includes('</object>')) break;
}

// Check model_settings for object 23 - full detail
const ms = await zip.file('Metadata/model_settings.config').async('text');
const msLines = ms.split('\n');
console.log('\nObject 23 in model_settings:');
let in23 = false;
for (const line of msLines) {
  if (line.includes('<object id="23">')) in23 = true;
  if (in23) console.log(' ', line.trim());
  if (in23 && line.includes('</object>')) break;
}
