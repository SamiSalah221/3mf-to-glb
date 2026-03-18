import JSZip from 'jszip';
import { readFileSync } from 'fs';

const file = readFileSync('e:/3mf-project/Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(file);

// --- 1. FILAMENT COLOURS ---
console.log('=== FILAMENT COLOURS ===');
const projectSettings = await zip.file('Metadata/project_settings.config')?.async('string');
const fcMatch = projectSettings.match(/"filament_colour":\s*\[([\s\S]*?)\]/);
if (fcMatch) {
  const colors = fcMatch[1].match(/"([^"]*)"/g)?.map(s => s.replace(/"/g, ''));
  colors.forEach((c, i) => console.log(`  Filament ${i + 1}: ${c}`));
}

// --- 2. MODEL SETTINGS: Objects ---
console.log('\n=== OBJECTS (model_settings.config) ===');
const modelSettings = await zip.file('Metadata/model_settings.config')?.async('string');

// Parse objects
const objectBlocks = modelSettings.split(/<\/object>/);
const objectData = [];
for (const block of objectBlocks) {
  const objStart = block.match(/<object\s+([^>]*)>/);
  if (!objStart) continue;
  const attrs = objStart[1];
  const id = attrs.match(/id="([^"]*)"/)?.[1];
  const name = attrs.match(/name="([^"]*)"/)?.[1];
  const extruderMatch = block.match(/key="extruder"[^>]*value="([^"]*)"/);
  const extruder = extruderMatch?.[1] || 'not set';

  console.log(`\n  Object id=${id} name="${name}" extruder=${extruder}`);

  const partRe = /<part\s+([^>]*?)(?:\/>|>)([\s\S]*?)(?:<\/part>|(?=<part\s|<\/object>|$))/g;
  let partMatch;
  while ((partMatch = partRe.exec(block)) !== null) {
    const partAttrs = partMatch[1];
    const partContent = partMatch[0];
    const partId = partAttrs.match(/id="([^"]*)"/)?.[1];
    const subtype = partAttrs.match(/subtype="([^"]*)"/)?.[1];
    const partName = partContent.match(/key="name"[^>]*value="([^"]*)"/)?.[1] || '';
    const partExtruder = partContent.match(/key="extruder"[^>]*value="([^"]*)"/)?.[1] || 'inherit';
    console.log(`    Part id=${partId} subtype="${subtype}" name="${partName}" extruder=${partExtruder}`);
  }
  objectData.push({ id, extruder });
}

// --- 3. PLATES ---
console.log('\n=== PLATES (model_settings.config) ===');
const plateBlocks = modelSettings.split(/<\/plate>/);
for (const block of plateBlocks) {
  if (!block.includes('<plate>') && !block.includes('<plate ')) continue;
  const platerId = block.match(/key="plater_id"\s*value="([^"]*)"/)?.[1];
  if (!platerId) continue;

  const objIds = [];
  const instanceRe = /key="object_id"\s*value="([^"]*)"/g;
  let m;
  while ((m = instanceRe.exec(block)) !== null) {
    objIds.push(m[1]);
  }
  console.log(`  Plate ${platerId}: object_ids=[${objIds.join(', ')}]`);
}

// --- 4. ROOT MODEL ---
console.log('\n=== ROOT MODEL (3D/3dmodel.model) ===');
const model = await zip.file('3D/3dmodel.model')?.async('string');

// Build items
console.log('\n--- Build Items ---');
const buildMatch = model.match(/<build[^>]*>([\s\S]*?)<\/build>/);
if (buildMatch) {
  const itemRe = /<item\s+([^>]*)\/?>/g;
  let itemMatch;
  while ((itemMatch = itemRe.exec(buildMatch[1])) !== null) {
    const attrs = itemMatch[1];
    const objectid = attrs.match(/objectid="([^"]*)"/)?.[1];
    const printable = attrs.match(/printable="([^"]*)"/)?.[1];
    console.log(`  Item objectid=${objectid} printable=${printable || '1'}`);
  }
}

// Root objects and their components
console.log('\n--- Root Objects & Components ---');
const rootObjBlocks = model.split(/<\/object>/);
for (const block of rootObjBlocks) {
  const objMatch = block.match(/<object\s+([^>]*)>/);
  if (!objMatch) continue;
  const attrs = objMatch[1];
  const id = attrs.match(/id="([^"]*)"/)?.[1];
  console.log(`\n  Object id=${id}`);

  const compRe = /<component\s+([^>]*)\/?>/g;
  let compMatch;
  while ((compMatch = compRe.exec(block)) !== null) {
    const cAttrs = compMatch[1];
    const objectid = cAttrs.match(/objectid="([^"]*)"/)?.[1];
    const pPath = cAttrs.match(/p:path="([^"]*)"/)?.[1] || 'none';
    console.log(`    Component objectid=${objectid} -> ${pPath}`);
  }
}

// --- 5. SUB-MODEL OBJECTS ---
console.log('\n=== SUB-MODEL FILES (mesh objects) ===');
for (const name of Object.keys(zip.files)) {
  if (!name.match(/3D\/Objects\/.*\.model$/)) continue;
  const subModel = await zip.file(name)?.async('string');
  if (!subModel) continue;

  console.log(`\n--- ${name} ---`);
  const subObjBlocks = subModel.split(/<\/object>/);
  for (const block of subObjBlocks) {
    const objMatch = block.match(/<object\s+([^>]*)>/);
    if (!objMatch) continue;
    const attrs = objMatch[1];
    const id = attrs.match(/id="([^"]*)"/)?.[1];
    const type = attrs.match(/type="([^"]*)"/)?.[1] || 'model';
    const pid = attrs.match(/\spid="([^"]*)"/)?.[1];
    const pindex = attrs.match(/pindex="([^"]*)"/)?.[1];
    const triangleCount = (block.match(/<triangle/g) || []).length;

    // Sample all unique pid/p1 combos from triangles
    const pidP1Set = new Set();
    const triRe = /<triangle[^>]*/g;
    let tri;
    while ((tri = triRe.exec(block)) !== null) {
      const t = tri[0];
      const tPid = t.match(/\spid="([^"]*)"/)?.[1];
      const tP1 = t.match(/\sp1="([^"]*)"/)?.[1];
      if (tPid || tP1) pidP1Set.add(`pid=${tPid},p1=${tP1}`);
    }

    console.log(`  Object id=${id} type="${type}" pid=${pid||'-'} pindex=${pindex||'-'} triangles=${triangleCount}`);
    if (pidP1Set.size > 0) {
      console.log(`    Triangle material refs: ${[...pidP1Set].join(' | ')}`);
    } else {
      console.log(`    NO per-triangle material refs (pid/p1)`);
    }
  }

  // Check for basematerials in resources
  const bmRe = /<basematerials\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/basematerials>/g;
  let bm;
  while ((bm = bmRe.exec(subModel)) !== null) {
    console.log(`  BaseMaterials id=${bm[1]}`);
    const baseRe = /<base\s+([^>]*)\/?>/g;
    let b;
    while ((b = baseRe.exec(bm[2])) !== null) {
      const n = b[1].match(/name="([^"]*)"/)?.[1];
      const c = b[1].match(/displaycolor="([^"]*)"/)?.[1];
      console.log(`    [${n}] ${c}`);
    }
  }
}

// --- 6. COLOR RESOLUTION ANALYSIS ---
console.log('\n\n========================================');
console.log('=== COLOR RESOLUTION ANALYSIS ===');
console.log('========================================');

const filamentColors = ['#FFF144', '#161616', '#FFFFFF', '#0078BF'];
console.log('\nFilament palette (1-indexed, from project_settings):');
filamentColors.forEach((c, i) => console.log(`  ${i+1}: ${c} (${['Yellow','Black','White','Blue'][i]})`));

console.log('\nKey insight: BambuStudio 3MF files store color assignment');
console.log('in model_settings.config via extruder index (1-based),');
console.log('NOT via 3MF pid/p1 system in the .model XML files.');
console.log('');

// Build a mapping from model_settings
console.log('Object -> Filament mapping (from model_settings.config):');
for (const block of objectBlocks) {
  const objStart = block.match(/<object\s+([^>]*)>/);
  if (!objStart) continue;
  const attrs = objStart[1];
  const id = attrs.match(/id="([^"]*)"/)?.[1];
  const extruderMatch = block.match(/key="extruder"[^>]*value="([^"]*)"/);
  const extruder = parseInt(extruderMatch?.[1] || '1');
  const color = filamentColors[extruder - 1];

  console.log(`\n  Object id=${id} -> extruder ${extruder} -> ${color}`);

  const partRe2 = /<part\s+([^>]*?)(?:\/>|>)([\s\S]*?)(?:<\/part>|(?=<part\s|<\/object>|$))/g;
  let pm;
  while ((pm = partRe2.exec(block)) !== null) {
    const pAttrs = pm[1];
    const pContent = pm[0];
    const pId = pAttrs.match(/id="([^"]*)"/)?.[1];
    const pName = pContent.match(/key="name"[^>]*value="([^"]*)"/)?.[1] || '';
    const pExt = pContent.match(/key="extruder"[^>]*value="([^"]*)"/)?.[1];
    const resolvedExt = pExt ? parseInt(pExt) : extruder;
    const resolvedColor = filamentColors[resolvedExt - 1];
    console.log(`    Part id=${pId} "${pName}" -> extruder ${resolvedExt} -> ${resolvedColor}`);
  }
}

// --- Plate summary with colors ---
console.log('\n\nPlate color summary:');
for (const block of plateBlocks) {
  if (!block.includes('<plate>') && !block.includes('<plate ')) continue;
  const platerId = block.match(/key="plater_id"\s*value="([^"]*)"/)?.[1];
  if (!platerId) continue;

  const objIds = [];
  const instanceRe = /key="object_id"\s*value="([^"]*)"/g;
  let m2;
  while ((m2 = instanceRe.exec(block)) !== null) {
    objIds.push(m2[1]);
  }

  console.log(`\n  Plate ${platerId}: objects [${objIds.join(', ')}]`);

  // For each object on this plate, show its parts and colors
  for (const objId of objIds) {
    for (const ob of objectBlocks) {
      const os = ob.match(/<object\s+([^>]*)>/);
      if (!os) continue;
      const oid = os[1].match(/id="([^"]*)"/)?.[1];
      if (oid !== objId) continue;

      const ext = ob.match(/key="extruder"[^>]*value="([^"]*)"/)?.[1] || '1';
      console.log(`    Object ${oid} (default extruder=${ext})`);

      const partRe3 = /<part\s+([^>]*?)(?:\/>|>)([\s\S]*?)(?:<\/part>|(?=<part\s|<\/object>|$))/g;
      let pm3;
      while ((pm3 = partRe3.exec(ob)) !== null) {
        const pa = pm3[1];
        const pc = pm3[0];
        const pid = pa.match(/id="([^"]*)"/)?.[1];
        const pname = pc.match(/key="name"[^>]*value="([^"]*)"/)?.[1] || '';
        const pext = pc.match(/key="extruder"[^>]*value="([^"]*)"/)?.[1];
        const rext = pext ? parseInt(pext) : parseInt(ext);
        const rcol = filamentColors[rext - 1];
        console.log(`      Part ${pid} "${pname}" -> filament ${rext} -> ${rcol} (${['Yellow','Black','White','Blue'][rext-1]})`);
      }
    }
  }
}
