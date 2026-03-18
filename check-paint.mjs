import JSZip from 'jszip';
import { readFileSync } from 'fs';

const buf = readFileSync('Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(buf);

// Check tiles file (hijri-days, heavy painting)
const f = await zip.file('3D/Objects/object_8.model').async('text');
const lines = f.split('\n');
let found = 0;
const examples = {};
for (const line of lines) {
  if (line.includes('paint_color')) {
    const match = line.match(/paint_color="([^"]+)"/);
    if (match) {
      const val = match[1];
      const len = val.length;
      if (!examples[len]) {
        examples[len] = { count: 0, example: val };
      }
      examples[len].count++;
      found++;
    }
  }
}

const total = (f.match(/<triangle /g) || []).length;
console.log('=== object_8.model (hijri-days) ===');
console.log('Total triangles:', total);
console.log('Triangles with paint_color:', found);
console.log('Triangles WITHOUT paint_color:', total - found);
console.log('\nBy paint_color hex length:');
for (const [len, info] of Object.entries(examples).sort((a,b) => Number(a[0])-Number(b[0]))) {
  console.log(`  Length ${len}: ${info.count} triangles, example: "${info.example}"`);
}

// Decode simple paint_color values
console.log('\n=== Decoding paint_color values ===');
const stateCounts = {};
for (const line of lines) {
  if (line.includes('paint_color')) {
    const match = line.match(/paint_color="([^"]+)"/);
    if (match) {
      const val = match[1];
      if (val.length === 1) {
        const nibble = parseInt(val, 16);
        const state = (nibble >> 2) & 0x3;
        const split = nibble & 0x3;
        const key = `state=${state},split=${split}`;
        stateCounts[key] = (stateCounts[key] || 0) + 1;
      } else if (val.length <= 4) {
        const key = `complex(len=${val.length})`;
        stateCounts[key] = (stateCounts[key] || 0) + 1;
      } else {
        const key = `subdivision(len=${val.length})`;
        stateCounts[key] = (stateCounts[key] || 0) + 1;
      }
    }
  }
}
console.log('State distribution:');
for (const [key, count] of Object.entries(stateCounts).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${key}: ${count}`);
}

// Also check what namespace
const firstPainted = lines.find(l => l.includes('paint_color'));
console.log('\nFirst painted triangle XML:');
console.log(firstPainted?.trim().substring(0, 300));

// Check peg file (should be simple)
const peg = await zip.file('3D/Objects/object_5.model').async('text');
const pegLines = peg.split('\n');
const pegPainted = pegLines.filter(l => l.includes('paint_color')).length;
const pegTotal = (peg.match(/<triangle /g) || []).length;
console.log(`\n=== object_5.model (peg) ===`);
console.log(`Painted: ${pegPainted} of ${pegTotal}`);
const pegExample = pegLines.find(l => l.includes('paint_color'));
console.log('Example:', pegExample?.trim().substring(0, 200));

// Check calligraphy file (object_46)
const cal = await zip.file('3D/Objects/object_46.model').async('text');
const calPainted = (cal.match(/paint_color/g) || []).length;
const calTotal = (cal.match(/<triangle /g) || []).length;
console.log(`\n=== object_46.model (assembly/calligraphy) ===`);
console.log(`Painted: ${calPainted} of ${calTotal}`);
