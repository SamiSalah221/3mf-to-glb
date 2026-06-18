import { create } from 'zustand';
import type { ParseResult, FilamentSlot, Dimensions, PivotMode, RotationQuat } from '../types';

interface AppStore {
  // File state
  file: File | null;
  isLoading: boolean;
  isParsed: boolean;
  error: string | null;

  // Parsed data
  parseResult: ParseResult | null;

  // Filament colors (global across all plates)
  filaments: FilamentSlot[];

  // Current selections
  currentPlateId: number | null;
  selectedFilamentIndex: number | null; // which filament is being edited

  // Geometry-derived camera hint: the thinnest world-space axis of the current
  // plate's bounding box. The viewer positions the camera along this axis so
  // the printed face points at the camera (matches Bambu's preview orientation).
  thinAxis: 'x' | 'y' | 'z' | null;

  // Physical dimensions of the current plate (derived from buildSceneFromPlate
  // after the unit-to-meters bake). Drives the on-screen W x H x D readout.
  dimensions: Dimensions | null;

  // Bbox center in meters AFTER the pivot bake. The viewer points
  // OrbitControls at this so rotation always feels centered no matter
  // which export pivot is chosen.
  bboxCenterM: [number, number, number] | null;

  // Export pivot mode selected by the user (default 'base-center'). Affects
  // ONLY the exported GLB / USDZ; the 3MF write-back ignores it.
  pivotMode: PivotMode;
  // Custom pivot offset in mm (only used when pivotMode === 'custom').
  customPivotMm: [number, number, number];

  // User-applied model orientation as a unit quaternion [x, y, z, w].
  // Identity ([0, 0, 0, 1]) means no rotation. The quaternion is the
  // source of truth; the Euler readout in the UI is derived. Baked into
  // GLB / USDZ vertex positions + normals at export time, NOT into the
  // 3MF write-back (which would change the print-bed orientation).
  rotationQuat: RotationQuat;

  // Actions
  setFile: (f: File) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setParsed: (result: ParseResult) => void;
  setCurrentPlate: (plateId: number) => void;
  selectFilament: (index: number | null) => void;
  setFilamentColor: (index: number, color: string) => void;
  setThinAxis: (axis: 'x' | 'y' | 'z' | null) => void;
  setDimensions: (dim: Dimensions | null) => void;
  setBboxCenterM: (c: [number, number, number] | null) => void;
  setPivotMode: (m: PivotMode) => void;
  setCustomPivotMm: (mm: [number, number, number]) => void;
  setRotationQuat: (q: RotationQuat) => void;
  resetRotation: () => void;
  resetColors: () => void;
  reset: () => void;
}

const IDENTITY_QUAT: RotationQuat = [0, 0, 0, 1];

export const useAppStore = create<AppStore>((set) => ({
  file: null,
  isLoading: false,
  isParsed: false,
  error: null,
  parseResult: null,
  filaments: [],
  currentPlateId: null,
  selectedFilamentIndex: null,
  thinAxis: null,
  dimensions: null,
  bboxCenterM: null,
  pivotMode: 'base-center',
  customPivotMm: [0, 0, 0],
  rotationQuat: IDENTITY_QUAT,

  setFile: (f) => set({ file: f, error: null }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error, isLoading: false }),

  setParsed: (result) => set({
    parseResult: result,
    filaments: result.filaments,
    isParsed: true,
    isLoading: false,
    // Auto-select first non-empty plate
    currentPlateId: result.plates[0]?.id ?? null,
  }),

  setCurrentPlate: (plateId) => set({ currentPlateId: plateId, selectedFilamentIndex: null }),

  selectFilament: (index) => set({ selectedFilamentIndex: index }),

  setFilamentColor: (index, color) =>
    set((state) => ({
      filaments: state.filaments.map((f) =>
        f.index === index ? { ...f, currentColor: color } : f
      ),
    })),

  setThinAxis: (axis) => set({ thinAxis: axis }),

  setDimensions: (dim) => set({ dimensions: dim }),

  setBboxCenterM: (c) => set({ bboxCenterM: c }),

  setPivotMode: (m) => set({ pivotMode: m }),

  setCustomPivotMm: (mm) => set({ customPivotMm: mm }),

  setRotationQuat: (q) => set({ rotationQuat: q }),

  resetRotation: () => set({ rotationQuat: IDENTITY_QUAT }),

  resetColors: () =>
    set((state) => ({
      filaments: state.filaments.map((f) => ({ ...f, currentColor: f.originalColor })),
    })),

  reset: () =>
    set({
      file: null,
      isLoading: false,
      isParsed: false,
      error: null,
      parseResult: null,
      filaments: [],
      currentPlateId: null,
      selectedFilamentIndex: null,
      thinAxis: null,
      dimensions: null,
      bboxCenterM: null,
      // Reset rotation on "New File" because orientation is intrinsically
      // per-model: a +90 X that stood up model A may lay model B on its
      // face. pivotMode + customPivotMm intentionally persist (the user's
      // export preference is unlikely to flip per file).
      rotationQuat: IDENTITY_QUAT,
    }),
}));
