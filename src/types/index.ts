/** A filament color slot (e.g. Filament 1 = #FFF144) */
export interface FilamentSlot {
  index: number;         // 1-based filament index
  originalColor: string; // hex from project settings
  currentColor: string;  // user-selected hex
}

/** A single mesh chunk: geometry + its assigned filament */
export interface MeshChunk {
  name: string;
  filamentIndex: number; // 1-based
  positions: Float32Array;
  normals: Float32Array;
  faceCount: number;
}

/** A plate containing multiple mesh chunks */
export interface Plate {
  id: number;
  name: string;
  thumbnailUrl: string | null; // data URL for plate thumbnail
  meshChunks: MeshChunk[];
  filamentIndicesUsed: number[]; // which filaments appear on this plate
}

/** Bounding-box dimensions of a plate in physical units. */
export interface Dimensions {
  mm: { x: number; y: number; z: number };
  m: { x: number; y: number; z: number };
  bboxMinM: [number, number, number];
  bboxMaxM: [number, number, number];
}

/** The 3MF <model unit="..."> values. */
export type SourceUnit = 'micron' | 'millimeter' | 'centimeter' | 'inch' | 'foot' | 'meter';

/** Conversion factor for each legal 3MF unit. */
export const UNIT_TO_METERS: Record<SourceUnit, number> = {
  micron: 1e-6,
  millimeter: 1e-3,
  centimeter: 1e-2,
  inch: 0.0254,
  foot: 0.3048,
  meter: 1,
};

/** Full parse result */
export interface ParseResult {
  plates: Plate[];
  filaments: FilamentSlot[];
  /** Unit declared on the root <model> element. Defaults to 'millimeter'. */
  sourceUnit: SourceUnit;
  /** Meters-per-source-unit conversion factor for the parsed file. */
  unitToMeters: number;
}

/**
 * Pivot mode for export. The pivot is the point in the model that lands at
 * the glTF/USDZ origin (0,0,0). AR runtimes place the origin onto the
 * detected surface and rotate around it, so the pivot controls how the model
 * sits and spins in AR.
 *
 *  - `base-center`: center the two non-up axes and put the up-axis MIN at
 *    zero. Default and best for AR floor placement.
 *  - `bbox-center`: geometric center of the axis-aligned bounding box at the
 *    origin.
 *  - `centroid`: area-weighted centroid at the origin.
 *  - `original`: keep the source 3MF origin (no translation beyond the
 *    unit-to-meters scale).
 *  - `custom`: arbitrary X/Y/Z translation entered by the user.
 */
export type PivotMode = 'base-center' | 'bbox-center' | 'centroid' | 'original' | 'custom';
