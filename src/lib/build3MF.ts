import JSZip from 'jszip';
import type { FilamentRecolorMap } from './recolor.js';

/**
 * Re-emit a recolored 3MF from the *original* archive buffer.
 *
 * Scope (deliberate):
 *
 *   We re-tint filament slots, not zones. The user picks new colors for
 *   filament 1, 2, 3, ... and we rewrite ONLY the small handful of fields
 *   that describe what those filament slots look like:
 *
 *   - `Metadata/project_settings.config` (Bambu / Orca / U1 family):
 *       filament_colour, filament_multi_colour, default_filament_colour.
 *   - `<basematerials><base displaycolor="..."/>` in any .model file (the
 *       standard 3MF path used by non-Bambu writers).
 *
 *   We deliberately leave geometry, `paint_color` subdivision trees,
 *   `model_settings.config`, `custom_gcode_per_layer.xml`, and slicer
 *   settings untouched. This is what makes the output a drop-in for
 *   OrcaSlicer / Snapmaker U1: every zone keeps the same filament
 *   assignment, every painted tree keeps the same vote, only the
 *   per-slot color shifts.
 *
 *   Re-painting zones (changing which extruder owns which face) is
 *   intentionally NOT in scope here. That would require emitting a new
 *   subdivision tree per modified triangle, which our current parser
 *   does not capture (the decoder voting flattens sub-triangle detail).
 *   That's tracked separately.
 *
 * The output is a fresh ZIP. JSZip's default DEFLATE settings are stable
 * across versions, so two consecutive write-backs of an unchanged input
 * produce identical bytes apart from the in-file modification dates.
 */
export async function exportRecolored3MF(
  originalBuffer: ArrayBuffer | Uint8Array,
  mapping: FilamentRecolorMap,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(originalBuffer);

  const psFile = zip.file('Metadata/project_settings.config');
  if (psFile) {
    const text = await psFile.async('text');
    const updated = rewriteProjectSettings(text, mapping);
    zip.file('Metadata/project_settings.config', updated);
  }

  // Rewrite basematerials displaycolor on every .model file. We treat the
  // basematerials order as the filament order — that is the convention the
  // standard 3MF Materials Extension follows and what the parser assumes when
  // it builds filament slots from a non-Bambu file.
  for (const [path, file] of Object.entries(zip.files)) {
    if (!path.toLowerCase().endsWith('.model') || file.dir) continue;
    const xml = await file.async('text');
    const rewritten = rewriteBaseMaterials(xml, mapping);
    if (rewritten !== xml) zip.file(path, rewritten);
  }

  const out = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
  });
  return out;
}

// ---------------------------------------------------------------------------

function rewriteProjectSettings(text: string, mapping: FilamentRecolorMap): string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return text;
  }
  if (!json || typeof json !== 'object') return text;
  const obj = json as Record<string, unknown>;

  for (const key of ['filament_colour', 'filament_multi_colour', 'default_filament_colour']) {
    const arr = obj[key];
    if (!Array.isArray(arr)) continue;
    obj[key] = arr.map((existing, i) => {
      const replacement = mapping[i + 1];
      if (!replacement) return existing;
      return existing && typeof existing === 'string' && existing.length === 9
        ? toEightHex(replacement, existing)
        : replacement.toUpperCase();
    });
  }

  return JSON.stringify(obj, null, 2);
}

const BASE_TAG_RE = /<base\b[^>]*\bdisplaycolor="([^"]+)"[^>]*\/>/g;

function rewriteBaseMaterials(xml: string, mapping: FilamentRecolorMap): string {
  // We track basematerials position globally across the file (every <base>
  // element on the parser's side is a basematerial row; the Nth one maps to
  // filament N).
  let index = 0;
  return xml.replace(BASE_TAG_RE, (whole, oldColor: string) => {
    index += 1;
    const replacement = mapping[index];
    if (!replacement) return whole;
    const newColor = oldColor.length === 9 ? toEightHex(replacement, oldColor) : replacement.toUpperCase();
    return whole.replace(`displaycolor="${oldColor}"`, `displaycolor="${newColor}"`);
  });
}

/** Preserve the alpha channel of an #RRGGBBAA color when overwriting with a new #RRGGBB. */
function toEightHex(newHex: string, oldHex: string): string {
  const alpha = oldHex.slice(7, 9);
  const rgb = newHex.startsWith('#') ? newHex.slice(1, 7) : newHex.slice(0, 6);
  return `#${rgb.toUpperCase()}${alpha.toUpperCase()}`;
}
