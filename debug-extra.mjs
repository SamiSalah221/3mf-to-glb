import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

const zip = new AdmZip('e:/3mf-project/Hijri Calendar Display wo ramadan.3mf');

// Extract filament_colour from project_settings (it's JSON)
const projText = zip.getEntry('Metadata/project_settings.config').getData().toString('utf8');
const proj = JSON.parse(projText);
console.log('=== FILAMENT COLOURS ===');
console.log('filament_colour:', JSON.stringify(proj.filament_colour));
console.log('default_filament_colour:', JSON.stringify(proj.default_filament_colour));
console.log('extruder_colour:', JSON.stringify(proj.extruder_colour));
console.log('filament_type:', JSON.stringify(proj.filament_type));
console.log('filament_colour_type:', JSON.stringify(proj.filament_colour_type));
console.log('filament_multi_colour:', JSON.stringify(proj.filament_multi_colour));

// Check for paint_color on triangles
console.log('\n=== PAINT_COLOR ANALYSIS ===');
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

    // Collect unique paint_color values
    const paintColors = new Set();
    triArr.forEach(t => {
      if (t['@_paint_color'] !== undefined) paintColors.add(t['@_paint_color']);
    });

    if (paintColors.size > 0) {
      console.log(`${f} object ${obj['@_id']}: paint_color values = ${JSON.stringify([...paintColors])} (${triArr.length} tris)`);

      // Count per value
      const counts = {};
      triArr.forEach(t => {
        const pc = t['@_paint_color'] || 'none';
        counts[pc] = (counts[pc] || 0) + 1;
      });
      for (const [k, v] of Object.entries(counts)) {
        console.log(`  paint_color=${k}: ${v} triangles`);
      }
    } else {
      console.log(`${f} object ${obj['@_id']}: NO paint_color attr (${triArr.length} tris)`);
    }
  }
}

// Also check slice_info.config and filament_sequence.json
console.log('\n=== SLICE INFO ===');
const sliceEntry = zip.getEntry('Metadata/slice_info.config');
if (sliceEntry) console.log(sliceEntry.getData().toString('utf8'));

console.log('\n=== FILAMENT SEQUENCE ===');
const seqEntry = zip.getEntry('Metadata/filament_sequence.json');
if (seqEntry) console.log(seqEntry.getData().toString('utf8'));

// Check model_settings for per-part extruder assignments
console.log('\n=== PER-PART EXTRUDER ASSIGNMENTS (from model_settings) ===');
const msText = zip.getEntry('Metadata/model_settings.config').getData().toString('utf8');
const msParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  isArray: (n) => ['object','part','metadata','plate','model_instance','assemble_item'].includes(n),
});
const msParsed = msParser.parse(msText);
const config = msParsed.config;

// For each object, print object-level extruder and part-level extruders
const objects = config.object || [];
for (const obj of objects) {
  const objId = obj['@_id'];
  const metaArr = obj.metadata || [];

  // Get object-level extruder
  let objExtruder = null;
  let objName = null;
  for (const m of metaArr) {
    if (m['@_key'] === 'extruder') objExtruder = m['@_value'];
    if (m['@_key'] === 'name') objName = m['@_value'];
  }

  console.log(`\nObject ${objId} "${objName}" → extruder=${objExtruder}`);

  // Parts
  const parts = obj.part || [];
  const partArr = Array.isArray(parts) ? parts : [parts];
  for (const part of partArr) {
    const partId = part['@_id'];
    const subtype = part['@_subtype'];
    const partMeta = part.metadata || [];
    const pmArr = Array.isArray(partMeta) ? partMeta : [partMeta];

    let partExtruder = null;
    let partName = null;
    for (const m of pmArr) {
      if (m['@_key'] === 'extruder') partExtruder = m['@_value'];
      if (m['@_key'] === 'name') partName = m['@_value'];
    }

    const resolvedExtruder = partExtruder || objExtruder || '1';
    console.log(`  Part ${partId} "${partName}" (${subtype}) → part_extruder=${partExtruder || 'inherit'}, resolved=${resolvedExtruder}`);
  }
}
