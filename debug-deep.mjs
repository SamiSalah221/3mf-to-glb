/**
 * Deep 3MF Analysis Script
 * Extracts and analyzes ALL metadata, models, color assignments,
 * plate mappings, and relationships from a Bambu Studio 3MF file.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

const FILE_PATH = 'e:/3mf-project/Hijri Calendar Display wo ramadan.3mf';

// ─── XML Parser config ───────────────────────────────────────────────
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: false,   // keep as strings
  trimValues: true,
  isArray: (name) => {
    // Force arrays for elements that can repeat
    const arrayNames = [
      'object', 'component', 'item', 'triangle', 'vertex',
      'base', 'color', 'Relationship', 'plate', 'filament_info',
      'Override', 'Default', 'metadata', 'tex2dcoord',
      'multiproperties', 'multi', 'basematerials', 'colorgroup',
      'compositematerials', 'composite', 'tex2dgroup', 'pbmetallicdisplayproperties',
    ];
    return arrayNames.includes(name);
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────
function parseXml(text) {
  return parser.parse(text);
}

function printSeparator(title) {
  console.log('\n' + '═'.repeat(80));
  console.log(`  ${title}`);
  console.log('═'.repeat(80));
}

function printSubSep(title) {
  console.log('\n' + '─'.repeat(70));
  console.log(`  ${title}`);
  console.log('─'.repeat(70));
}

function jsonPrint(obj, depth = 4) {
  console.log(JSON.stringify(obj, null, 2).split('\n').slice(0, 500).join('\n'));
}

// ─── Load ZIP ────────────────────────────────────────────────────────
const zip = new AdmZip(FILE_PATH);
const entries = zip.getEntries();

printSeparator('ALL ENTRIES IN 3MF ARCHIVE');
entries.forEach(e => {
  console.log(`  ${e.entryName}  (${e.header.size} bytes)`);
});

// ─── Helper: read text entry ─────────────────────────────────────────
function readText(path) {
  const entry = zip.getEntry(path);
  if (!entry) return null;
  return entry.getData().toString('utf8');
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 1: METADATA FILES
// ═══════════════════════════════════════════════════════════════════════

printSeparator('SECTION 1: METADATA FILES');

// 1a. [Content_Types].xml
{
  printSubSep('[Content_Types].xml');
  const text = readText('[Content_Types].xml');
  if (text) {
    console.log(text);
  } else {
    console.log('  NOT FOUND');
  }
}

// 1b. _rels/.rels
{
  printSubSep('_rels/.rels');
  const text = readText('_rels/.rels');
  if (text) {
    console.log(text);
  } else {
    console.log('  NOT FOUND');
  }
}

// 1c. 3D/_rels/3dmodel.model.rels
{
  printSubSep('3D/_rels/3dmodel.model.rels');
  const text = readText('3D/_rels/3dmodel.model.rels');
  if (text) {
    console.log(text);
  } else {
    console.log('  NOT FOUND');
  }
}

// 1d. Metadata/model_settings.config
{
  printSubSep('Metadata/model_settings.config (FULL XML)');
  const text = readText('Metadata/model_settings.config');
  if (text) {
    console.log(text);
  } else {
    console.log('  NOT FOUND');
  }
}

// 1e. Metadata/project_settings.config — filament fields only
{
  printSubSep('Metadata/project_settings.config (filament-related fields)');
  const text = readText('Metadata/project_settings.config');
  if (text) {
    // This is INI-like or JSON; print filament-related lines
    const lines = text.split('\n');
    const filamentLines = lines.filter(l =>
      /filament|extruder|color|material|nozzle/i.test(l)
    );
    if (filamentLines.length > 0) {
      filamentLines.forEach(l => console.log(l));
    } else {
      console.log('  No filament-related lines found. Printing first 100 lines:');
      lines.slice(0, 100).forEach(l => console.log(l));
    }
    console.log(`\n  [Total lines in file: ${lines.length}]`);
  } else {
    console.log('  NOT FOUND');
  }
}

// 1f. Metadata/cut_information.xml
{
  printSubSep('Metadata/cut_information.xml');
  const text = readText('Metadata/cut_information.xml');
  if (text) {
    console.log(text);
  } else {
    console.log('  NOT FOUND');
  }
}

// 1g. Check for filament_settings configs
{
  const filamentConfigs = entries.filter(e => /filament_settings/i.test(e.entryName));
  printSubSep('Filament Settings Configs');
  if (filamentConfigs.length === 0) {
    console.log('  No filament_settings files found');
  }
  filamentConfigs.forEach(e => {
    console.log(`\n--- ${e.entryName} ---`);
    const text = e.getData().toString('utf8');
    // Print first 80 lines
    const lines = text.split('\n');
    lines.slice(0, 80).forEach(l => console.log(l));
    if (lines.length > 80) console.log(`  ... [${lines.length} total lines]`);
  });
}

// 1h. Check ALL _rels entries
{
  printSubSep('ALL Relationship Files (_rels)');
  const relsEntries = entries.filter(e => /_rels/i.test(e.entryName));
  relsEntries.forEach(e => {
    console.log(`\n--- ${e.entryName} ---`);
    console.log(e.getData().toString('utf8'));
  });
}

// 1i. Check for texture/image files
{
  printSubSep('Texture / Image Files');
  const texEntries = entries.filter(e =>
    /\.(png|jpg|jpeg|bmp|tiff|tga|texture)/i.test(e.entryName) &&
    !/thumb/i.test(e.entryName)
  );
  if (texEntries.length === 0) {
    console.log('  No texture files found (excluding thumbnails)');
  } else {
    texEntries.forEach(e => console.log(`  ${e.entryName} (${e.header.size} bytes)`));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 2: PARSE ALL MODEL FILES
// ═══════════════════════════════════════════════════════════════════════

printSeparator('SECTION 2: ALL MODEL FILES — DETAILED ANALYSIS');

const modelEntries = entries.filter(e => /\.model$/i.test(e.entryName));
console.log(`\nFound ${modelEntries.length} model files:`);
modelEntries.forEach(e => console.log(`  ${e.entryName}`));

// Store parsed data for cross-referencing
const modelDataMap = {}; // path → parsed data

for (const entry of modelEntries) {
  printSubSep(`MODEL: ${entry.entryName}`);

  const text = entry.getData().toString('utf8');
  const parsed = parseXml(text);

  // Navigate to model element
  const model = parsed?.model || parsed?.['model'] || parsed;
  modelDataMap[entry.entryName] = { raw: text, parsed: model };

  // Print model attributes (namespaces etc.)
  console.log('\n  Model root attributes:');
  for (const [k, v] of Object.entries(model)) {
    if (k.startsWith('@_')) {
      console.log(`    ${k}: ${v}`);
    }
  }

  // Print metadata elements
  const metadata = model?.metadata;
  if (metadata) {
    console.log('\n  Metadata elements:');
    const metaArr = Array.isArray(metadata) ? metadata : [metadata];
    metaArr.forEach(m => {
      if (typeof m === 'object') {
        console.log(`    name="${m['@_name']}" → ${m['#text'] || JSON.stringify(m)}`);
      } else {
        console.log(`    ${m}`);
      }
    });
  }

  // Resources
  const resources = model?.resources;
  if (!resources) {
    console.log('\n  NO <resources> element found');
    continue;
  }

  // Check for basematerials
  const basematerials = resources?.basematerials;
  if (basematerials) {
    console.log('\n  <basematerials> found:');
    const bmArr = Array.isArray(basematerials) ? basematerials : [basematerials];
    bmArr.forEach(bm => {
      console.log(`    id="${bm['@_id']}"`);
      const bases = bm?.base;
      if (bases) {
        const bArr = Array.isArray(bases) ? bases : [bases];
        bArr.forEach((b, i) => {
          console.log(`      [${i}] name="${b['@_name']}" displaycolor="${b['@_displaycolor']}"`);
        });
      }
    });
  } else {
    console.log('\n  No <basematerials> found');
  }

  // Check for colorgroup
  const colorgroups = resources?.colorgroup;
  if (colorgroups) {
    console.log('\n  <colorgroup> found:');
    const cgArr = Array.isArray(colorgroups) ? colorgroups : [colorgroups];
    cgArr.forEach(cg => {
      console.log(`    id="${cg['@_id']}"`);
      const colors = cg?.color;
      if (colors) {
        const cArr = Array.isArray(colors) ? colors : [colors];
        cArr.forEach((c, i) => {
          console.log(`      [${i}] color="${c['@_color']}"`);
        });
      }
    });
  } else {
    console.log('\n  No <colorgroup> found');
  }

  // Check for multiproperties
  const multiprops = resources?.multiproperties;
  if (multiprops) {
    console.log('\n  <multiproperties> found:');
    const mpArr = Array.isArray(multiprops) ? multiprops : [multiprops];
    mpArr.forEach(mp => {
      console.log(`    id="${mp['@_id']}" pids="${mp['@_pids']}" blendmethods="${mp['@_blendmethods']}"`);
      const multis = mp?.multi;
      if (multis) {
        const mArr = Array.isArray(multis) ? multis : [multis];
        console.log(`    ${mArr.length} <multi> entries:`);
        mArr.slice(0, 10).forEach((m, i) => {
          console.log(`      [${i}] pindices="${m['@_pindices']}"`);
        });
        if (mArr.length > 10) console.log(`      ... and ${mArr.length - 10} more`);
      }
    });
  } else {
    console.log('\n  No <multiproperties> found');
  }

  // Check for tex2dgroup
  const tex2d = resources?.tex2dgroup;
  if (tex2d) {
    console.log('\n  <tex2dgroup> found:');
    jsonPrint(tex2d);
  }

  // Check for compositematerials
  const composites = resources?.compositematerials;
  if (composites) {
    console.log('\n  <compositematerials> found:');
    jsonPrint(composites);
  }

  // Check for pbmetallicdisplayproperties (Bambu specific)
  const pbMetal = resources?.pbmetallicdisplayproperties;
  if (pbMetal) {
    console.log('\n  <pbmetallicdisplayproperties> found:');
    jsonPrint(pbMetal);
  }

  // Objects
  const objects = resources?.object;
  if (!objects) {
    console.log('\n  No <object> elements found');
    continue;
  }

  const objArr = Array.isArray(objects) ? objects : [objects];
  console.log(`\n  ${objArr.length} objects found:`);

  for (const obj of objArr) {
    console.log(`\n  OBJECT id="${obj['@_id']}" type="${obj['@_type'] || 'model'}" pid="${obj['@_pid'] || 'none'}" pindex="${obj['@_pindex'] || 'none'}"`);

    // Print ALL attributes
    const attrs = Object.entries(obj).filter(([k]) => k.startsWith('@_'));
    if (attrs.length > 0) {
      console.log('    All attributes:');
      attrs.forEach(([k, v]) => console.log(`      ${k.replace('@_', '')}: ${v}`));
    }

    // Object-level metadata
    if (obj.metadata) {
      const metaArr = Array.isArray(obj.metadata) ? obj.metadata : [obj.metadata];
      console.log('    Object metadata:');
      metaArr.forEach(m => {
        if (typeof m === 'object') {
          console.log(`      ${m['@_name']}: ${m['#text'] || JSON.stringify(m)}`);
        }
      });
    }

    // Mesh
    const mesh = obj?.mesh;
    if (mesh) {
      const vertices = mesh?.vertices?.vertex;
      const triangles = mesh?.triangles?.triangle;
      const vCount = vertices ? (Array.isArray(vertices) ? vertices.length : 1) : 0;
      const tCount = triangles ? (Array.isArray(triangles) ? triangles.length : 1) : 0;

      console.log(`    MESH: ${vCount} vertices, ${tCount} triangles`);

      if (tCount > 0) {
        const triArr = Array.isArray(triangles) ? triangles : [triangles];

        // Check for pid/p1 on triangles
        let withPid = 0;
        let withP1 = 0;
        const pidValues = new Set();
        const p1Values = new Set();

        triArr.forEach(t => {
          if (t['@_pid'] !== undefined) {
            withPid++;
            pidValues.add(t['@_pid']);
          }
          if (t['@_p1'] !== undefined) {
            withP1++;
            p1Values.add(t['@_p1']);
          }
        });

        console.log(`    Triangles with pid: ${withPid}/${tCount} (unique pids: ${[...pidValues].join(', ') || 'none'})`);
        console.log(`    Triangles with p1: ${withP1}/${tCount} (unique p1: ${[...p1Values].join(', ') || 'none'})`);

        // Sample first 5 triangles
        console.log('    First 5 triangles:');
        triArr.slice(0, 5).forEach((t, i) => {
          const attrs = Object.entries(t).filter(([k]) => k.startsWith('@_')).map(([k, v]) => `${k.replace('@_', '')}=${v}`).join(' ');
          console.log(`      [${i}] ${attrs}`);
        });

        // If there are pid-bearing triangles, build a frequency table
        if (withPid > 0) {
          console.log('\n    Triangle color distribution:');
          const pidP1Combos = {};
          triArr.forEach(t => {
            const pid = t['@_pid'] || 'none';
            const p1 = t['@_p1'] || 'none';
            const key = `pid=${pid} p1=${p1}`;
            pidP1Combos[key] = (pidP1Combos[key] || 0) + 1;
          });
          for (const [combo, count] of Object.entries(pidP1Combos)) {
            console.log(`      ${combo}: ${count} triangles`);
          }
        }
      }
    } else {
      console.log('    NO MESH (assembly object)');
    }

    // Components
    const components = obj?.components?.component;
    if (components) {
      const compArr = Array.isArray(components) ? components : [components];
      console.log(`    ${compArr.length} components:`);
      compArr.forEach((c, i) => {
        const attrs = Object.entries(c).filter(([k]) => k.startsWith('@_')).map(([k, v]) => `${k.replace('@_', '')}=${v}`).join(' ');
        console.log(`      [${i}] ${attrs}`);
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 3: ROOT MODEL — BUILD ITEMS
// ═══════════════════════════════════════════════════════════════════════

printSeparator('SECTION 3: ROOT MODEL — BUILD ITEMS');

{
  const rootText = readText('3D/3dmodel.model');
  if (rootText) {
    const parsed = parseXml(rootText);
    const model = parsed?.model || parsed;
    const build = model?.build;

    if (build) {
      const items = build?.item;
      const itemArr = items ? (Array.isArray(items) ? items : [items]) : [];
      console.log(`\n  ${itemArr.length} build items:`);
      itemArr.forEach((item, i) => {
        const attrs = Object.entries(item).filter(([k]) => k.startsWith('@_')).map(([k, v]) => `${k.replace('@_', '')}=${v}`).join('\n      ');
        console.log(`\n    BUILD ITEM [${i}]:`);
        console.log(`      ${attrs}`);
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 4: PLATE → OBJECT → COMPONENT → MESH MAPPING
// ═══════════════════════════════════════════════════════════════════════

printSeparator('SECTION 4: PLATE → OBJECT → COMPONENT → MESH MAPPING');

{
  // Parse model_settings to find plate assignments and extruder info
  const modelSettingsText = readText('Metadata/model_settings.config');
  let plateAssignments = {};  // objectId → plate info
  let objectExtruders = {};   // objectId → extruder info

  if (modelSettingsText) {
    const msParsed = parseXml(modelSettingsText);
    // Try to find plate and object configs
    console.log('\n  Parsed model_settings structure (top-level keys):');
    if (msParsed) {
      const printKeys = (obj, prefix = '') => {
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            console.log(`    ${prefix}${k}: {object}`);
          } else if (Array.isArray(v)) {
            console.log(`    ${prefix}${k}: [array of ${v.length}]`);
          } else {
            console.log(`    ${prefix}${k}: ${String(v).substring(0, 80)}`);
          }
        }
      };
      printKeys(msParsed);
    }
  }

  // Parse root model for the full hierarchy
  const rootText = readText('3D/3dmodel.model');
  if (!rootText) {
    console.log('  ERROR: Cannot read root model');
  } else {
    const parsed = parseXml(rootText);
    const model = parsed?.model || parsed;
    const resources = model?.resources;
    const build = model?.build;

    const items = build?.item;
    const itemArr = items ? (Array.isArray(items) ? items : [items]) : [];

    const objects = resources?.object;
    const objArr = objects ? (Array.isArray(objects) ? objects : [objects]) : [];
    const objMap = {};
    objArr.forEach(o => { objMap[o['@_id']] = o; });

    console.log('\n  OBJECT MAP (root model):');
    objArr.forEach(o => {
      console.log(`    Object ${o['@_id']}: type=${o['@_type'] || 'model'}, pid=${o['@_pid'] || '-'}, pindex=${o['@_pindex'] || '-'}`);
    });

    // For each build item, trace the full hierarchy
    console.log('\n  FULL BUILD ITEM TRACE:');
    for (let i = 0; i < itemArr.length; i++) {
      const item = itemArr[i];
      const objId = item['@_objectid'];
      const printable_areas = item['@_printable'] || 'true';

      console.log(`\n  ── BUILD ITEM [${i}] objectid=${objId} ──`);
      console.log(`     All item attrs: ${Object.entries(item).filter(([k]) => k.startsWith('@_')).map(([k, v]) => `${k.replace('@_', '')}=${v}`).join(', ')}`);

      const obj = objMap[objId];
      if (!obj) {
        console.log(`     WARNING: Object ${objId} not found in root model`);
        continue;
      }

      // Trace components
      const comps = obj?.components?.component;
      if (comps) {
        const compArr = Array.isArray(comps) ? comps : [comps];
        console.log(`     Object ${objId} has ${compArr.length} components:`);

        for (const comp of compArr) {
          const compObjId = comp['@_objectid'];
          const compPath = comp['@_p:path'] || comp['@_path'];
          const compPid = comp['@_pid'];
          const compPindex = comp['@_pindex'];

          console.log(`\n       COMPONENT: objectid=${compObjId}, path=${compPath || 'none'}, pid=${compPid || 'none'}, pindex=${compPindex || 'none'}`);
          console.log(`         All component attrs: ${Object.entries(comp).filter(([k]) => k.startsWith('@_')).map(([k, v]) => `${k.replace('@_', '')}=${v}`).join(', ')}`);

          // If path points to sub-model, look up the mesh there
          if (compPath) {
            const subModelPath = compPath.startsWith('/') ? compPath.substring(1) : compPath;
            const subData = modelDataMap[subModelPath];
            if (subData) {
              const subResources = subData.parsed?.resources;
              const subObjects = subResources?.object;
              if (subObjects) {
                const subObjArr = Array.isArray(subObjects) ? subObjects : [subObjects];
                const targetObj = subObjArr.find(o => o['@_id'] === compObjId);
                if (targetObj) {
                  const mesh = targetObj?.mesh;
                  if (mesh) {
                    const verts = mesh?.vertices?.vertex;
                    const tris = mesh?.triangles?.triangle;
                    const vCount = verts ? (Array.isArray(verts) ? verts.length : 1) : 0;
                    const tCount = tris ? (Array.isArray(tris) ? tris.length : 1) : 0;
                    console.log(`         → Mesh in ${subModelPath}: object ${compObjId}, ${vCount} verts, ${tCount} tris`);

                    // Check triangle pid/p1
                    if (tCount > 0) {
                      const triArr = Array.isArray(tris) ? tris : [tris];
                      const pidSet = new Set();
                      const p1Set = new Set();
                      triArr.forEach(t => {
                        if (t['@_pid']) pidSet.add(t['@_pid']);
                        if (t['@_p1']) p1Set.add(t['@_p1']);
                      });
                      console.log(`         Triangle pids: ${[...pidSet].join(', ') || 'none'}`);
                      console.log(`         Triangle p1 values: ${[...p1Set].join(', ') || 'none'}`);

                      // Check sub-model's own pid on the object
                      console.log(`         Sub-object pid: ${targetObj['@_pid'] || 'none'}, pindex: ${targetObj['@_pindex'] || 'none'}`);
                    }
                  } else {
                    // Maybe it's an assembly with its own components
                    const subComps = targetObj?.components?.component;
                    if (subComps) {
                      const scArr = Array.isArray(subComps) ? subComps : [subComps];
                      console.log(`         → Assembly in ${subModelPath}: object ${compObjId} has ${scArr.length} sub-components`);
                      scArr.forEach((sc, si) => {
                        const attrs = Object.entries(sc).filter(([k]) => k.startsWith('@_')).map(([k, v]) => `${k.replace('@_', '')}=${v}`).join(', ');
                        console.log(`           sub-component [${si}]: ${attrs}`);
                      });
                    }
                  }
                } else {
                  console.log(`         WARNING: Object ${compObjId} not found in ${subModelPath}`);
                  // List what's available
                  subObjArr.forEach(o => console.log(`           Available: id=${o['@_id']}`));
                }
              }
            } else {
              console.log(`         WARNING: Sub-model ${subModelPath} not found in parsed data`);
            }
          }
        }
      } else if (obj?.mesh) {
        // Direct mesh on root object (no components)
        const mesh = obj.mesh;
        const verts = mesh?.vertices?.vertex;
        const tris = mesh?.triangles?.triangle;
        const vCount = verts ? (Array.isArray(verts) ? verts.length : 1) : 0;
        const tCount = tris ? (Array.isArray(tris) ? tris.length : 1) : 0;
        console.log(`     Direct mesh: ${vCount} verts, ${tCount} tris`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 5: COLOR RESOLUTION — PER PLATE PER FILAMENT
// ═══════════════════════════════════════════════════════════════════════

printSeparator('SECTION 5: COLOR RESOLUTION — FILAMENT/EXTRUDER ASSIGNMENTS');

{
  // Parse model_settings for extruder assignment per object
  const modelSettingsText = readText('Metadata/model_settings.config');
  if (modelSettingsText) {
    const msParsed = parseXml(modelSettingsText);

    // Bambu model_settings typically has a <config> root with <plate> and <object> children
    // Let's dump the full structure
    console.log('\n  model_settings.config parsed structure:');
    const dumpStructure = (obj, indent = 2) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('@_')) {
          console.log(`${' '.repeat(indent)}attr ${k.replace('@_', '')}: ${v}`);
        } else if (Array.isArray(v)) {
          console.log(`${' '.repeat(indent)}${k}: [${v.length} items]`);
          v.slice(0, 30).forEach((item, i) => {
            if (typeof item === 'object') {
              const attrs = Object.entries(item).filter(([kk]) => kk.startsWith('@_')).map(([kk, vv]) => `${kk.replace('@_', '')}=${vv}`).join(', ');
              console.log(`${' '.repeat(indent + 2)}[${i}] ${attrs}`);
              // Print child elements
              for (const [ck, cv] of Object.entries(item)) {
                if (!ck.startsWith('@_') && ck !== '#text') {
                  if (typeof cv === 'string' || typeof cv === 'number') {
                    console.log(`${' '.repeat(indent + 4)}${ck}: ${cv}`);
                  } else if (Array.isArray(cv)) {
                    console.log(`${' '.repeat(indent + 4)}${ck}: [${cv.length} items]`);
                    cv.slice(0, 10).forEach((sub, si) => {
                      if (typeof sub === 'object') {
                        const sa = Object.entries(sub).filter(([sk]) => sk.startsWith('@_')).map(([sk, sv]) => `${sk.replace('@_', '')}=${sv}`).join(', ');
                        console.log(`${' '.repeat(indent + 6)}[${si}] ${sa}`);
                        // One more level
                        for (const [dk, dv] of Object.entries(sub)) {
                          if (!dk.startsWith('@_') && dk !== '#text') {
                            if (Array.isArray(dv)) {
                              console.log(`${' '.repeat(indent + 8)}${dk}: [${dv.length} items]`);
                              dv.slice(0, 5).forEach((dd, di) => {
                                if (typeof dd === 'object') {
                                  const da = Object.entries(dd).filter(([ddk]) => ddk.startsWith('@_')).map(([ddk, ddv]) => `${ddk.replace('@_', '')}=${ddv}`).join(', ');
                                  console.log(`${' '.repeat(indent + 10)}[${di}] ${da}`);
                                }
                              });
                            } else if (typeof dv === 'object') {
                              console.log(`${' '.repeat(indent + 8)}${dk}: {object}`);
                            }
                          }
                        }
                      }
                    });
                  } else if (typeof cv === 'object') {
                    console.log(`${' '.repeat(indent + 4)}${ck}: {object}`);
                  }
                }
              }
            } else {
              console.log(`${' '.repeat(indent + 2)}[${i}] ${item}`);
            }
          });
        } else if (typeof v === 'object') {
          console.log(`${' '.repeat(indent)}${k}: {object}`);
          dumpStructure(v, indent + 2);
        } else {
          console.log(`${' '.repeat(indent)}${k}: ${String(v).substring(0, 100)}`);
        }
      }
    };
    dumpStructure(msParsed);
  }

  // Also parse project_settings for filament colors
  const projText = readText('Metadata/project_settings.config');
  if (projText) {
    printSubSep('Filament Color Config from project_settings');
    const lines = projText.split('\n');
    const colorLines = lines.filter(l => /filament_colour|filament_color|default_filament/i.test(l));
    colorLines.forEach(l => console.log(`  ${l.trim()}`));

    // Also check for nozzle/extruder count
    const extruderLines = lines.filter(l => /extruder|nozzle_diameter/i.test(l));
    extruderLines.slice(0, 5).forEach(l => console.log(`  ${l.trim()}`));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 6: BAMBU-SPECIFIC NAMESPACES & CUSTOM DATA
// ═══════════════════════════════════════════════════════════════════════

printSeparator('SECTION 6: BAMBU-SPECIFIC NAMESPACES & CUSTOM DATA');

{
  // Check ALL model files for Bambu-specific namespace content
  for (const entry of modelEntries) {
    const text = entry.getData().toString('utf8');

    console.log(`\n  Checking ${entry.entryName} for custom namespaces:`);

    // Search for namespace declarations
    const nsMatches = text.match(/xmlns:\w+="[^"]+"/g);
    if (nsMatches) {
      nsMatches.forEach(m => console.log(`    ${m}`));
    }

    // Check for m: prefixed elements (materials extension)
    const mElements = text.match(/<m:\w+[^>]*>/g);
    if (mElements) {
      console.log(`    m: namespace elements: ${mElements.length}`);
      [...new Set(mElements.slice(0, 20))].forEach(e => console.log(`      ${e}`));
    }

    // Check for p: prefixed attributes (production extension)
    const pAttrs = text.match(/p:\w+="[^"]*"/g);
    if (pAttrs) {
      const unique = [...new Set(pAttrs)];
      console.log(`    p: attributes (${unique.length} unique):`);
      unique.slice(0, 20).forEach(a => console.log(`      ${a}`));
    }

    // Check for BambuStudio-specific elements
    const bambuElements = text.match(/<[^>]*bambu[^>]*>/gi);
    if (bambuElements) {
      console.log(`    Bambu-specific elements:`);
      bambuElements.slice(0, 10).forEach(e => console.log(`      ${e}`));
    }

    // Check for slic3r or BBS namespace
    if (/slic3r|BambuStudio/i.test(text)) {
      const bbsMatches = text.match(/[^\n]*(?:slic3r|BambuStudio)[^\n]*/gi);
      if (bbsMatches) {
        console.log(`    Slic3r/BambuStudio references:`);
        [...new Set(bbsMatches.slice(0, 10))].forEach(m => console.log(`      ${m.trim().substring(0, 120)}`));
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 7: SUMMARY — COMPLETE PLATE-COLOR MAP
// ═══════════════════════════════════════════════════════════════════════

printSeparator('SECTION 7: FINAL SUMMARY — PLATE-COLOR MAP');

{
  // Re-parse everything needed for the summary
  const rootText = readText('3D/3dmodel.model');
  const modelSettingsText = readText('Metadata/model_settings.config');
  const projText = readText('Metadata/project_settings.config');

  if (!rootText) {
    console.log('  Cannot build summary: root model missing');
  } else {
    const rootParsed = parseXml(rootText);
    const rootModel = rootParsed?.model || rootParsed;
    const rootResources = rootModel?.resources;
    const rootBuild = rootModel?.build;

    // Collect basematerials from root
    const rootBM = rootResources?.basematerials;
    if (rootBM) {
      console.log('\n  Root model basematerials:');
      const bmArr = Array.isArray(rootBM) ? rootBM : [rootBM];
      bmArr.forEach(bm => {
        const bases = bm?.base;
        if (bases) {
          const bArr = Array.isArray(bases) ? bases : [bases];
          bArr.forEach((b, i) => {
            console.log(`    [${i}] name="${b['@_name']}" displaycolor="${b['@_displaycolor']}"`);
          });
        }
      });
    }

    // Filament colors from project settings
    if (projText) {
      const filamentColorMatch = projText.match(/filament_colour\s*=\s*([^\n]+)/);
      if (filamentColorMatch) {
        console.log(`\n  Filament colours from project: ${filamentColorMatch[1]}`);
      }
    }

    // Build plate map from model_settings
    if (modelSettingsText) {
      const msParsed = parseXml(modelSettingsText);
      const config = msParsed?.config || msParsed;

      // Look for plate elements
      const plates = config?.plate;
      if (plates) {
        const pArr = Array.isArray(plates) ? plates : [plates];
        console.log(`\n  ${pArr.length} plates found in model_settings:`);
        pArr.forEach((plate, pi) => {
          console.log(`\n    PLATE ${pi}:`);
          const attrs = Object.entries(plate).filter(([k]) => k.startsWith('@_'));
          attrs.forEach(([k, v]) => console.log(`      ${k.replace('@_', '')}: ${v}`));

          // Check for filament_info or instance lists
          for (const [k, v] of Object.entries(plate)) {
            if (!k.startsWith('@_') && k !== '#text') {
              if (Array.isArray(v)) {
                console.log(`      ${k}: [${v.length} items]`);
                v.slice(0, 20).forEach((item, ii) => {
                  if (typeof item === 'object') {
                    const ia = Object.entries(item).filter(([ik]) => ik.startsWith('@_')).map(([ik, iv]) => `${ik.replace('@_', '')}=${iv}`).join(', ');
                    console.log(`        [${ii}] ${ia}`);
                  }
                });
              }
            }
          }
        });
      }

      // Look for object-level extruder/part configs
      const objectConfigs = config?.object;
      if (objectConfigs) {
        const ocArr = Array.isArray(objectConfigs) ? objectConfigs : [objectConfigs];
        console.log(`\n  ${ocArr.length} object configs in model_settings:`);
        ocArr.forEach((oc, oi) => {
          console.log(`\n    OBJECT CONFIG [${oi}]:`);
          for (const [k, v] of Object.entries(oc)) {
            if (k.startsWith('@_')) {
              console.log(`      ${k.replace('@_', '')}: ${v}`);
            } else if (k === 'part') {
              const parts = Array.isArray(v) ? v : [v];
              parts.forEach((p, pi) => {
                console.log(`      PART [${pi}]:`);
                for (const [pk, pv] of Object.entries(p)) {
                  if (pk.startsWith('@_')) {
                    console.log(`        ${pk.replace('@_', '')}: ${pv}`);
                  } else if (typeof pv === 'string' || typeof pv === 'number') {
                    console.log(`        ${pk}: ${pv}`);
                  } else if (Array.isArray(pv)) {
                    console.log(`        ${pk}: [${pv.length} items]`);
                    pv.slice(0, 5).forEach((sub, si) => {
                      if (typeof sub === 'object') {
                        const sa = Object.entries(sub).map(([sk, sv]) => `${sk}=${sv}`).join(', ');
                        console.log(`          [${si}] ${sa}`);
                      }
                    });
                  }
                }
              });
            } else if (typeof v === 'string' || typeof v === 'number') {
              console.log(`      ${k}: ${String(v).substring(0, 100)}`);
            }
          }
        });
      }
    }

    // Build the final trace: for each build item, resolve to mesh + color
    console.log('\n\n  ═══ FINAL OBJECT→COLOR RESOLUTION ═══');

    const rootObjects = rootResources?.object;
    const rootObjArr = rootObjects ? (Array.isArray(rootObjects) ? rootObjects : [rootObjects]) : [];
    const rootObjMap = {};
    rootObjArr.forEach(o => { rootObjMap[o['@_id']] = o; });

    // Get basematerials map
    const bmMap = {}; // resourceId → { index → color }
    if (rootBM) {
      const bmArr = Array.isArray(rootBM) ? rootBM : [rootBM];
      bmArr.forEach(bm => {
        const id = bm['@_id'];
        bmMap[id] = {};
        const bases = bm?.base;
        if (bases) {
          const bArr = Array.isArray(bases) ? bases : [bases];
          bArr.forEach((b, i) => {
            bmMap[id][i] = { name: b['@_name'], color: b['@_displaycolor'] };
          });
        }
      });
    }

    // Also collect basematerials from sub-models
    for (const [path, data] of Object.entries(modelDataMap)) {
      if (path === '3D/3dmodel.model') continue;
      const subResources = data.parsed?.resources;
      const subBM = subResources?.basematerials;
      if (subBM) {
        const bmArr = Array.isArray(subBM) ? subBM : [subBM];
        bmArr.forEach(bm => {
          const id = `${path}:${bm['@_id']}`;
          bmMap[id] = {};
          const bases = bm?.base;
          if (bases) {
            const bArr = Array.isArray(bases) ? bases : [bases];
            bArr.forEach((b, i) => {
              bmMap[id][i] = { name: b['@_name'], color: b['@_displaycolor'] };
            });
          }
        });
      }
    }

    console.log('\n  All basematerials across all models:');
    for (const [key, colors] of Object.entries(bmMap)) {
      console.log(`    Resource ${key}:`);
      for (const [idx, info] of Object.entries(colors)) {
        console.log(`      [${idx}] ${info.name}: ${info.color}`);
      }
    }

    // Resolve each build item
    const buildItems = rootBuild?.item;
    const biArr = buildItems ? (Array.isArray(buildItems) ? buildItems : [buildItems]) : [];

    for (let i = 0; i < biArr.length; i++) {
      const item = biArr[i];
      const objId = item['@_objectid'];
      const obj = rootObjMap[objId];

      console.log(`\n  ── BUILD ITEM ${i}: objectid=${objId} ──`);

      if (!obj) {
        console.log('    NOT FOUND');
        continue;
      }

      const comps = obj?.components?.component;
      if (!comps) {
        console.log('    No components (direct mesh or empty)');
        continue;
      }

      const compArr = Array.isArray(comps) ? comps : [comps];
      let totalFaces = 0;
      const filamentFaceCounts = {};

      for (const comp of compArr) {
        const cObjId = comp['@_objectid'];
        const cPath = comp['@_p:path'] || comp['@_path'];
        const cPid = comp['@_pid'];
        const cPindex = comp['@_pindex'];

        let meshObj = null;
        let modelPath = '3D/3dmodel.model';

        if (cPath) {
          modelPath = cPath.startsWith('/') ? cPath.substring(1) : cPath;
          const subData = modelDataMap[modelPath];
          if (subData) {
            const subResources = subData.parsed?.resources;
            const subObjects = subResources?.object;
            if (subObjects) {
              const soArr = Array.isArray(subObjects) ? subObjects : [subObjects];
              meshObj = soArr.find(o => o['@_id'] === cObjId);
            }
          }
        } else {
          meshObj = rootObjMap[cObjId];
        }

        if (!meshObj) {
          console.log(`    Component objid=${cObjId} path=${cPath}: MESH NOT FOUND`);
          continue;
        }

        const mesh = meshObj?.mesh;
        if (!mesh) {
          console.log(`    Component objid=${cObjId}: No mesh (assembly)`);
          continue;
        }

        const tris = mesh?.triangles?.triangle;
        const triArr = tris ? (Array.isArray(tris) ? tris : [tris]) : [];

        // Determine color source
        let colorSource = 'unknown';
        let resolvedFilament = 'unknown';

        // Priority: triangle-level pid > component pid > object pid > default (1)
        const objPid = meshObj['@_pid'];
        const objPindex = meshObj['@_pindex'];

        // Check if triangles have their own pid
        const triPids = new Set();
        triArr.forEach(t => { if (t['@_pid']) triPids.add(t['@_pid']); });

        if (triPids.size > 0) {
          colorSource = `triangle-level pid (${[...triPids].join(',')})`;
        } else if (cPid) {
          colorSource = `component pid=${cPid} pindex=${cPindex}`;
          resolvedFilament = `pid=${cPid} index=${cPindex}`;
        } else if (objPid) {
          colorSource = `sub-object pid=${objPid} pindex=${objPindex}`;
          resolvedFilament = `pid=${objPid} index=${objPindex}`;
        } else {
          colorSource = 'default (no pid anywhere)';
          resolvedFilament = 'default filament 1';
        }

        // Count faces per resolved color
        if (triPids.size > 0) {
          // Per-triangle coloring
          const comboCounts = {};
          triArr.forEach(t => {
            const pid = t['@_pid'] || (cPid || objPid || 'default');
            const p1 = t['@_p1'] || (cPindex || objPindex || '0');
            const key = `pid=${pid},p1=${p1}`;
            comboCounts[key] = (comboCounts[key] || 0) + 1;
          });
          for (const [key, count] of Object.entries(comboCounts)) {
            filamentFaceCounts[key] = (filamentFaceCounts[key] || 0) + count;
          }
        } else {
          const key = resolvedFilament;
          filamentFaceCounts[key] = (filamentFaceCounts[key] || 0) + triArr.length;
        }

        totalFaces += triArr.length;
        console.log(`    Component objid=${cObjId} path=${modelPath}: ${triArr.length} tris, color: ${colorSource}`);
      }

      console.log(`\n    TOTAL FACES: ${totalFaces}`);
      console.log('    Face counts by filament:');
      for (const [key, count] of Object.entries(filamentFaceCounts)) {
        console.log(`      ${key}: ${count} faces`);
      }
    }
  }
}

console.log('\n\n═══ ANALYSIS COMPLETE ═══\n');
