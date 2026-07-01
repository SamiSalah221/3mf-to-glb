export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function hexToLinearRGBA(hex: string): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const a = hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1.0;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a];
}

export function linearToHex(r: number, g: number, b: number): string {
  const toHexByte = (c: number) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(c))) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}
