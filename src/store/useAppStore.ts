import { create } from 'zustand';
import type { ParseResult, FilamentSlot, Dimensions, PivotMode, RotationQuat } from '../types';
import { mixFilamentHex } from '../lib/filamentMixer';

/**
 * Recompute every Snapmaker U1 "mixed" slot's currentColor from its two source
 * base filaments' current colors, so derived blends stay live as bases change.
 */
/** Camera projection for the viewport. Session-only, not persisted. */
type CameraProjection = 'perspective' | 'orthographic';

/** Which version of the part is on screen: the design model or the as-printed one. */
export type ViewMode = 'model' | 'printed';

const kindOf = (r: ParseResult): ViewMode => (r.sourceKind === 'gcode' ? 'printed' : 'model');

/** Same plate id in the other version when it has one, else its first plate. */
function plateIn(result: ParseResult, plateId: number | null): number | null {
  return result.plates.find((p) => p.id === plateId)?.id ?? result.plates[0]?.id ?? null;
}

/** Read the one-time orbit-hint dismissal flag from localStorage. */
function readOrbitHintSeen(): boolean {
  try {
    return localStorage.getItem('cc.orbitHintSeen') === 'true';
  } catch {
    return false;
  }
}

function withMixes(filaments: FilamentSlot[]): FilamentSlot[] {
  const byIndex = new Map(filaments.map((f) => [f.index, f]));
  return filaments.map((f) => {
    if (!f.mix) return f;
    // Overridden mixes keep their explicit color and ignore source changes.
    if (f.mixOverridden) return f;
    const a = byIndex.get(f.mix.sources[0]);
    const b = byIndex.get(f.mix.sources[1]);
    if (!a || !b) return f;
    return { ...f, currentColor: mixFilamentHex(a.currentColor, b.currentColor, f.mix.ratioA) };
  });
}

interface AppStore {
  // File state
  file: File | null;
  isLoading: boolean;
  isParsed: boolean;
  error: string | null;

  // Parsed data. This is the version on screen; with both a design 3MF and
  // its sliced G-code loaded it is one of `versions` (see viewMode).
  parseResult: ParseResult | null;

  // The two versions of a part: the design model (.3mf) and the as-printed
  // model built from sliced G-code. Either may be missing.
  versions: { model: ParseResult | null; printed: ParseResult | null };
  viewMode: ViewMode;
  // Bumped on every Model / As printed switch, so the camera keeps its angle
  // across the swap instead of re-homing.
  viewToggleSeq: number;

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

  // Viewport camera projection (session-only). The orbit gizmo and the
  // ortho/perspective toggle drive this; it never touches export.
  cameraProjection: CameraProjection;

  // One-time "drag to orbit" hint. Seeded from localStorage so a returning
  // user never sees it again; dismissed on the first orbit drag.
  orbitHintSeen: boolean;

  // Actions
  setFile: (f: File) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setParsed: (result: ParseResult) => void;
  /** Load the other version of the current part (G-code next to a 3MF, or the reverse) and show it. */
  addVersion: (result: ParseResult) => void;
  setViewMode: (mode: ViewMode) => void;
  setCurrentPlate: (plateId: number) => void;
  selectFilament: (index: number | null) => void;
  setFilamentColor: (index: number, color: string) => void;
  relinkMixedFilament: (index: number) => void;
  setThinAxis: (axis: 'x' | 'y' | 'z' | null) => void;
  setDimensions: (dim: Dimensions | null) => void;
  setBboxCenterM: (c: [number, number, number] | null) => void;
  setPivotMode: (m: PivotMode) => void;
  setCustomPivotMm: (mm: [number, number, number]) => void;
  setRotationQuat: (q: RotationQuat) => void;
  resetRotation: () => void;
  setCameraProjection: (m: CameraProjection) => void;
  dismissOrbitHint: () => void;
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
  versions: { model: null, printed: null },
  viewMode: 'model',
  viewToggleSeq: 0,
  filaments: [],
  currentPlateId: null,
  selectedFilamentIndex: null,
  thinAxis: null,
  dimensions: null,
  bboxCenterM: null,
  pivotMode: 'base-center',
  customPivotMm: [0, 0, 0],
  rotationQuat: IDENTITY_QUAT,
  cameraProjection: 'perspective',
  orbitHintSeen: readOrbitHintSeen(),

  setFile: (f) => set({ file: f, error: null }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error, isLoading: false }),

  setParsed: (result) => set({
    parseResult: result,
    versions: { model: null, printed: null, [kindOf(result)]: result },
    viewMode: kindOf(result),
    filaments: result.filaments,
    isParsed: true,
    isLoading: false,
    // Auto-select first non-empty plate
    currentPlateId: result.plates[0]?.id ?? null,
  }),

  addVersion: (result) =>
    set((state) => {
      const mode = kindOf(result);
      // Filaments are shared by both versions, so a recolor shows on either.
      // Keep the current slots (their edits and mixes) and add any the new
      // version uses that the current one lacks.
      const known = new Set(state.filaments.map((f) => f.index));
      const filaments = [...state.filaments, ...result.filaments.filter((f) => !known.has(f.index))]
        .sort((a, b) => a.index - b.index);
      return {
        versions: { ...state.versions, [mode]: result },
        viewMode: mode,
        parseResult: result,
        filaments,
        currentPlateId: plateIn(result, state.currentPlateId),
        selectedFilamentIndex: null,
        viewToggleSeq: state.viewToggleSeq + 1,
      };
    }),

  setViewMode: (mode) =>
    set((state) => {
      const next = state.versions[mode];
      if (!next || state.viewMode === mode) return state;
      return {
        viewMode: mode,
        parseResult: next,
        currentPlateId: plateIn(next, state.currentPlateId),
        selectedFilamentIndex: null,
        viewToggleSeq: state.viewToggleSeq + 1,
      };
    }),

  setCurrentPlate: (plateId) => set({ currentPlateId: plateId, selectedFilamentIndex: null }),

  selectFilament: (index) => set({ selectedFilamentIndex: index }),

  setFilamentColor: (index, color) =>
    set((state) => {
      const updated = state.filaments.map((f) => {
        if (f.index !== index) return f;
        // Directly setting a mix slot's main color detaches it from the blend
        // and locks its submains.
        if (f.mix) return { ...f, currentColor: color, mixOverridden: true };
        return { ...f, currentColor: color };
      });
      return { filaments: withMixes(updated) };
    }),

  relinkMixedFilament: (index) =>
    set((state) => {
      const updated = state.filaments.map((f) =>
        f.index === index && f.mix ? { ...f, mixOverridden: false } : f
      );
      return { filaments: withMixes(updated) };
    }),

  setThinAxis: (axis) => set({ thinAxis: axis }),

  setDimensions: (dim) => set({ dimensions: dim }),

  setBboxCenterM: (c) => set({ bboxCenterM: c }),

  setPivotMode: (m) => set({ pivotMode: m }),

  setCustomPivotMm: (mm) => set({ customPivotMm: mm }),

  setRotationQuat: (q) => set({ rotationQuat: q }),

  resetRotation: () => set({ rotationQuat: IDENTITY_QUAT }),

  setCameraProjection: (m) => set({ cameraProjection: m }),

  dismissOrbitHint: () =>
    set((state) => {
      if (state.orbitHintSeen) return state;
      try {
        localStorage.setItem('cc.orbitHintSeen', 'true');
      } catch {
        // Ignore storage failures (private mode, quota); the hint just reappears next load.
      }
      return { orbitHintSeen: true };
    }),

  resetColors: () =>
    set((state) => ({
      filaments: withMixes(
        state.filaments.map((f) => ({
          ...f,
          currentColor: f.originalColor,
          mixOverridden: false,
        })),
      ),
    })),

  reset: () =>
    set({
      file: null,
      isLoading: false,
      isParsed: false,
      error: null,
      parseResult: null,
      versions: { model: null, printed: null },
      viewMode: 'model',
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
