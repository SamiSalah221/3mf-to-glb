import JSZip from 'jszip';
import { readFileSync } from 'fs';

const buf = readFileSync('Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(buf);

const ms = await zip.file('Metadata/model_settings.config').async('text');

// Show ALL plate configs
const lines = ms.split('\n');
let inPlate = false;
let plateNum = 0;
for (const line of lines) {
  if (line.trim().startsWith('<plate>')) { inPlate = true; plateNum++; console.log(`\n=== Plate block ${plateNum} ===`); }
  if (inPlate) console.log(' ', line.trim());
  if (line.trim() === '</plate>') inPlate = false;
}

// Check plate JSON files
for (let i = 1; i <= 6; i++) {
  const f = zip.file(`Metadata/plate_${i}.json`);
  if (f) {
    const json = JSON.parse(await f.async('text'));
    console.log(`\nplate_${i}.json filament_colors:`, json.filament_colors || json.filament_colours || 'N/A');
  }
}

// Check if there are per-plate filament overrides
const proj = JSON.parse(await zip.file('Metadata/project_settings.config').async('text'));
console.log('\nGlobal filament_colour:', proj.filament_colour);
console.log('Global filament_type:', proj.filament_type);

// Check which objects are on plate 4 (index 3 in zero-based, id=4)
console.log('\n=== Plate 4 thumbnail ===');
const thumbFile = zip.file('Metadata/plate_4.png');
console.log('Has thumbnail:', !!thumbFile);
