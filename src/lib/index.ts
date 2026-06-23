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
  RotationQuat,
} from '../types/index.js';
export { UNIT_TO_METERS } from '../types/index.js';
export type { BuildSceneOptions, BuiltSceneUserData } from './glbBuilder.js';
export { BUILD_UP_AXIS } from './glbBuilder.js';
export type { GLBAssetExtras } from './glbExporter.js';

import * as THREE from 'three';
import { parse3MF } from './parse3MF.js';
import { buildSceneFromPlate } from './glbBuilder.js';
import { buildGLBBytes } from './glbExporter.js';
import { applyRecolor } from './recolor.js';
import type { FilamentRecolorMap } from './recolor.js';
import type { RotationQuat } from '../types/index.js';

function eulerDegToQuat(x: number, y: number, z: number): RotationQuat {
  const rad = Math.PI / 180;
  const e = new THREE.Euler(x * rad, y * rad, z * rad, 'XYZ');
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

export interface ConvertToGLBOptions {
  /** 1-based plater id (matches Bambu's `plater_id`). Defaults to the first plate. */
  plateId?: number;
  /** Optional filament-index → hex recolor map applied before export. */
  recolor?: FilamentRecolorMap;
  /** Export pivot mode. Defaults to 'base-center'. */
  pivotMode?: import('./glbBuilder.js').BuildSceneOptions['pivotMode'];
  /** Custom pivot offset in millimeters (only used when pivotMode='custom'). */
  customPivotMm?: import('./glbBuilder.js').BuildSceneOptions['customPivotMm'];
  /**
   * Optional user orientation as a unit quaternion [x, y, z, w]. Baked into
   * positions + normals before the pivot translation. Identity (default)
   * leaves geometry untouched. Mutually exclusive with `rotationEulerDeg`.
   */
  rotationQuat?: import('./glbBuilder.js').BuildSceneOptions['rotationQuat'];
  /**
   * Convenience alternative to `rotationQuat`: XYZ Euler angles in degrees,
   * applied as `Quaternion.setFromEuler(new Euler(x, y, z, 'XYZ'))`. The
   * CLI surfaces this as `--rotation "x,y,z"`.
   */
  rotationEulerDeg?: [number, number, number];
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

  const rotationQuat =
    opts.rotationQuat ??
    (opts.rotationEulerDeg
      ? eulerDegToQuat(
          opts.rotationEulerDeg[0],
          opts.rotationEulerDeg[1],
          opts.rotationEulerDeg[2],
        )
      : undefined);

  const scene = buildSceneFromPlate(plate.meshChunks, parsed.filaments, {
    unitToMeters: parsed.unitToMeters,
    sourceUnit: parsed.sourceUnit,
    pivotMode: opts.pivotMode,
    customPivotMm: opts.customPivotMm,
    rotationQuat,
  });
  return buildGLBBytes(scene);
}
