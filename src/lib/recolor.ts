import type { ParseResult } from '../types/index.js';

/** Mapping from 1-based filament index to a hex color (#RRGGBB). */
export type FilamentRecolorMap = Record<number, string>;

/**
 * Apply a new color mapping to a parsed 3MF result, returning a new ParseResult
 * with `filaments[i].currentColor` overridden for any index present in the map.
 * Original colors are preserved on the slot so the caller can still reset.
 */
export function applyRecolor(parsed: ParseResult, mapping: FilamentRecolorMap): ParseResult {
  return {
    ...parsed,
    filaments: parsed.filaments.map((f) => ({
      ...f,
      currentColor: mapping[f.index] ?? f.currentColor,
    })),
  };
}

/**
 * Parse a CLI-style recolor argument: `1=#ff0000,2=#00ff00,3=00ff00`.
 * Throws on malformed input so the CLI can surface a useful message.
 */
export function parseRecolorArg(arg: string): FilamentRecolorMap {
  const out: FilamentRecolorMap = {};
  for (const part of arg.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) throw new Error(`Invalid recolor entry "${trimmed}". Expected "index=#hex".`);
    const idx = Number(trimmed.slice(0, eq));
    let hex = trimmed.slice(eq + 1).trim();
    if (!Number.isInteger(idx) || idx < 1) {
      throw new Error(`Invalid filament index in "${trimmed}". Use 1-based integers.`);
    }
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      throw new Error(`Invalid hex color in "${trimmed}". Expected #RRGGBB.`);
    }
    out[idx] = hex.toUpperCase();
  }
  return out;
}
