import JSZip from 'jszip';
import type { ParseResult, Plate, MeshChunk, FilamentSlot } from '../types';

const DEBUG = false;
const debugLog = (...args: unknown[]) => { if (DEBUG) console.log(...args); };

// ---- Internal types ----

interface VertexData { x: number; y: number; z: number }

interface TriangleParsed {
  v1: number; v2: number; v3: number;
  pid: number | null;
  p1: number;
  paintExtruder: number; // 0 = no paint (inherit), 1+ = painted extruder
}

interface ParsedMeshData {
  vertices: VertexData[];
  triangles: TriangleParsed[];
  baseMaterials: Map<number, { name: string; color: string }[]>;
  objectPid: number | null;
  objectPindex: number;
  hasPaintData: boolean;
}

interface PlateInfo {
  id: number;
  name: string;
  thumbnailFile: string | null;
  objectIds: number[];
}

interface ObjectMeta {
  name: string;
  extruder: number; // 1-based
  partExtruders: Map<string, number>; // partId -> extruder
  partSubtypes: Map<string, string>; // partId -> subtype (e.g. "negative_part")
}

// ---- Layer color change types (Bambu "MultiAsSingle" mode) ----

interface LayerColorChange {
  topZ: number;
  extruder: number; // 1-based
}

interface PlateLayerConfig {
  plateId: number;
  mode: string; // "MultiAsSingle", etc.
  changes: LayerColorChange[];
}

interface ZZone {
  minZ: number;
  maxZ: number;
  extruder: number; // 1-based
}

interface Vec3 { x: number; y: number; z: number }

// ---- Main entry point ----

export async function parse3MF(buffer: ArrayBuffer): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(buffer);
  const domParser = new DOMParser();

  // 1. Load all .model XML documents
  const modelDocs = new Map<string, Document>();
  for (const [path, file] of Object.entries(zip.files)) {
    if (path.toLowerCase().endsWith('.model')) {
      const xml = await file.async('text');
      const doc = domParser.parseFromString(xml, 'application/xml');
      const norm = path.startsWith('/') ? path.slice(1) : path;
      modelDocs.set(norm, doc);
      modelDocs.set('/' + norm, doc);
    }
  }

  const rootDoc = modelDocs.get('3D/3dmodel.model');
  if (!rootDoc) throw new Error('No root 3dmodel.model found in 3MF archive');

  // 2. Load filament colors from Bambu project settings
  let filamentColors: string[] = [];
  try {
    const psFile = zip.file('Metadata/project_settings.config');
    if (psFile) {
      const json = JSON.parse(await psFile.async('text'));
      if (Array.isArray(json.filament_colour)) {
        filamentColors = json.filament_colour.map((c: string) => normalizeHex(c));
      }
    }
  } catch { /* not Bambu format */ }

  // 3. Load model_settings.config for object/part metadata and plate assignments
  const objectMeta = new Map<string, ObjectMeta>();
  const plates: PlateInfo[] = [];

  try {
    const msFile = zip.file('Metadata/model_settings.config');
    if (msFile) {
      const msXml = await msFile.async('text');
      const msDoc = domParser.parseFromString(msXml, 'application/xml');

      // Parse object metadata
      const objects = msDoc.getElementsByTagName('object');
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const id = obj.getAttribute('id') || '';
        let name = '';
        let extruder = 1;
        const partExtruders = new Map<string, number>();
        const partSubtypes = new Map<string, string>();

        for (let j = 0; j < obj.children.length; j++) {
          const el = obj.children[j];
          if (el.tagName === 'metadata') {
            if (el.getAttribute('key') === 'name') name = el.getAttribute('value') || '';
            if (el.getAttribute('key') === 'extruder') extruder = parseInt(el.getAttribute('value') || '1', 10);
          }
          if (el.tagName === 'part') {
            const partId = el.getAttribute('id') || '';
            const subtype = el.getAttribute('subtype') || 'normal_part';
            partSubtypes.set(partId, subtype);
            const partMetas = el.getElementsByTagName('metadata');
            for (let k = 0; k < partMetas.length; k++) {
              if (partMetas[k].getAttribute('key') === 'extruder') {
                partExtruders.set(partId, parseInt(partMetas[k].getAttribute('value') || '1', 10));
              }
            }
          }
        }

        objectMeta.set(id, { name, extruder, partExtruders, partSubtypes });
      }

      // Parse plate assignments
      const plateEls = msDoc.getElementsByTagName('plate');
      for (let i = 0; i < plateEls.length; i++) {
        const plate = plateEls[i];
        let plateId = 0;
        let plateName = '';
        let thumbFile: string | null = null;
        const objectIds: number[] = [];

        for (let j = 0; j < plate.children.length; j++) {
          const el = plate.children[j];
          if (el.tagName === 'metadata') {
            const key = el.getAttribute('key');
            const val = el.getAttribute('value') || '';
            if (key === 'plater_id') plateId = parseInt(val, 10);
            if (key === 'plater_name') plateName = val;
            if (key === 'thumbnail_file') thumbFile = val;
          }
          if (el.tagName === 'model_instance') {
            const metas = el.getElementsByTagName('metadata');
            for (let k = 0; k < metas.length; k++) {
              if (metas[k].getAttribute('key') === 'object_id') {
                objectIds.push(parseInt(metas[k].getAttribute('value') || '0', 10));
              }
            }
          }
        }

        plates.push({ id: plateId, name: plateName || `Plate ${plateId}`, thumbnailFile: thumbFile, objectIds });
      }
    }
  } catch { /* no model settings */ }

  // 3b. Load custom_gcode_per_layer.xml for layer-based color changes (MultiAsSingle mode)
  let plateLayerConfigs: PlateLayerConfig[] = [];
  try {
    const gcodeFile = zip.file('Metadata/custom_gcode_per_layer.xml');
    if (gcodeFile) {
      const gcodeXml = await gcodeFile.async('text');
      const gcodeDoc = domParser.parseFromString(gcodeXml, 'application/xml');
      plateLayerConfigs = parseLayerColorChanges(gcodeDoc);
      if (plateLayerConfigs.length > 0) {
        debugLog(`[3MF Parser] Layer color changes found for ${plateLayerConfigs.length} plate(s)`);
      }
    }
  } catch { /* no layer color changes */ }

  // 4. Parse root model build items and resolve components to geometry
  const ns = rootDoc.documentElement.namespaceURI || '';
  const pNs = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';

  // Build item transforms
  const buildTransforms = new Map<number, number[]>();
  const buildItems = ns
    ? rootDoc.getElementsByTagNameNS(ns, 'item')
    : rootDoc.getElementsByTagName('item');
  for (let i = 0; i < buildItems.length; i++) {
    const item = buildItems[i];
    const objId = parseInt(item.getAttribute('objectid') || '0', 10);
    const tStr = item.getAttribute('transform');
    if (tStr) buildTransforms.set(objId, parseTransform(tStr));
  }

  // Resolve each root object -> MeshChunk[]
  const objectMeshChunks = new Map<number, MeshChunk[]>();
  const rootObjects = ns
    ? rootDoc.getElementsByTagNameNS(ns, 'object')
    : rootDoc.getElementsByTagName('object');

  for (let oi = 0; oi < rootObjects.length; oi++) {
    const obj = rootObjects[oi];
    const objId = parseInt(obj.getAttribute('id') || '0', 10);
    if ((obj.getAttribute('type') || 'model') !== 'model') continue;

    const meta = objectMeta.get(String(objId));
    const objExtruder = meta?.extruder ?? 1;
    const objName = meta?.name || `Object ${objId}`;
    const buildTransform = buildTransforms.get(objId) ?? null;

    const chunks: MeshChunk[] = [];

    // Check for components (Bambu multi-file pattern)
    const components = ns
      ? obj.getElementsByTagNameNS(ns, 'component')
      : obj.getElementsByTagName('component');

    if (components.length > 0) {
      for (let ci = 0; ci < components.length; ci++) {
        const comp = components[ci];
        const compPath = comp.getAttributeNS(pNs, 'path') || comp.getAttribute('p:path') || '';
        const compObjId = parseInt(comp.getAttribute('objectid') || '0', 10);

        // Skip negative/modifier parts (boolean cutters, not visible geometry)
        const partSubtype = meta?.partSubtypes.get(String(compObjId));
        if (partSubtype === 'negative_part' || partSubtype === 'modifier_part') continue;

        const compTStr = comp.getAttribute('transform');
        const compTransform = compTStr ? parseTransform(compTStr) : null;
        const finalTransform = combineTransforms(buildTransform, compTransform);

        // Resolve part extruder: check model_settings partExtruders by compObjId.
        // Bambu encodes "unassigned, inherit from object default" as extruder=0
        // (e.g. Generic-Cube anchor parts on Image-to-Keychain templates).
        // We must NOT pass 0 through — it produces filamentIndex=0 chunks that
        // render gray and are skipped by the reactive recolor pass. See Turkey.3mf.
        const rawPartExt = meta?.partExtruders.get(String(compObjId));
        const partExtruder = rawPartExt && rawPartExt > 0 ? rawPartExt : objExtruder;

        const normalizedPath = compPath.startsWith('/') ? compPath.slice(1) : compPath;
        const subDoc = compPath ? modelDocs.get(normalizedPath) : rootDoc;

        if (subDoc) {
          const subNs = subDoc.documentElement.namespaceURI || '';
          const mesh = extractMesh(subDoc, compObjId, subNs);
          if (mesh) {
            const newChunks = buildChunksFromMesh(mesh, finalTransform, objName, partExtruder);
            chunks.push(...newChunks);
          }
        }
      }
    } else {
      // Direct mesh on root object
      const mesh = extractMesh(rootDoc, objId, ns);
      if (mesh) {
        const newChunks = buildChunksFromMesh(mesh, buildTransform, objName, objExtruder);
        chunks.push(...newChunks);
      }
    }

    if (chunks.length > 0) {
      objectMeshChunks.set(objId, chunks);
    }
  }

  // 5. Build filament slots
  const filaments: FilamentSlot[] = filamentColors.map((color, i) => ({
    index: i + 1,
    originalColor: color,
    currentColor: color,
  }));

  if (filaments.length === 0) {
    filaments.push({ index: 1, originalColor: '#808080', currentColor: '#808080' });
  }

  // 6. Assemble plates
  const resultPlates: Plate[] = [];

  if (plates.length > 0) {
    for (const plateInfo of plates) {
      let meshChunks: MeshChunk[] = [];
      for (const objId of plateInfo.objectIds) {
        const chunks = objectMeshChunks.get(objId);
        if (chunks) meshChunks.push(...chunks);
      }

      // Apply layer-based color changes (MultiAsSingle mode)
      const layerConfig = plateLayerConfigs.find(c => c.plateId === plateInfo.id);
      if (layerConfig && layerConfig.changes.length > 0) {
        const defaultExtruder = objectMeta.get(String(plateInfo.objectIds[0]))?.extruder ?? 1;
        meshChunks = applyLayerColorChanges(meshChunks, layerConfig.changes, defaultExtruder);
        debugLog(`[3MF Parser] Plate ${plateInfo.id}: split by ${layerConfig.changes.length} layer color changes → ${meshChunks.length} chunks`);
      }

      let thumbnailUrl: string | null = null;
      if (plateInfo.thumbnailFile) {
        try {
          const thumbFile = zip.file(plateInfo.thumbnailFile);
          if (thumbFile) {
            const blob = await thumbFile.async('blob');
            thumbnailUrl = URL.createObjectURL(blob);
          }
        } catch { /* no thumb */ }
      }

      const filamentIndicesUsed = [...new Set(meshChunks.map(c => c.filamentIndex))].sort();

      resultPlates.push({
        id: plateInfo.id,
        name: plateInfo.name || `Plate ${plateInfo.id}`,
        thumbnailUrl,
        meshChunks,
        filamentIndicesUsed,
      });
    }
  } else {
    // Single-plate fallback
    const allChunks: MeshChunk[] = [];
    for (const chunks of objectMeshChunks.values()) allChunks.push(...chunks);
    resultPlates.push({
      id: 1,
      name: 'Plate 1',
      thumbnailUrl: null,
      meshChunks: allChunks,
      filamentIndicesUsed: [...new Set(allChunks.map(c => c.filamentIndex))].sort(),
    });
  }

  const nonEmptyPlates = resultPlates.filter(p => p.meshChunks.length > 0);
  if (nonEmptyPlates.length === 0) throw new Error('No geometry found in 3MF file');

  // Debug: log plate/chunk/filament mapping
  debugLog('[3MF Parser] Filaments:', filaments.map(f => `${f.index}=${f.originalColor}`).join(', '));
  for (const plate of nonEmptyPlates) {
    const chunkSummary = plate.meshChunks.map(c => `${c.name}(fil=${c.filamentIndex},faces=${c.faceCount})`).join(', ');
    debugLog(`[3MF Parser] Plate ${plate.id} "${plate.name}": filaments=[${plate.filamentIndicesUsed}] chunks=[${chunkSummary}]`);
  }

  return { plates: nonEmptyPlates, filaments };
}

// ---- Helpers ----

function normalizeHex(color: string): string {
  if (!color.startsWith('#')) color = '#' + color;
  if (color.length > 7) color = color.slice(0, 7);
  return color.toUpperCase();
}

/**
 * Build MeshChunks from a parsed mesh, handling all color systems:
 * 1. Bambu paint_color per-face painting (highest priority)
 * 2. Standard 3MF pid/p1 inline colors
 * 3. Default extruder from model_settings metadata
 */
function buildChunksFromMesh(
  mesh: ParsedMeshData,
  transform: number[] | null,
  name: string,
  defaultExtruder: number,
): MeshChunk[] {
  // Check for Bambu paint_color data (per-face extruder painting)
  if (mesh.hasPaintData) {
    return buildChunksFromPaintData(mesh, transform, name, defaultExtruder);
  }

  // Check for standard 3MF inline colors (pid/p1 + basematerials)
  const hasInlineColors = mesh.triangles.some(t => t.pid !== null) || mesh.objectPid !== null;
  if (hasInlineColors && mesh.baseMaterials.size > 0) {
    const colorGroups = groupByInlineColor(mesh);
    const chunks: MeshChunk[] = [];
    for (const [, tris] of colorGroups) {
      const chunk = buildMeshChunk(mesh.vertices, tris, transform, name, defaultExtruder);
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  // Fallback: entire mesh uses default extruder
  const chunk = buildMeshChunk(mesh.vertices, mesh.triangles, transform, name, defaultExtruder);
  return chunk ? [chunk] : [];
}

/**
 * Split mesh into chunks by paint_color extruder assignment.
 * Groups triangles by their resolved extruder index.
 */
function buildChunksFromPaintData(
  mesh: ParsedMeshData,
  transform: number[] | null,
  name: string,
  defaultExtruder: number,
): MeshChunk[] {
  // Group triangles by their resolved extruder
  const groups = new Map<number, TriangleParsed[]>();

  for (const tri of mesh.triangles) {
    // paintExtruder: 0 = inherit default, 1+ = specific extruder
    const extruder = tri.paintExtruder > 0 ? tri.paintExtruder : defaultExtruder;
    if (!groups.has(extruder)) groups.set(extruder, []);
    groups.get(extruder)!.push(tri);
  }

  const chunks: MeshChunk[] = [];
  for (const [extruder, tris] of groups) {
    const chunk = buildMeshChunk(mesh.vertices, tris, transform, name, extruder);
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

/**
 * Decode Bambu paint_color attribute value.
 *
 * BambuStudio/PrusaSlicer TriangleSelector encoding:
 * - Hex string is read RIGHT-TO-LEFT (rightmost char = tree root)
 * - Each nibble: lower 2 bits = split_sides, upper 2 bits = state (leaf) or special_side (split)
 * - split_sides: 0=leaf, 1=2children, 2=3children, 3=4children
 * - Leaf states: 0=inherit, 1=Ext1, 2=Ext2, 3=extended (read next nibble, state = value+3)
 * - Extended overflow: if extension nibble is 0xF, accumulate +15 and read another
 *
 * Returns the dominant extruder for this triangle (0 = inherit default).
 */
function decodePaintColor(hex: string): number {
  if (!hex || hex.length === 0) return 0;

  // Read right-to-left: reverse the string so we can read left-to-right
  const reversed = hex.split('').reverse().join('');
  const reader = { pos: 0 };
  return decodePaintTree(reversed, reader);
}

/**
 * Recursively decode paint_color tree and return the dominant extruder.
 *
 * For subdivided triangles, returns the majority state INCLUDING inherit (0).
 * Earlier versions filtered `s > 0` to "prefer painted over inherited", but
 * that over-paints boundary triangles: a triangle with children [0,0,0,4]
 * (75% inherit, 25% white) would get painted entirely white, creating a
 * visible seam bleeding from white painted regions into unpainted neighbors.
 * With the filter removed, inherit wins in that case, giving a cleaner edge.
 * See docs/ARCHITECTURE.md for the kuwait.3mf diagnostic story.
 */
function decodePaintTree(hex: string, reader: { pos: number }): number {
  if (reader.pos >= hex.length) return 0;

  const nibble = parseInt(hex[reader.pos++], 16);
  if (isNaN(nibble)) return 0;

  const splitSides = nibble & 3;
  const upper = (nibble >> 2) & 3;

  // Leaf node: no subdivision
  if (splitSides === 0) {
    if (upper < 3) return upper; // 0=inherit, 1=Ext1, 2=Ext2

    // Extended state (upper=3, nibble=0xC): read next nibble(s) for extruder 3+
    let extState = 0;
    while (reader.pos < hex.length) {
      const ext = parseInt(hex[reader.pos++], 16);
      if (isNaN(ext)) return 0;
      if (ext === 0xF) {
        extState += 15; // overflow: accumulate and read next
      } else {
        extState += ext;
        break;
      }
    }
    return 3 + extState;
  }

  // Split node: upper bits = special_side (which edge), not relevant for color
  const numChildren = splitSides + 1;
  const votes = new Map<number, number>();

  for (let i = 0; i < numChildren; i++) {
    const childState = decodePaintTree(hex, reader);
    votes.set(childState, (votes.get(childState) || 0) + 1);
  }

  // Plurality vote including inherit (state 0). If inherit has the most
  // children, the triangle inherits — avoids over-painting boundary tris.
  let bestState = 0;
  let bestCount = -1;
  for (const [s, count] of votes) {
    if (count > bestCount) {
      bestState = s;
      bestCount = count;
    }
  }
  return bestState;
}

function extractMesh(doc: Document, objectId: number, ns: string): ParsedMeshData | null {
  const objects = ns ? doc.getElementsByTagNameNS(ns, 'object') : doc.getElementsByTagName('object');
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (parseInt(obj.getAttribute('id') || '-1', 10) !== objectId) continue;
    // Skip non-model objects (e.g. type="other" are boolean cutters)
    const objType = obj.getAttribute('type') || 'model';
    if (objType !== 'model') return null;

    const vEls = ns ? obj.getElementsByTagNameNS(ns, 'vertex') : obj.getElementsByTagName('vertex');
    if (vEls.length === 0) return null;

    const vertices: VertexData[] = [];
    for (let vi = 0; vi < vEls.length; vi++) {
      vertices.push({
        x: parseFloat(vEls[vi].getAttribute('x') || '0'),
        y: parseFloat(vEls[vi].getAttribute('y') || '0'),
        z: parseFloat(vEls[vi].getAttribute('z') || '0'),
      });
    }

    const tEls = ns ? obj.getElementsByTagNameNS(ns, 'triangle') : obj.getElementsByTagName('triangle');
    const triangles: TriangleParsed[] = [];
    let hasPaintData = false;

    for (let ti = 0; ti < tEls.length; ti++) {
      const t = tEls[ti];
      const pid = t.getAttribute('pid') ? parseInt(t.getAttribute('pid')!, 10) : null;

      // Bambu paint_color: per-face extruder painting
      const paintColor = t.getAttribute('paint_color') || '';
      const paintExtruder = paintColor ? decodePaintColor(paintColor) : 0;
      if (paintExtruder > 0 || paintColor.length > 0) hasPaintData = true;

      triangles.push({
        v1: parseInt(t.getAttribute('v1') || '0', 10),
        v2: parseInt(t.getAttribute('v2') || '0', 10),
        v3: parseInt(t.getAttribute('v3') || '0', 10),
        pid,
        p1: parseInt(t.getAttribute('p1') || '0', 10),
        paintExtruder,
      });
    }

    return {
      vertices, triangles,
      baseMaterials: parseBaseMaterials(doc, ns),
      objectPid: obj.getAttribute('pid') ? parseInt(obj.getAttribute('pid')!, 10) : null,
      objectPindex: parseInt(obj.getAttribute('pindex') || '0', 10),
      hasPaintData,
    };
  }
  return null;
}

function parseBaseMaterials(doc: Document, ns: string): Map<number, { name: string; color: string }[]> {
  const map = new Map<number, { name: string; color: string }[]>();
  const bms = ns ? doc.getElementsByTagNameNS(ns, 'basematerials') : doc.getElementsByTagName('basematerials');
  for (let i = 0; i < bms.length; i++) {
    const bm = bms[i];
    const id = parseInt(bm.getAttribute('id') || '0', 10);
    const bases = ns ? bm.getElementsByTagNameNS(ns, 'base') : bm.getElementsByTagName('base');
    const mats: { name: string; color: string }[] = [];
    for (let j = 0; j < bases.length; j++) {
      mats.push({
        name: bases[j].getAttribute('name') || `Material ${j + 1}`,
        color: normalizeHex(bases[j].getAttribute('displaycolor') || '#808080'),
      });
    }
    map.set(id, mats);
  }
  return map;
}

function groupByInlineColor(mesh: ParsedMeshData): Map<string, TriangleParsed[]> {
  const groups = new Map<string, TriangleParsed[]>();
  for (const tri of mesh.triangles) {
    const resolvedPid = tri.pid ?? mesh.objectPid;
    const resolvedP1 = tri.pid !== null ? tri.p1 : mesh.objectPindex;
    let colorHex = '#808080';
    if (resolvedPid !== null) {
      const mats = mesh.baseMaterials.get(resolvedPid);
      if (mats?.[resolvedP1]) colorHex = mats[resolvedP1].color;
    }
    const key = colorHex.slice(0, 7).toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tri);
  }
  return groups;
}

function buildMeshChunk(
  vertices: VertexData[],
  triangles: TriangleParsed[],
  transform: number[] | null,
  name: string,
  filamentIndex: number,
): MeshChunk | null {
  if (triangles.length === 0) return null;

  const faceCount = triangles.length;
  const positions = new Float32Array(faceCount * 9);
  const normals = new Float32Array(faceCount * 9);

  for (let fi = 0; fi < faceCount; fi++) {
    const tri = triangles[fi];
    const vA = vertices[tri.v1];
    const vB = vertices[tri.v2];
    const vC = vertices[tri.v3];
    if (!vA || !vB || !vC) continue;

    let [ax, ay, az] = [vA.x, vA.y, vA.z];
    let [bx, by, bz] = [vB.x, vB.y, vB.z];
    let [cx, cy, cz] = [vC.x, vC.y, vC.z];

    if (transform) {
      [ax, ay, az] = applyTransform(transform, ax, ay, az);
      [bx, by, bz] = applyTransform(transform, bx, by, bz);
      [cx, cy, cz] = applyTransform(transform, cx, cy, cz);
    }

    const off = fi * 9;
    positions[off] = ax; positions[off+1] = ay; positions[off+2] = az;
    positions[off+3] = bx; positions[off+4] = by; positions[off+5] = bz;
    positions[off+6] = cx; positions[off+7] = cy; positions[off+8] = cz;

    const ex = bx-ax, ey = by-ay, ez = bz-az;
    const fx = cx-ax, fy = cy-ay, fz = cz-az;
    let nx = ey*fz - ez*fy;
    let ny = ez*fx - ex*fz;
    let nz = ex*fy - ey*fx;
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    nx /= len; ny /= len; nz /= len;

    normals[off] = nx; normals[off+1] = ny; normals[off+2] = nz;
    normals[off+3] = nx; normals[off+4] = ny; normals[off+5] = nz;
    normals[off+6] = nx; normals[off+7] = ny; normals[off+8] = nz;
  }

  return { name, filamentIndex, positions, normals, faceCount };
}

function parseTransform(str: string): number[] {
  return str.split(/\s+/).map(Number);
}

function applyTransform(m: number[], x: number, y: number, z: number): [number, number, number] {
  if (m.length >= 12) {
    return [
      m[0]*x + m[3]*y + m[6]*z + m[9],
      m[1]*x + m[4]*y + m[7]*z + m[10],
      m[2]*x + m[5]*y + m[8]*z + m[11],
    ];
  }
  return [x, y, z];
}

function combineTransforms(outer: number[] | null, inner: number[] | null): number[] | null {
  if (!outer && !inner) return null;
  if (!outer) return inner;
  if (!inner) return outer;
  const a = outer, b = inner;
  return [
    a[0]*b[0]+a[3]*b[1]+a[6]*b[2], a[1]*b[0]+a[4]*b[1]+a[7]*b[2], a[2]*b[0]+a[5]*b[1]+a[8]*b[2],
    a[0]*b[3]+a[3]*b[4]+a[6]*b[5], a[1]*b[3]+a[4]*b[4]+a[7]*b[5], a[2]*b[3]+a[5]*b[4]+a[8]*b[5],
    a[0]*b[6]+a[3]*b[7]+a[6]*b[8], a[1]*b[6]+a[4]*b[7]+a[7]*b[8], a[2]*b[6]+a[5]*b[7]+a[8]*b[8],
    a[0]*b[9]+a[3]*b[10]+a[6]*b[11]+a[9], a[1]*b[9]+a[4]*b[10]+a[7]*b[11]+a[10], a[2]*b[9]+a[5]*b[10]+a[8]*b[11]+a[11],
  ];
}

// ---- Layer color change functions ----

function parseLayerColorChanges(doc: Document): PlateLayerConfig[] {
  const configs: PlateLayerConfig[] = [];
  const plateEls = doc.getElementsByTagName('plate');

  for (let i = 0; i < plateEls.length; i++) {
    const plate = plateEls[i];
    let plateId = 0;
    let mode = '';
    const changes: LayerColorChange[] = [];

    for (let j = 0; j < plate.children.length; j++) {
      const el = plate.children[j];
      if (el.tagName === 'plate_info') {
        plateId = parseInt(el.getAttribute('id') || '0', 10);
      }
      if (el.tagName === 'layer') {
        const topZ = parseFloat(el.getAttribute('top_z') || '0');
        const extruder = parseInt(el.getAttribute('extruder') || '1', 10);
        changes.push({ topZ, extruder });
      }
      if (el.tagName === 'mode') {
        mode = el.getAttribute('value') || '';
      }
    }

    if (changes.length > 0) {
      configs.push({ plateId, mode, changes });
    }
  }

  return configs;
}

/**
 * Build sorted Z zones from layer color changes.
 * Each zone covers a Z range and has an assigned extruder.
 */
function buildZZones(changes: LayerColorChange[], defaultExtruder: number): ZZone[] {
  const sorted = [...changes].sort((a, b) => a.topZ - b.topZ);
  const zones: ZZone[] = [];
  let currentZ = -Infinity;
  let currentExtruder = defaultExtruder;

  for (const change of sorted) {
    zones.push({ minZ: currentZ, maxZ: change.topZ, extruder: currentExtruder });
    currentZ = change.topZ;
    currentExtruder = change.extruder;
  }

  // Final zone extends to infinity
  zones.push({ minZ: currentZ, maxZ: Infinity, extruder: currentExtruder });
  return zones;
}

/**
 * Apply layer-based color changes to mesh chunks.
 * Splits chunks at Z boundaries and assigns zone extruders.
 */
function applyLayerColorChanges(
  chunks: MeshChunk[],
  changes: LayerColorChange[],
  defaultExtruder: number,
): MeshChunk[] {
  const zones = buildZZones(changes, defaultExtruder);
  const result: MeshChunk[] = [];
  for (const chunk of chunks) {
    result.push(...splitChunkByZZones(chunk, zones));
  }
  return result;
}

/**
 * Split a mesh chunk's triangles into multiple chunks based on Z zones.
 * Triangles crossing zone boundaries are clipped at the Z plane.
 */
function splitChunkByZZones(chunk: MeshChunk, zones: ZZone[]): MeshChunk[] {
  if (zones.length <= 1) return [chunk];

  // Z boundaries to clip at (all zone maxZ values except infinity)
  const boundaries = zones.slice(0, -1).map(z => z.maxZ);

  // Map from extruder -> triangle vertex triples
  const extruderTris = new Map<number, Vec3[][]>();

  const pos = chunk.positions;
  for (let i = 0; i < chunk.faceCount; i++) {
    const off = i * 9;
    const a: Vec3 = { x: pos[off], y: pos[off+1], z: pos[off+2] };
    const b: Vec3 = { x: pos[off+3], y: pos[off+4], z: pos[off+5] };
    const c: Vec3 = { x: pos[off+6], y: pos[off+7], z: pos[off+8] };

    // Progressively clip triangle against each Z boundary
    let currentTris: Vec3[][] = [[a, b, c]];

    for (let bi = 0; bi < boundaries.length; bi++) {
      const cutZ = boundaries[bi];
      const belowTris: Vec3[][] = [];
      const aboveTris: Vec3[][] = [];

      for (const tri of currentTris) {
        const clipped = clipTriangleAtZ(tri[0], tri[1], tri[2], cutZ);
        belowTris.push(...clipped.below);
        aboveTris.push(...clipped.above);
      }

      // Below tris belong to the zone at this boundary index
      if (belowTris.length > 0) {
        const ext = zones[bi].extruder;
        if (!extruderTris.has(ext)) extruderTris.set(ext, []);
        extruderTris.get(ext)!.push(...belowTris);
      }

      // Continue with above tris for next boundary
      currentTris = aboveTris;
    }

    // Remaining tris go into the last zone
    if (currentTris.length > 0) {
      const ext = zones[zones.length - 1].extruder;
      if (!extruderTris.has(ext)) extruderTris.set(ext, []);
      extruderTris.get(ext)!.push(...currentTris);
    }
  }

  // Build MeshChunks from grouped triangles
  const result: MeshChunk[] = [];
  for (const [extruder, tris] of extruderTris) {
    if (tris.length === 0) continue;

    const faceCount = tris.length;
    const positions = new Float32Array(faceCount * 9);
    const normals = new Float32Array(faceCount * 9);

    for (let fi = 0; fi < faceCount; fi++) {
      const [va, vb, vc] = tris[fi];
      const off = fi * 9;

      positions[off] = va.x; positions[off+1] = va.y; positions[off+2] = va.z;
      positions[off+3] = vb.x; positions[off+4] = vb.y; positions[off+5] = vb.z;
      positions[off+6] = vc.x; positions[off+7] = vc.y; positions[off+8] = vc.z;

      // Compute face normal
      const ex = vb.x-va.x, ey = vb.y-va.y, ez = vb.z-va.z;
      const fx = vc.x-va.x, fy = vc.y-va.y, fz = vc.z-va.z;
      let nx = ey*fz - ez*fy;
      let ny = ez*fx - ex*fz;
      let nz = ex*fy - ey*fx;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      nx /= len; ny /= len; nz /= len;

      normals[off] = nx; normals[off+1] = ny; normals[off+2] = nz;
      normals[off+3] = nx; normals[off+4] = ny; normals[off+5] = nz;
      normals[off+6] = nx; normals[off+7] = ny; normals[off+8] = nz;
    }

    result.push({ name: chunk.name, filamentIndex: extruder, positions, normals, faceCount });
  }

  return result;
}

/**
 * Clip a triangle at a Z plane. Returns triangles below and above the plane.
 */
function clipTriangleAtZ(
  p0: Vec3, p1: Vec3, p2: Vec3, cutZ: number,
): { below: Vec3[][]; above: Vec3[][] } {
  const a0 = p0.z >= cutZ;
  const a1 = p1.z >= cutZ;
  const a2 = p2.z >= cutZ;
  const numAbove = +a0 + +a1 + +a2;

  if (numAbove === 3) return { below: [], above: [[p0, p1, p2]] };
  if (numAbove === 0) return { below: [[p0, p1, p2]], above: [] };

  // Identify the lone vertex (the one on its own side)
  let lone: Vec3, other1: Vec3, other2: Vec3;
  let loneIsAbove: boolean;

  if (numAbove === 1) {
    loneIsAbove = true;
    if (a0) { lone = p0; other1 = p1; other2 = p2; }
    else if (a1) { lone = p1; other1 = p0; other2 = p2; }
    else { lone = p2; other1 = p0; other2 = p1; }
  } else {
    // numAbove === 2, lone is below
    loneIsAbove = false;
    if (!a0) { lone = p0; other1 = p1; other2 = p2; }
    else if (!a1) { lone = p1; other1 = p0; other2 = p2; }
    else { lone = p2; other1 = p0; other2 = p1; }
  }

  // Find intersection points on edges lone→other1 and lone→other2
  const t1 = Math.max(0, Math.min(1, (cutZ - lone.z) / (other1.z - lone.z)));
  const i1 = lerpVec3(lone, other1, t1);
  const t2 = Math.max(0, Math.min(1, (cutZ - lone.z) / (other2.z - lone.z)));
  const i2 = lerpVec3(lone, other2, t2);

  // Lone side gets 1 triangle, other side gets 2 triangles
  const loneSide: Vec3[][] = [[lone, i1, i2]];
  const otherSide: Vec3[][] = [
    [i1, other1, other2],
    [i1, other2, i2],
  ];

  if (loneIsAbove) {
    return { above: loneSide, below: otherSide };
  } else {
    return { below: loneSide, above: otherSide };
  }
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
    z: a.z + t * (b.z - a.z),
  };
}
