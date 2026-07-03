import { useState } from 'react';

const PANEL_WIDTH_KEY = 'cc.panelWidth';
const SPLIT_KEY = 'cc.split';

export const LAYOUT_KEYS = [PANEL_WIDTH_KEY, SPLIT_KEY] as const;

function readStored<T>(key: string, initial: T): T {
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : initial;
  } catch {
    return initial;
  }
}

export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStored(key, initial));

  const set = (next: T) => {
    setValue(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore write failures (e.g. private browsing quota)
    }
  };

  return [value, set] as const;
}

export function resetLayout() {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LAYOUT_KEYS) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  window.location.reload();
}
