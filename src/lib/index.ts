// Public API for the @3mf-to-glb/core library.
//
// This file is the supported import surface. Internal modules under src/lib/
// can change between releases; this re-export list is what we promise to keep
// stable.

export { parse3MF } from './parse3MF.js';
export { buildSceneFromPlate } from './glbBuilder.js';
export { buildGLBBytes } from './glbExporter.js';
export { buildUSDZBytes } from './usdzExporter.js';
export { exportRecolored3MF } from './build3MF.js';
export {
  srgbToLinear,
  linearToSrgb,
  hexToLinearRGBA,
  linearToHex,
  hexToRgb,
} from './colorConvert.js';
export { applyRecolor, parseRecolorArg } from './recolor.js';
export type { FilamentRecolorMap } from './recolor.js';
export {
  setDefaultDomParser,
  getDefaultDomParser,
  parseXml,
} from './parseXml.js';
export type { DomParserLike } from './parseXml.js';

export type {
  FilamentSlot,
  MeshChunk,
  Plate,
  ParseResult,
  Dimensions,
  SourceUnit,
  PivotMode,
} from '../types/index.js';
export { UNIT_TO_METERS } from '../types/index.js';
export type { BuildSceneOptions, BuiltSceneUserData } from './glbBuilder.js';
export { EXPORT_UP_AXIS } from './glbBuilder.js';
export type { GLBAssetExtras } from './glbExporter.js';

import { parse3MF } from './parse3MF.js';
import { buildSceneFromPlate } from './glbBuilder.js';
import { buildGLBBytes } from './glbExporter.js';
import { applyRecolor } from './recolor.js';
import type { FilamentRecolorMap } from './recolor.js';

export interface ConvertToGLBOptions {
  /** 1-based plater id (matches Bambu's `plater_id`). Defaults to the first plate. */
  plateId?: number;
  /** Optional filament-index → hex recolor map applied before export. */
  recolor?: FilamentRecolorMap;
  /** Export pivot mode. Defaults to 'base-center'. */
  pivotMode?: import('./glbBuilder.js').BuildSceneOptions['pivotMode'];
  /** Custom pivot offset in millimeters (only used when pivotMode='custom'). */
  customPivotMm?: import('./glbBuilder.js').BuildSceneOptions['customPivotMm'];
}

/**
 * One-shot convenience: parse a 3MF buffer, optionally recolor filaments and
 * select a plate, and return the GLB bytes. Designed for CLI / batch use.
 */
export async function convertToGLB(
  buffer: ArrayBuffer | Uint8Array,
  opts: ConvertToGLBOptions = {},
): Promise<Uint8Array> {
  let parsed = await parse3MF(buffer);
  if (opts.recolor) parsed = applyRecolor(parsed, opts.recolor);

  const plate = opts.plateId
    ? parsed.plates.find((p) => p.id === opts.plateId)
    : parsed.plates[0];
  if (!plate) {
    const ids = parsed.plates.map((p) => p.id).join(', ');
    throw new Error(`Plate ${opts.plateId} not found. Available plate ids: ${ids}`);
  }

  const scene = buildSceneFromPlate(plate.meshChunks, parsed.filaments, {
    unitToMeters: parsed.unitToMeters,
    sourceUnit: parsed.sourceUnit,
    pivotMode: opts.pivotMode,
    customPivotMm: opts.customPivotMm,
  });
  return buildGLBBytes(scene);
}
