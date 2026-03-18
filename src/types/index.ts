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

/** Full parse result */
export interface ParseResult {
  plates: Plate[];
  filaments: FilamentSlot[];
}
