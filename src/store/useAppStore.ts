import { create } from 'zustand';
import type { ParseResult, FilamentSlot } from '../types';

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

  // Actions
  setFile: (f: File) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setParsed: (result: ParseResult) => void;
  setCurrentPlate: (plateId: number) => void;
  selectFilament: (index: number | null) => void;
  setFilamentColor: (index: number, color: string) => void;
  resetColors: () => void;
  reset: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  file: null,
  isLoading: false,
  isParsed: false,
  error: null,
  parseResult: null,
  filaments: [],
  currentPlateId: null,
  selectedFilamentIndex: null,

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
    }),
}));
