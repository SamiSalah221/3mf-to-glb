import JSZip from 'jszip';
import type { ParseResult, Plate, MeshChunk, FilamentSlot, SourceUnit } from '../types/index.js';
import { UNIT_TO_METERS } from '../types/index.js';
import { parseXml } from './parseXml.js';
import { mixFilamentHex } from './filamentMixer.js';

const DEBUG = false;
const debugLog = (...args: unknown[]) => { if (DEBUG) console.log(...args); };

// ---- Internal types ----

interface VertexData { x: number; y: number; z: number }

interface TriangleParsed {
  v1: number; v2: number; v3: number;
  pid: number | null;
  p1: number;
  paintColor: string; // raw Bambu paint_color attribute; '' = unpainted
}

/** One node of a decoded Bambu paint_color subdivision tree. */
interface PaintTreeNode {
  splitSides: number;               // 0 = leaf, 1..3 = subdivided
  specialSide: number;              // 0..2, meaningful only when splitSides > 0
  state: number;                    // leaf extruder state; 0 = inherit
  children: PaintTreeNode[] | null; // length splitSides + 1, in child-array order
  /**
   * The single state covering this whole subtree, or null when it is mixed.
   * A uniform subtree tiles exactly the parent triangle, so it can be emitted
   * as that one triangle instead of every leaf. Slicers routinely subdivide
   * deep into regions that end up a single color, and expanding those blindly
   * multiplied watchful-owl from 0.9M to 18.7M faces.
   */
  uniform: number | null;
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

interface PartMeta {
  id: string;       // component objectid; NOT unique when a mesh is instanced
  extruder: number; // raw value; 0 = unassigned, inherit the object default
  subtype: string;  // "normal_part" | "negative_part" | "modifier_part"
}

interface ObjectMeta {
  name: string;
  extruder: number; // 1-based
  /**
   * Ordered exactly as the <part> elements appear. Bambu's part list mirrors
   * the root object's <component> list one to one, so parts must be matched by
   * POSITION. Part ids repeat whenever the same mesh is instanced more than
   * once (azerbaijan.3mf reuses Generic-Cube objectid 13 three times with
   * different extruders), which an id-keyed map silently collapses.
   */
  parts: PartMeta[];
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

export async function parse3MF(buffer: ArrayBuffer | Uint8Array): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Load all .model XML documents
  const modelDocs = new Map<string, Document>();
  for (const [path, file] of Object.entries(zip.files)) {
    if (path.toLowerCase().endsWith('.model')) {
      const xml = await file.async('text');
      const doc = parseXml(xml);
      const norm = path.startsWith('/') ? path.slice(1) : path;
      modelDocs.set(norm, doc);
      modelDocs.set('/' + norm, doc);
    }
  }

  const rootDoc = modelDocs.get('3D/3dmodel.model');
  if (!rootDoc) throw new Error('No root 3dmodel.model found in 3MF archive');

  // 1b. Read the <model unit="..."> declaration. The 3MF spec defaults to
  // millimeter when the attribute is absent. Sub-model files may declare a
  // different unit; the spec requires it to match the root, so we read the
  // root only.
  const sourceUnit = parseSourceUnit(rootDoc.documentElement?.getAttribute('unit'));
  const unitToMeters = UNIT_TO_METERS[sourceUnit];

  // 2. Load filament colors from Bambu project settings
  let filamentColors: string[] = [];
  // Snapmaker U1 "mixed" (virtual) filaments, blended from two base filaments.
  let mixedDefsRaw = '';
  try {
    const psFile = zip.file('Metadata/project_settings.config');
    if (psFile) {
      const json = JSON.parse(await psFile.async('text'));
      if (Array.isArray(json.filament_colour)) {
        filamentColors = json.filament_colour.map((c: string) => normalizeHex(c));
      }
      if (typeof json.mixed_filament_definitions === 'string') {
        mixedDefsRaw = json.mixed_filament_definitions;
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
      const msDoc = parseXml(msXml);

      // Parse object metadata
      const objects = msDoc.getElementsByTagName('object');
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const id = obj.getAttribute('id') || '';
        let name = '';
        let extruder = 1;
        const parts: PartMeta[] = [];

        for (let j = 0; j < obj.children.length; j++) {
          const el = obj.children[j];
          if (el.tagName === 'metadata') {
            if (el.getAttribute('key') === 'name') name = el.getAttribute('value') || '';
            if (el.getAttribute('key') === 'extruder') extruder = parseInt(el.getAttribute('value') || '1', 10);
          }
          if (el.tagName === 'part') {
            const partId = el.getAttribute('id') || '';
            const subtype = el.getAttribute('subtype') || 'normal_part';
            let partExtruder = 0; // 0 = unassigned, resolved against objExtruder later
            const partMetas = el.getElementsByTagName('metadata');
            for (let k = 0; k < partMetas.length; k++) {
              if (partMetas[k].getAttribute('key') === 'extruder') {
                partExtruder = parseInt(partMetas[k].getAttribute('value') || '0', 10);
              }
            }
            parts.push({ id: partId, extruder: partExtruder, subtype });
          }
        }

        objectMeta.set(id, { name, extruder, parts });
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
      const gcodeDoc = parseXml(gcodeXml);
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
      const parts = meta?.parts ?? [];

      for (let ci = 0; ci < components.length; ci++) {
        const comp = components[ci];
        const compPath = comp.getAttributeNS(pNs, 'path') || comp.getAttribute('p:path') || '';
        const compObjId = parseInt(comp.getAttribute('objectid') || '0', 10);

        // Bambu's <part> list mirrors this object's <component> list one to one,
        // so the ci-th part describes the ci-th component. Matching by part id
        // instead collapses repeated instances of the same mesh onto whichever
        // extruder was listed last. See azerbaijan.3mf (Generic-Cube x3).
        // Fall back to id lookup only when the two lists disagree in length.
        const part = parts.length === components.length
          ? parts[ci]
          : parts.find((p) => p.id === String(compObjId));

        // Skip negative/modifier parts (boolean cutters, not visible geometry)
        if (part?.subtype === 'negative_part' || part?.subtype === 'modifier_part') continue;

        const compTStr = comp.getAttribute('transform');
        const compTransform = compTStr ? parseTransform(compTStr) : null;
        const finalTransform = combineTransforms(buildTransform, compTransform);

        // Bambu encodes "unassigned, inherit from object default" as extruder=0
        // (e.g. Generic-Cube anchor parts on Image-to-Keychain templates).
        // We must NOT pass 0 through — it produces filamentIndex=0 chunks that
        // render gray and are skipped by the reactive recolor pass. See Turkey.3mf.
        const rawPartExt = part?.extruder;
        const partExtruder = rawPartExt && rawPartExt > 0 ? rawPartExt : objExtruder;

        const normalizedPath = compPath.startsWith('/') ? compPath.slice(1) : compPath;
        const subDoc = compPath ? modelDocs.get(normalizedPath) : rootDoc;

        if (subDoc) {
          const subNs = subDoc.documentElement.namespaceURI || '';
          const mesh = extractMesh(subDoc, compObjId, subNs);
          if (mesh) {
            const newChunks = buildChunksFromMesh(mesh, finalTransform, objName, partExtruder, unitToMeters);
            chunks.push(...newChunks);
          }
        }
      }
    } else {
      // Direct mesh on root object
      const mesh = extractMesh(rootDoc, objId, ns);
      if (mesh) {
        const newChunks = buildChunksFromMesh(mesh, buildTransform, objName, objExtruder, unitToMeters);
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

  // 5b. Append Snapmaker U1 "mixed" filaments. Each is a virtual extruder
  // (index = baseCount + N) whose color is a derived blend of two base
  // filaments. The paint_color decoder already resolves these high extruder
  // indices; without these slots they'd render gray (glbBuilder fallback).
  if (filamentColors.length > 0 && mixedDefsRaw) {
    for (const def of parseMixedFilamentDefs(mixedDefsRaw, filamentColors.length)) {
      const cA = filamentColors[def.sources[0] - 1];
      const cB = filamentColors[def.sources[1] - 1];
      if (!cA || !cB) continue;
      const blended = mixFilamentHex(cA, cB, def.ratioA);
      filaments.push({
        index: def.index,
        originalColor: blended,
        currentColor: blended,
        mix: { sources: def.sources, ratioA: def.ratioA },
      });
    }
  }

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
          // Blob + URL.createObjectURL are browser-only. In Node CLI runs we
          // simply skip the thumbnail rather than crash the parser.
          if (thumbFile && typeof Blob !== 'undefined' && typeof URL?.createObjectURL === 'function') {
            const blob = await thumbFile.async('blob');
            thumbnailUrl = URL.createObjectURL(blob);
          }
        } catch { /* no thumb */ }
      }

      const filamentIndicesUsed = [...new Set(meshChunks.map(c => c.filamentIndex))].sort((a, b) => a - b);

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
      filamentIndicesUsed: [...new Set(allChunks.map(c => c.filamentIndex))].sort((a, b) => a - b),
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

  return { plates: nonEmptyPlates, filaments, sourceUnit, unitToMeters };
}

// ---- Helpers ----

function parseSourceUnit(raw: string | null | undefined): SourceUnit {
  // 3MF spec: the <model unit> attribute is optional and defaults to
  // millimeter. Legal values are micron / millimeter / centimeter / inch /
  // foot / meter. Anything else falls back to millimeter so an
  // out-of-spec file still renders.
  if (!raw) return 'millimeter';
  const v = raw.trim().toLowerCase();
  if (v === 'micron' || v === 'millimeter' || v === 'centimeter' || v === 'inch' || v === 'foot' || v === 'meter') {
    return v;
  }
  return 'millimeter';
}

function normalizeHex(color: string): string {
  if (!color.startsWith('#')) color = '#' + color;
  if (color.length > 7) color = color.slice(0, 7);
  return color.toUpperCase();
}

interface MixedFilamentDef {
  index: number;             // resolved 1-based extruder index (baseCount + ordinal)
  sources: [number, number]; // 1-based base filament indices (A, B)
  ratioA: number;            // fraction of source A in [0, 1]
}

/**
 * Parse Snapmaker U1's `mixed_filament_definitions` string (Full Spectrum).
 * Each `;`-delimited entry is a comma list. Modern dialect (15+ fields):
 *   `compA, compB, enabled, custom, mix_b_percent, pointillism, g<ids>, w<wts>,
 *    m<mode>, z<N>, xa<off>, xb<off>, d<deleted>, o<origin>, u<stableId>
 *    [, cm<N>] [, r<k>/<wA>/<wB>]`
 * Legacy dialect: `compA, compB, enabled, mix_b_percent` (4 fields).
 *   - fields[0], fields[1] = source base filament indices A, B (1-based)
 *   - fields[2]            = enabled (0/1)
 *   - mix_b_percent        = fields[4] (modern) / fields[3] (legacy) — the share
 *                            of component B; ratioA = (100 - mix_b) / 100
 *   - `d1` token           = deleted (tombstone)
 *   - `r<k>/<wA>/<wB>`      = explicit A/B weights, overrides mix_b_percent
 *                            (ratioA = wA / (wA + wB)); `cm<N>` is ignorable
 *   - `u<N>` field         = the slicer's stable label, NOT the slot index
 *
 * CRITICAL — virtual extruder indices count enabled + non-deleted rows ONLY.
 * The slicer's `mixed_index_from_filament_id` does `if (!enabled || deleted)
 * continue`, so disabled/deleted tombstones consume no index. The k-th
 * *surviving* row (0-based `ordinal`) becomes extruder `baseCount + ordinal + 1`.
 * The sea sample has 6 disabled tombstones FIRST; enumerating over all rows
 * (the old bug) shifts every painted state (11..15 = ~84k faces) onto the wrong
 * recipe. Rows with invalid components (a===b or outside 1..baseCount) are
 * likewise rejected and consume no index.
 */
function parseMixedFilamentDefs(raw: string, baseCount: number): MixedFilamentDef[] {
  const defs: MixedFilamentDef[] = [];
  let ordinal = 0; // counts only rows that receive a virtual extruder id
  for (const entry of raw.split(';')) {
    if (!entry.trim()) continue;
    const fields = entry.split(',').map((f) => f.trim());
    if (fields.length < 4) continue;

    const a = parseInt(fields[0], 10);
    const b = parseInt(fields[1], 10);
    const enabled = parseInt(fields[2], 10);
    const deleted = fields.some((f) => /^d1$/i.test(f));

    // Skip rows the slicer would not assign a virtual id to.
    if (enabled === 0 || deleted) continue;
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    if (a === b || a < 1 || a > baseCount || b < 1 || b > baseCount) continue;

    // mix_b_percent lives at field[4] in the modern dialect, field[3] in the
    // legacy 4-field one. It is the share of component B.
    let mixB = parseFloat(fields.length === 4 ? fields[3] : fields[4]);
    if (!Number.isFinite(mixB)) mixB = 50;
    mixB = Math.min(100, Math.max(0, mixB));
    let ratioA = (100 - mixB) / 100;

    // An `r<k>/<wA>/<wB>` token overrides the percentage with explicit weights.
    const rTok = fields.find((f) => /^r\d+\/[\d.]+\/[\d.]+$/i.test(f));
    if (rTok) {
      const parts = rTok.split('/');
      const wA = parseFloat(parts[1]);
      const wB = parseFloat(parts[2]);
      if (Number.isFinite(wA) && Number.isFinite(wB) && wA + wB > 0) {
        ratioA = wA / (wA + wB);
      }
    }

    defs.push({ index: baseCount + ordinal + 1, sources: [a, b], ratioA });
    ordinal++;
  }
  return defs;
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
  unitToMeters: number,
): MeshChunk[] {
  // Check for Bambu paint_color data (per-face extruder painting)
  if (mesh.hasPaintData) {
    return buildChunksFromPaintData(mesh, transform, name, defaultExtruder, unitToMeters);
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
 * Split a painted mesh into chunks by subdividing every painted triangle down
 * to its paint_color leaves, then grouping the resulting sub-triangles by
 * extruder.
 *
 * Earlier versions collapsed each source triangle to a single extruder by
 * plurality vote over its tree. That silently erased paint on coarse meshes:
 * colortest.3mf paints two patches covering ~6% and ~4% of two cube-face
 * triangles, so inherit always won the vote and the cube rendered a single
 * color. The vote also could not place a boundary anywhere except on an
 * original mesh edge, which is what produced the kuwait.3mf seams. Exact
 * subdivision removes both failure modes: a leaf's geometry IS its color zone.
 *
 * By default the paint tree is decoded EXACTLY: every leaf becomes its own zone
 * (slicer-identical). Only when the exact face count would overflow
 * PAINT_FACE_BUDGET does subdivision stop early, collapsing any sub-triangle
 * whose longest edge falls under the (then-raised) cutoff to its area-dominant
 * state. See PAINT_MIN_FEATURE_FRACTION and the cutoff selection above.
 */
function buildChunksFromPaintData(
  mesh: ParsedMeshData,
  transform: number[] | null,
  name: string,
  defaultExtruder: number,
  unitToMeters: number,
): MeshChunk[] {
  // Raw leaf state -> flat vertex index triples. Flat number[] rather than
  // objects because painted files reach ~100k source triangles (kuwait, sea)
  // and each can expand into dozens of leaves.
  const byState = new Map<number, number[]>();
  // Shared across the whole mesh so a midpoint on an edge two trees have in
  // common resolves to one vertex, keeping neighboring leaves watertight.
  const midCache = new Map<number, number>();

  // Subdivision cutoff, in the mesh's own (pre-transform) units so it is applied
  // before any midpoints are appended. The fraction of the bbox diagonal governs
  // small models; the absolute floor keeps ~0.4 mm paint detail on large ones
  // (see PAINT_MIN_FEATURE_ABS_MM). The absolute value is converted from final
  // printed mm back to mesh-local units: divide by the source-unit scale and by
  // the build/component transform scale so it means the same physical size.
  const relCutoff = PAINT_MIN_FEATURE_FRACTION * bboxDiagonal(mesh.vertices);
  const absCutoff =
    (PAINT_MIN_FEATURE_ABS_MM / 1000) / unitToMeters / transformScaleFactor(transform);
  let minFeature = Math.min(relCutoff, absCutoff);

  // Layer 0 (preferred): decode the paint tree EXACTLY. minFeature=0 disables the
  // size collapse, so every leaf becomes its own zone, geometrically identical to
  // what the slicer paints. The physical cutoff layers (rel/abs) only exist to
  // coarsen models whose exact decode would overflow PAINT_FACE_BUDGET. When the
  // exact count fits the budget, use it: the "2 белых масштаб 95" body decodes to
  // 1.08M pre-repair faces (< 1.5M) yet the 0.4 mm floor was quantizing its
  // 1-3 mm paint dots into ~0.4 mm area-dominant steps (15-40% of a dot),
  // producing the confetti the slicer never shows.
  //
  // Only when the exact decode overflows do we fall back to the seeded floor and
  // double the cutoff until the estimate fits. Owl's exact decode is 18.7M, far
  // over budget, so it takes this path and its output is unchanged. The estimate
  // mirrors decode+subdivide exactly, so it equals the pre-repair face count, and
  // it bails early once it exceeds the budget (the over-budget probe never walks
  // the whole 18.7M tree).
  if (mesh.triangles.some((t) => t.paintColor.length > 0)) {
    const exact = estimatePaintFaces(mesh.triangles, mesh.vertices, 0, PAINT_FACE_BUDGET);
    if (exact <= PAINT_FACE_BUDGET) {
      minFeature = 0;
    } else {
      for (let d = 0; d < PAINT_BUDGET_MAX_DOUBLINGS; d++) {
        const est = estimatePaintFaces(mesh.triangles, mesh.vertices, minFeature, PAINT_FACE_BUDGET);
        if (est <= PAINT_FACE_BUDGET) break;
        minFeature *= 2;
      }
    }
  }

  for (const tri of mesh.triangles) {
    const tree = tri.paintColor ? decodePaintTree(tri.paintColor) : null;
    if (!tree) {
      pushFace(byState, 0, tri.v1, tri.v2, tri.v3);
      continue;
    }
    subdividePaintedTriangle(tri.v1, tri.v2, tri.v3, tree, mesh.vertices, midCache, byState, minFeature);
  }

  // Each source triangle was subdivided independently, so a triangle that split
  // a shared edge can leave a hanging midpoint on a neighbor that did not (an
  // unpainted neighbor, or one collapsed by uniform/minFeature, or one split on
  // different sides). That T-junction is a real hole in both the GLB and OBJ.
  // Conform every triangle to the midpoints its neighbors introduced.
  repairTJunctions(byState, midCache);

  // Leaf state 0 means "inherit", which resolves to the part/object extruder.
  const byExtruder = new Map<number, number[]>();
  for (const [state, indices] of byState) {
    const extruder = state > 0 ? state : defaultExtruder;
    const existing = byExtruder.get(extruder);
    if (!existing) {
      byExtruder.set(extruder, indices);
      continue;
    }
    // Element-wise: spreading a 100k+ element array into push() overflows the
    // argument stack.
    for (const idx of indices) existing.push(idx);
  }

  const chunks: MeshChunk[] = [];
  for (const [extruder, indices] of byExtruder) {
    const chunk = buildMeshChunkFromIndices(mesh.vertices, indices, transform, name, extruder);
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function pushFace(groups: Map<number, number[]>, state: number, a: number, b: number, c: number): void {
  let list = groups.get(state);
  if (!list) {
    list = [];
    groups.set(state, list);
  }
  list.push(a, b, c);
}

/**
 * Seed for the subdivision cutoff USED ONLY WHEN the exact decode overflows the
 * face budget. By default (exact decode fits PAINT_FACE_BUDGET) the cutoff is 0,
 * i.e. no early stop: every leaf is its own zone, geometrically identical to the
 * slicer. This constant, PAINT_MIN_FEATURE_ABS_MM, and the doubling loop only
 * govern the fallback path for meshes whose exact decode is too large.
 *
 * When that fallback triggers, the cutoff is three layers, smallest wins, then a
 * face budget on top:
 *
 * 1. FRACTION of the bbox diagonal (this constant): right near 100 mm, where
 *    0.4% is ~0.4 mm (one nozzle width). It governs small models, where scaling
 *    below one edge avoids pointless subdivision.
 * 2. PAINT_MIN_FEATURE_ABS_MM absolute floor: the FRACTION alone scales up on a
 *    large model and erases printable paint, so the floor keeps ~0.4 mm detail
 *    regardless of model size. (Historical note: an EARLIER design applied this
 *    floor unconditionally. On "2 белых масштаб 95.3mf" the 0.4 mm floor
 *    quantized the body's 1-3 mm slicer paint dots into ~0.4 mm area-dominant
 *    steps: visible triangle confetti. Since that file's exact decode is 1.08M
 *    faces < budget, it now decodes exactly and the floor never touches it. The
 *    floor still protects large models that DO overflow.)
 * 3. PAINT_FACE_BUDGET: even a correct physical floor cannot bound output. A
 *    densely painted mesh with a large build-item scale keeps every triangle
 *    above the floor and expands them all: watchful-owl (3.33x build scale, 896k
 *    triangles painted with deep trees) decodes to 18.7M faces, far over budget.
 *    The binding constraint is emitted face count, so the seed cutoff is doubled
 *    until an exact prepass estimate (estimatePaintFaces) fits the budget. Owl
 *    settles at ~1.0M / ~30 s; any future overflowing model is bounded whatever
 *    its scale, units, or density.
 *
 * Measured exact-decode face counts (all fit the budget except owl, which takes
 * the fallback): "2 белых масштаб 95" body 1.08M, owl 18.74M (-> ~1.0M fallback),
 * hijri-calendar 1.12M, kuwait 0.17M, sea 0.24M.
 */
const PAINT_MIN_FEATURE_FRACTION = 0.004;

/**
 * Absolute floor for the FALLBACK subdivision cutoff, in FINAL printed
 * millimeters (one nozzle width). Caps PAINT_MIN_FEATURE_FRACTION so paint
 * detail down to ~0.4 mm survives on large models that overflow the budget and
 * take the fallback path. Converted to mesh-local units per call (accounting for
 * the source unit and the build/component transform scale). Not applied when the
 * exact decode fits PAINT_FACE_BUDGET.
 */
const PAINT_MIN_FEATURE_ABS_MM = 0.4;

/**
 * Per-mesh ceiling on the PRE-repair face count of paint subdivision, and the
 * switch between exact decode and the fallback cutoff: if the exact decode fits
 * this bound the mesh is decoded exactly, otherwise the cutoff doubles until the
 * estimate fits. Both owl (~1.0M fallback) and the "2 белых масштаб 95" body
 * (1.08M exact) load and export in-browser; repairTJunctions then adds ~10-12%,
 * within the in-browser envelope.
 */
const PAINT_FACE_BUDGET = 1_500_000;

/**
 * Cap on cutoff doublings (256x the base). If the estimate still overflows after
 * this many, the source triangle count itself is near the budget and there is no
 * more geometry to shed; take the last cutoff as best effort.
 */
const PAINT_BUDGET_MAX_DOUBLINGS = 8;

/** Determinant of a 12-float column-major affine's 3x3 part. */
function affineDeterminant(m: number[]): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[3] * (m[1] * m[8] - m[2] * m[7]) +
    m[6] * (m[1] * m[5] - m[2] * m[4])
  );
}

/** Uniform scale of a 12-float column-major affine's 3x3 part: cbrt(|det|). */
function transformScaleFactor(m: number[] | null): number {
  if (!m || m.length < 9) return 1;
  const scale = Math.cbrt(Math.abs(affineDeterminant(m)));
  return Number.isFinite(scale) && scale > 1e-9 ? scale : 1;
}

/**
 * True when the transform reflects (negative determinant), which reverses the
 * winding of every triangle it maps.
 *
 * Bambu writes `Right click > Mirror > Along X/Y/Z axis` exactly this way: a
 * negative scale column in the build item's transform, e.g.
 * `transform="1 0 0 0 1 0 0 0 -1 ..."`. Rendering is THREE.FrontSide
 * (glbBuilder), so an uncorrected mirrored object culls its outward faces and
 * draws its far interior instead: the model reads as hollow or translucent.
 * The emitter below compensates by swapping two corners per face.
 *
 * See issue #9, and `samples/展翅鹦鹉【项目】U1.3mf` plate 2 object 9 (`加高.stl`,
 * det = -1), which carries this in-repo.
 */
function transformReversesWinding(m: number[] | null): boolean {
  return !!m && m.length >= 9 && affineDeterminant(m) < 0;
}

/**
 * Stride for the midpoint cache key. Vertex indices are packed as
 * `lo * MID_KEY_STRIDE + hi`, exact in a float64 for up to ~67M vertices per
 * mesh, far beyond anything a slicer emits.
 */
const MID_KEY_STRIDE = 1 << 26;

function bboxDiagonal(vertices: VertexData[]): number {
  if (vertices.length === 0) return 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

/** Squared length of the longest edge of triangle (a, b, c). */
function maxEdgeLengthSq(vertices: VertexData[], a: number, b: number, c: number): number {
  const va = vertices[a], vb = vertices[b], vc = vertices[c];
  if (!va || !vb || !vc) return 0;
  const d = (p: VertexData, q: VertexData) => {
    const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    return dx * dx + dy * dy + dz * dz;
  };
  return Math.max(d(va, vb), d(vb, vc), d(vc, va));
}

/**
 * Area-weighted dominant state of a subtree, used when a sub-triangle falls
 * below the size cutoff and must be painted a single color.
 *
 * Child area fractions follow directly from the split geometry: a 1-split
 * halves the triangle; a 2-split yields quarter, quarter, half; a 3-split
 * yields four quarters. Inherit (state 0) competes on equal footing, which is
 * what exact geometry would do. This is not the old plurality vote: that
 * counted children rather than area, and applied to WHOLE source triangles,
 * which is what bled paint across kuwait.3mf's boundaries. Here it only ever
 * decides the color of a triangle already too small to print.
 */
const SPLIT_AREA_WEIGHTS: readonly number[][] = [
  [],
  [0.5, 0.5],
  [0.25, 0.25, 0.5],
  [0.25, 0.25, 0.25, 0.25],
];

function dominantState(node: PaintTreeNode): number {
  if (node.uniform !== null) return node.uniform;

  const areas = new Map<number, number>();
  const walk = (n: PaintTreeNode, weight: number): void => {
    if (n.uniform !== null || !n.children) {
      const s = n.uniform ?? n.state;
      areas.set(s, (areas.get(s) ?? 0) + weight);
      return;
    }
    const weights = SPLIT_AREA_WEIGHTS[n.splitSides];
    for (let i = 0; i < n.children.length; i++) {
      walk(n.children[i], weight * weights[i]);
    }
  };
  walk(node, 1);

  let best = 0;
  let bestArea = -1;
  for (const [state, area] of areas) {
    if (area > bestArea) {
      best = state;
      bestArea = area;
    }
  }
  return best;
}

/** Symmetric cache key for the edge (a, b). */
function midKey(a: number, b: number): number {
  return a < b ? a * MID_KEY_STRIDE + b : b * MID_KEY_STRIDE + a;
}

/** Exact edge midpoint, allocated once per edge (upstream: 0.5 * (a + b)). */
function midpointIndex(
  vertices: VertexData[],
  cache: Map<number, number>,
  a: number,
  b: number,
): number {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  const key = midKey(a, b);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const va = vertices[lo];
  const vb = vertices[hi];
  const index = vertices.length;
  vertices.push({ x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2, z: (va.z + vb.z) / 2 });
  cache.set(key, index);
  return index;
}

/**
 * Recursively subdivide one source triangle following its paint tree, emitting
 * leaf geometry grouped by state.
 *
 * The child layouts below are a direct transcription of
 * `TriangleSelector::perform_split` in BambuStudio/PrusaSlicer
 * (src/libslic3r/TriangleSelector.cpp). Upstream first rotates the triangle so
 * the special side leads (`for (j=0, idx = tr.special_side(); j<3; ++j, idx =
 * next_idx_modulo(idx, 3))`), then inserts edge midpoints at fixed positions.
 * Every child below preserves the source winding, which matters because
 * glbBuilder renders THREE.FrontSide.
 *
 * `walkPaintCount` is a count-only mirror of this function (fused with
 * `decodePaintNode`); any change to the child layouts, the size collapse, or the
 * uniform collapse here must be reflected there or the face-budget estimate drifts.
 */
function subdividePaintedTriangle(
  a: number,
  b: number,
  c: number,
  node: PaintTreeNode,
  vertices: VertexData[],
  midCache: Map<number, number>,
  out: Map<number, number[]>,
  minFeature: number,
): void {
  // Covers leaves and any subtree that resolves to a single state: the leaves
  // of a uniform subtree tile exactly this triangle, so emitting it whole is
  // lossless and keeps face counts sane on densely painted models.
  if (node.uniform !== null || !node.children) {
    pushFace(out, node.uniform ?? node.state, a, b, c);
    return;
  }

  // Below the printable-feature cutoff, stop splitting and take the subtree's
  // area-dominant color for the whole sub-triangle.
  if (minFeature > 0 && maxEdgeLengthSq(vertices, a, b, c) < minFeature * minFeature) {
    pushFace(out, dominantState(node), a, b, c);
    return;
  }

  // Rotate so the special side leads: V0 = t[k], V1 = t[k+1], V2 = t[k+2].
  const k = node.specialSide % 3;
  const src = [a, b, c];
  const v0 = src[k];
  const v1 = src[(k + 1) % 3];
  const v2 = src[(k + 2) % 3];
  const ch = node.children;

  if (node.splitSides === 1) {
    // Bisect the far edge. Children: (V0,V1,M12), (M12,V2,V0).
    const m12 = midpointIndex(vertices, midCache, v1, v2);
    subdividePaintedTriangle(v0, v1, m12, ch[0], vertices, midCache, out, minFeature);
    subdividePaintedTriangle(m12, v2, v0, ch[1], vertices, midCache, out, minFeature);
    return;
  }

  if (node.splitSides === 2) {
    // Edge V1-V2 is kept intact. Children: (V0,M01,M20), (M01,V1,M20), (V1,V2,M20).
    const m01 = midpointIndex(vertices, midCache, v0, v1);
    const m20 = midpointIndex(vertices, midCache, v2, v0);
    subdividePaintedTriangle(v0, m01, m20, ch[0], vertices, midCache, out, minFeature);
    subdividePaintedTriangle(m01, v1, m20, ch[1], vertices, midCache, out, minFeature);
    subdividePaintedTriangle(v1, v2, m20, ch[2], vertices, midCache, out, minFeature);
    return;
  }

  // Three splits: the classic 1-to-4 subdivision, center triangle last.
  const m01 = midpointIndex(vertices, midCache, v0, v1);
  const m12 = midpointIndex(vertices, midCache, v1, v2);
  const m20 = midpointIndex(vertices, midCache, v2, v0);
  subdividePaintedTriangle(v0, m01, m20, ch[0], vertices, midCache, out, minFeature);
  subdividePaintedTriangle(m01, v1, m12, ch[1], vertices, midCache, out, minFeature);
  subdividePaintedTriangle(m12, v2, m20, ch[2], vertices, midCache, out, minFeature);
  subdividePaintedTriangle(m01, m12, m20, ch[3], vertices, midCache, out, minFeature);
}

/**
 * Repair T-junctions left by independent per-triangle paint subdivision.
 *
 * `subdividePaintedTriangle` shares midpoints through `midCache`, so two
 * neighbors that both split their shared edge stay watertight. But a neighbor
 * that did NOT split that edge (unpainted, uniform-collapsed, dropped below the
 * minFeature cutoff, or split on a different side) keeps its full edge while the
 * other side gained a midpoint sitting in the middle of it: a hanging node that
 * survives any vertex weld as an open/non-manifold edge. That is exactly the
 * "unclosed triangles at color boundaries" a consumer sees in the OBJ/GLB.
 *
 * Every emitted triangle is conformed to the midpoints its neighbors created.
 * This only ever reuses vertices already in `midCache` (it introduces no new
 * midpoints), so a single pass is complete.
 */
function repairTJunctions(byState: Map<number, number[]>, midCache: Map<number, number>): void {
  if (midCache.size === 0) return;
  for (const [state, indices] of byState) {
    const out: number[] = [];
    let changed = false;
    for (let i = 0; i < indices.length; i += 3) {
      if (emitConforming(indices[i], indices[i + 1], indices[i + 2], midCache, out)) changed = true;
    }
    if (changed) byState.set(state, out);
  }
}

/**
 * Emit triangle (a, b, c) conformed to any midpoints on its edges (recursive
 * bisection). If edge (a, b) has a cached midpoint m, replace the triangle with
 * (a, m, c) and (m, b, c) and recurse into each: both children preserve the
 * source winding (load-bearing for FrontSide rendering), sub-edges are
 * re-checked so nested/multiple hanging nodes resolve, and no zero-area triangle
 * is ever produced (m is strictly interior to the edge). Returns whether the
 * triangle was split.
 *
 * A fan from a single apex would be wrong here: the fan triangle spanning a
 * midpoint on an apex-adjacent edge is collinear, so skipping degenerates would
 * silently drop that midpoint and leave the hole open.
 */
function emitConforming(
  a: number,
  b: number,
  c: number,
  midCache: Map<number, number>,
  out: number[],
): boolean {
  const mab = midCache.get(midKey(a, b));
  if (mab !== undefined) {
    emitConforming(a, mab, c, midCache, out);
    emitConforming(mab, b, c, midCache, out);
    return true;
  }
  const mbc = midCache.get(midKey(b, c));
  if (mbc !== undefined) {
    emitConforming(b, mbc, a, midCache, out);
    emitConforming(mbc, c, a, midCache, out);
    return true;
  }
  const mca = midCache.get(midKey(c, a));
  if (mca !== undefined) {
    emitConforming(c, mca, b, midCache, out);
    emitConforming(mca, a, b, midCache, out);
    return true;
  }
  out.push(a, b, c);
  return false;
}

/**
 * Decode a Bambu paint_color attribute into a subdivision tree.
 *
 * BambuStudio/PrusaSlicer TriangleSelector encoding:
 * - Hex string is read RIGHT-TO-LEFT (rightmost char = tree root)
 * - Each nibble: lower 2 bits = split_sides, upper 2 bits = state (leaf) or special_side (split)
 * - split_sides: 0=leaf, 1=2children, 2=3children, 3=4children
 * - Leaf states: 0=inherit, 1=Ext1, 2=Ext2, 3=extended (read next nibble, state = value+3)
 * - Extended overflow: if extension nibble is 0xF, accumulate +15 and read another
 *
 * Children are serialized in REVERSE order ("Serialized in reverse order for
 * compatibility with PrusaSlicer 2.3.1" in `serialize`; `deserialize` reads
 * them back with `child_idx = total_children - processed_children - 1`), so the
 * first subtree in the stream is the LAST child. Ignoring that order was
 * harmless while we only voted on states, but it scrambles paint once the
 * children carry distinct geometry.
 *
 * Returns null when the string is empty or malformed.
 */
function decodePaintTree(hex: string): PaintTreeNode | null {
  if (!hex) return null;
  // Read right-to-left: reverse once so the reader can walk forward.
  const reversed = hex.split('').reverse().join('');
  const reader = { pos: 0 };
  return decodePaintNode(reversed, reader);
}

function decodePaintNode(hex: string, reader: { pos: number }): PaintTreeNode {
  const leaf = (state: number): PaintTreeNode =>
    ({ splitSides: 0, specialSide: 0, state, children: null, uniform: state });

  if (reader.pos >= hex.length) return leaf(0);

  const nibble = parseInt(hex[reader.pos++], 16);
  if (isNaN(nibble)) return leaf(0);

  const splitSides = nibble & 3;
  const upper = (nibble >> 2) & 3;

  // Leaf node: no subdivision
  if (splitSides === 0) {
    if (upper < 3) return leaf(upper); // 0=inherit, 1=Ext1, 2=Ext2

    // Extended state (upper=3, nibble=0xC): read next nibble(s) for extruder 3+
    let extState = 0;
    while (reader.pos < hex.length) {
      const ext = parseInt(hex[reader.pos++], 16);
      if (isNaN(ext)) return leaf(0);
      if (ext === 0xF) {
        extState += 15; // overflow: accumulate and read next
      } else {
        extState += ext;
        break;
      }
    }
    return leaf(3 + extState);
  }

  // Split node: upper bits are the special side, which drives child geometry.
  const numChildren = splitSides + 1;
  const children: PaintTreeNode[] = new Array(numChildren);
  for (let i = numChildren - 1; i >= 0; i--) {
    children[i] = decodePaintNode(hex, reader);
  }

  let uniform: number | null = children[0].uniform;
  for (let i = 1; i < numChildren && uniform !== null; i++) {
    if (children[i].uniform !== uniform) uniform = null;
  }

  return { splitSides, specialSide: upper, state: 0, children, uniform };
}

/** Sentinel `lastUniform` for a subtree that is not a single state (decode's null). */
const PAINT_MIXED = -1;

interface PaintCountCtx {
  hex: string;         // raw paint_color of the current source triangle
  pos: number;         // index into hex, read RIGHT-to-left (decrementing)
  cutoffSq: number;    // minFeature^2; 0 disables the size collapse
  lastUniform: number; // uniform state of the node just walked, or PAINT_MIXED
}

/** Hex value 0..15 of a char code, or -1 if not a hex digit (mirrors parseInt(c,16)/isNaN). */
function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;   // 0-9
  if (code >= 97 && code <= 102) return code - 87;  // a-f
  if (code >= 65 && code <= 70) return code - 55;   // A-F
  return -1;
}

/**
 * Count-only mirror of `decodePaintNode` + `subdividePaintedTriangle` for one
 * source triangle. It returns exactly the number of faces
 * `subdividePaintedTriangle` would emit (pre-repair) at the same cutoff, without
 * building any geometry, so `estimatePaintFaces` can size the output before the
 * real pass runs. Keep it in lockstep with both of those functions: the child
 * layouts and reverse child order come from `subdividePaintedTriangle`; the
 * nibble format, extended states, and reverse serialization come from
 * `decodePaintNode`.
 *
 * Differences from the real pass, all count-neutral:
 * - Reads the hex RIGHT-to-left in place (decrementing `ctx.pos`) rather than
 *   reversing the string; `pos < 0` is the exhausted-stream case.
 * - Carries coordinates as scalars, not vertex indices; midpoints are `(a+b)/2`
 *   inline and nothing is appended to a vertex array.
 * - Fuses decode and subdivide into one walk. The stream must still be consumed
 *   in full even where subdivide would collapse (uniform, or below the cutoff),
 *   so children are ALWAYS walked; their counts are simply discarded on collapse.
 * - Reports a node's uniform state up through `ctx.lastUniform` (PAINT_MIXED when
 *   the subtree is not a single state), mirroring the `uniform` field decode
 *   computes. Uniformity is order independent, so folding children in stream
 *   order is fine.
 */
function walkPaintCount(
  ctx: PaintCountCtx,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  below: boolean,
): number {
  // One nibble, right-to-left. Exhausted or non-hex stream = leaf state 0.
  if (ctx.pos < 0) { ctx.lastUniform = 0; return 1; }
  const nibble = hexNibble(ctx.hex.charCodeAt(ctx.pos--));
  if (nibble < 0) { ctx.lastUniform = 0; return 1; }

  const splitSides = nibble & 3;
  const upper = (nibble >> 2) & 3;

  // Leaf node.
  if (splitSides === 0) {
    if (upper < 3) { ctx.lastUniform = upper; return 1; } // 0=inherit, 1=Ext1, 2=Ext2
    // Extended state (upper=3): consume nibbles until a non-0xF terminator. The
    // value never changes the count, but the exact state must feed lastUniform so
    // a parent's uniformity check matches decode, and every nibble must be read
    // to keep the stream aligned for the following siblings.
    let extState = 0;
    while (ctx.pos >= 0) {
      const ext = hexNibble(ctx.hex.charCodeAt(ctx.pos--));
      if (ext < 0) { ctx.lastUniform = 0; return 1; } // NaN in decode -> leaf(0)
      if (ext === 0xF) { extState += 15; continue; }  // overflow, keep reading
      extState += ext;
      break;
    }
    ctx.lastUniform = 3 + extState; // reached on break OR exhausted stream, per decode
    return 1;
  }

  // Split node. specialSide rotates which corner leads; rotation preserves edge
  // lengths, so the size check uses the incoming coords.
  let belowHere = below;
  if (!belowHere && ctx.cutoffSq > 0) {
    const ab = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
    const bc = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2;
    const ca = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2;
    const maxEdgeSq = ab > bc ? (ab > ca ? ab : ca) : (bc > ca ? bc : ca);
    if (maxEdgeSq < ctx.cutoffSq) belowHere = true;
  }

  let sum = 0;
  let ua = 0, ub = 0, uc = 0, ud = 0;

  if (belowHere) {
    // Geometry is irrelevant below the cutoff (below-cutoff is monotonic down the
    // tree); only consume the stream and learn each child's uniform state. Walk
    // exactly numChildren subtrees. Uniformity is symmetric, so the child->slot
    // mapping does not matter here.
    sum += walkPaintCount(ctx, ax, ay, az, bx, by, bz, cx, cy, cz, true); ua = ctx.lastUniform;
    sum += walkPaintCount(ctx, ax, ay, az, bx, by, bz, cx, cy, cz, true); ub = ctx.lastUniform;
    if (splitSides >= 2) { sum += walkPaintCount(ctx, ax, ay, az, bx, by, bz, cx, cy, cz, true); uc = ctx.lastUniform; }
    if (splitSides === 3) { sum += walkPaintCount(ctx, ax, ay, az, bx, by, bz, cx, cy, cz, true); ud = ctx.lastUniform; }
  } else {
    // Rotate so the special side leads: V0 = src[k], V1 = src[k+1], V2 = src[k+2].
    const k = upper % 3;
    let v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z;
    if (k === 0) {
      v0x = ax; v0y = ay; v0z = az; v1x = bx; v1y = by; v1z = bz; v2x = cx; v2y = cy; v2z = cz;
    } else if (k === 1) {
      v0x = bx; v0y = by; v0z = bz; v1x = cx; v1y = cy; v1z = cz; v2x = ax; v2y = ay; v2z = az;
    } else {
      v0x = cx; v0y = cy; v0z = cz; v1x = ax; v1y = ay; v1z = az; v2x = bx; v2y = by; v2z = bz;
    }

    // Children are serialized in REVERSE, so the j-th subtree read from the stream
    // is child index (numChildren-1-j). Walk in stream order (so consumption is
    // correct) while pairing each subtree to subdividePaintedTriangle's exact
    // child geometry.
    if (splitSides === 1) {
      // child0 = (V0,V1,M12), child1 = (M12,V2,V0). Stream: child1, child0.
      const m12x = (v1x + v2x) / 2, m12y = (v1y + v2y) / 2, m12z = (v1z + v2z) / 2;
      sum += walkPaintCount(ctx, m12x, m12y, m12z, v2x, v2y, v2z, v0x, v0y, v0z, false); ub = ctx.lastUniform;
      sum += walkPaintCount(ctx, v0x, v0y, v0z, v1x, v1y, v1z, m12x, m12y, m12z, false); ua = ctx.lastUniform;
    } else if (splitSides === 2) {
      // child0=(V0,M01,M20), child1=(M01,V1,M20), child2=(V1,V2,M20). Stream: 2,1,0.
      const m01x = (v0x + v1x) / 2, m01y = (v0y + v1y) / 2, m01z = (v0z + v1z) / 2;
      const m20x = (v2x + v0x) / 2, m20y = (v2y + v0y) / 2, m20z = (v2z + v0z) / 2;
      sum += walkPaintCount(ctx, v1x, v1y, v1z, v2x, v2y, v2z, m20x, m20y, m20z, false); uc = ctx.lastUniform;
      sum += walkPaintCount(ctx, m01x, m01y, m01z, v1x, v1y, v1z, m20x, m20y, m20z, false); ub = ctx.lastUniform;
      sum += walkPaintCount(ctx, v0x, v0y, v0z, m01x, m01y, m01z, m20x, m20y, m20z, false); ua = ctx.lastUniform;
    } else {
      // Classic 1-to-4, center last. Stream: 3,2,1,0.
      const m01x = (v0x + v1x) / 2, m01y = (v0y + v1y) / 2, m01z = (v0z + v1z) / 2;
      const m12x = (v1x + v2x) / 2, m12y = (v1y + v2y) / 2, m12z = (v1z + v2z) / 2;
      const m20x = (v2x + v0x) / 2, m20y = (v2y + v0y) / 2, m20z = (v2z + v0z) / 2;
      sum += walkPaintCount(ctx, m01x, m01y, m01z, m12x, m12y, m12z, m20x, m20y, m20z, false); ud = ctx.lastUniform;
      sum += walkPaintCount(ctx, m12x, m12y, m12z, v2x, v2y, v2z, m20x, m20y, m20z, false); uc = ctx.lastUniform;
      sum += walkPaintCount(ctx, m01x, m01y, m01z, v1x, v1y, v1z, m12x, m12y, m12z, false); ub = ctx.lastUniform;
      sum += walkPaintCount(ctx, v0x, v0y, v0z, m01x, m01y, m01z, m20x, m20y, m20z, false); ua = ctx.lastUniform;
    }
  }

  // Combine in subdivide's precedence: uniform collapse first, then size collapse.
  // The subtree is uniform iff every child is the same non-mixed state.
  let allSame = ua !== PAINT_MIXED && ua === ub;
  if (allSame && splitSides >= 2 && ua !== uc) allSame = false;
  if (allSame && splitSides === 3 && ua !== ud) allSame = false;
  if (allSame) { ctx.lastUniform = ua; return 1; }
  ctx.lastUniform = PAINT_MIXED;
  if (belowHere) return 1;
  return sum;
}

/**
 * Exact face-count estimate for the paint subdivision of a mesh at `cutoff`,
 * without building geometry. Equals the faces `buildChunksFromPaintData` emits
 * before `repairTJunctions`. Bails as soon as the running total passes
 * `bailAbove`, so rejecting an over-budget cutoff is cheap.
 */
function estimatePaintFaces(
  triangles: TriangleParsed[],
  vertices: VertexData[],
  cutoff: number,
  bailAbove: number,
): number {
  const ctx: PaintCountCtx = { hex: '', pos: 0, cutoffSq: cutoff * cutoff, lastUniform: 0 };
  let total = 0;
  for (const tri of triangles) {
    if (!tri.paintColor) { total += 1; continue; } // unpainted -> one face
    const va = vertices[tri.v1];
    const vb = vertices[tri.v2];
    const vc = vertices[tri.v3];
    if (!va || !vb || !vc) { total += 1; continue; } // malformed -> collapses to one
    ctx.hex = tri.paintColor;
    ctx.pos = tri.paintColor.length - 1;
    total += walkPaintCount(
      ctx,
      va.x, va.y, va.z,
      vb.x, vb.y, vb.z,
      vc.x, vc.y, vc.z,
      false,
    );
    if (total > bailAbove) return total;
  }
  return total;
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

      // Bambu paint_color: per-face extruder painting, decoded lazily so the
      // subdivision pass can read the tree geometry, not just a summary state.
      const paintColor = t.getAttribute('paint_color') || '';
      if (paintColor.length > 0) hasPaintData = true;

      triangles.push({
        v1: parseInt(t.getAttribute('v1') || '0', 10),
        v2: parseInt(t.getAttribute('v2') || '0', 10),
        v3: parseInt(t.getAttribute('v3') || '0', 10),
        pid,
        p1: parseInt(t.getAttribute('p1') || '0', 10),
        paintColor,
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
  const indices = new Array<number>(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    const tri = triangles[i];
    indices[i * 3] = tri.v1;
    indices[i * 3 + 1] = tri.v2;
    indices[i * 3 + 2] = tri.v3;
  }
  return buildMeshChunkFromIndices(vertices, indices, transform, name, filamentIndex);
}

/** Build one chunk from a flat list of vertex-index triples. */
function buildMeshChunkFromIndices(
  vertices: VertexData[],
  indices: number[],
  transform: number[] | null,
  name: string,
  filamentIndex: number,
): MeshChunk | null {
  if (indices.length === 0) return null;

  const faceCount = indices.length / 3;
  const positions = new Float32Array(faceCount * 9);
  const normals = new Float32Array(faceCount * 9);

  // A reflecting transform reverses winding, so swap the last two corners to
  // put the face back to CCW-outward. This is the single emit point for both
  // the paint-subdivision path and the pid/basematerials path, so it covers
  // every coloring mode. The face normal below is derived from the order we
  // emit here, so it turns outward with no extra work.
  const flip = transformReversesWinding(transform);

  for (let fi = 0; fi < faceCount; fi++) {
    const vA = vertices[indices[fi * 3]];
    const vB = vertices[indices[fi * 3 + (flip ? 2 : 1)]];
    const vC = vertices[indices[fi * 3 + (flip ? 1 : 2)]];
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
 *
 * This does not introduce T-junctions: an edge only crosses cutZ when both of
 * its incident faces do, so both get clipped at the same plane. The two sides
 * can compute the crossing point in a different float order (the lerp direction
 * follows which vertex is the lone one), so the coordinates may differ in the
 * last bits, but the OBJ writer's 4-decimal quantization welds them.
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

  // Identify the lone vertex (the one on its own side). `other1` must be the
  // lone vertex's CYCLIC SUCCESSOR and `other2` its predecessor, or the
  // triangles emitted below come out reverse-wound, which back-face culling
  // (FrontSide) then drops. The p1 case used to list the predecessor first,
  // which silently inverted every triangle of every clipped band whose lone
  // vertex happened to be p1.
  let lone: Vec3, other1: Vec3, other2: Vec3;
  let loneIsAbove: boolean;

  if (numAbove === 1) {
    loneIsAbove = true;
    if (a0) { lone = p0; other1 = p1; other2 = p2; }
    else if (a1) { lone = p1; other1 = p2; other2 = p0; }
    else { lone = p2; other1 = p0; other2 = p1; }
  } else {
    // numAbove === 2, lone is below
    loneIsAbove = false;
    if (!a0) { lone = p0; other1 = p1; other2 = p2; }
    else if (!a1) { lone = p1; other1 = p2; other2 = p0; }
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
