import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const zip = new AdmZip('e:/3mf-project/Hijri Calendar Display wo ramadan.3mf');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  isArray: (n) => ['object','triangle','vertex','component'].includes(n),
});

const modelFiles = [
  '3D/Objects/object_5.model', '3D/Objects/object_6.model', '3D/Objects/object_7.model',
  '3D/Objects/object_8.model', '3D/Objects/object_9.model', '3D/Objects/object_12.model',
  '3D/Objects/object_38.model', '3D/Objects/object_46.model', '3D/Objects/object_59.model'
];

console.log('=== PAINT_COLOR SUMMARY ===');
console.log('Bambu paint_color is a hex-encoded subdivision tree for per-face painting.');
console.log('Simple values: "8" = painted extruder 1, "0C" = painted extruder 2');
console.log('Complex values = subdivision painting (mix of extruders on sub-triangle regions)');
console.log();

for (const f of modelFiles) {
  const entry = zip.getEntry(f);
  if (!entry) continue;
  const text = entry.getData().toString('utf8');
  const parsed = parser.parse(text);
  const model = parsed.model;
  const objects = model?.resources?.object || [];
  const objArr = Array.isArray(objects) ? objects : [objects];

  for (const obj of objArr) {
    const tris = obj?.mesh?.triangles?.triangle;
    if (!tris) continue;
    const triArr = Array.isArray(tris) ? tris : [tris];

    let noPaint = 0;
    let simple8 = 0;
    let simple0C = 0;
    let complex = 0;
    let noneAttr = 0;

    triArr.forEach(t => {
      const pc = t['@_paint_color'];
      if (pc === undefined) { noneAttr++; return; }
      if (pc === '8') simple8++;
      else if (pc === '0C') simple0C++;
      else complex++;
    });

    console.log(`${f} obj ${obj['@_id']} (${triArr.length} tris):`);
    if (noneAttr > 0) console.log(`  no paint_color attr: ${noneAttr}`);
    if (simple8 > 0) console.log(`  paint=8 (extruder 1): ${simple8}`);
    if (simple0C > 0) console.log(`  paint=0C (extruder 2): ${simple0C}`);
    if (complex > 0) console.log(`  complex paint (subdivision): ${complex}`);
  }
}

// Now read the tail of debug-extra output for the per-part extruder section
console.log('\n=== SLICE INFO & FILAMENT SEQUENCE ===');
const sliceEntry = zip.getEntry('Metadata/slice_info.config');
if (sliceEntry) console.log(sliceEntry.getData().toString('utf8'));

const seqEntry = zip.getEntry('Metadata/filament_sequence.json');
if (seqEntry) console.log(seqEntry.getData().toString('utf8'));
