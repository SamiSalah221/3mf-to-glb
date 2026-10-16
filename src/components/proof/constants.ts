/** Shared constants for the Proof UI. */

import type { PivotMode } from '../../types';

export const PIVOT_OPTIONS: { value: PivotMode; label: string }[] = [
  { value: 'base-center', label: 'Base center — rests on the floor' },
  { value: 'bbox-center', label: 'Bounding-box center' },
  { value: 'centroid', label: 'Centroid' },
  { value: 'original', label: 'Original 3MF origin' },
  { value: 'custom', label: 'Custom offset' },
];

export type Step = 'color' | 'proof' | 'signoff';

export const STEPS: { id: Step; label: string }[] = [
  { id: 'color', label: 'Color' },
  { id: 'proof', label: 'Proof' },
  { id: 'signoff', label: 'Sign off' },
];

/** Primary action: ink on paper. */
export const PRIMARY =
  'h-12 px-5 flex items-center justify-center gap-2 bg-tx text-bg font-semibold text-[15px] hover:bg-white active:scale-[0.99] transition-colors disabled:opacity-40';

/** Secondary action: outlined. */
export const SECONDARY =
  'h-12 px-5 flex items-center justify-center gap-2 border border-tx text-tx font-medium text-[14px] hover:bg-panel3 active:scale-[0.99] transition-colors disabled:opacity-40';
