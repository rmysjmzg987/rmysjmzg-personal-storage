export const FALLBACK_OCEAN: [number, number, number] = [16, 42, 82];
export const FALLBACK_GRID: [number, number, number] = [96, 148, 196];
export const FALLBACK_POLE: [number, number, number] = [232, 240, 248];

export async function resolveTextureUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

export function generateFallbackPixels(width: number, height: number): Uint8Array {
  const px = new Uint8Array(width * height * 4);
  const rowPhase = (y: number) => (y / height) * 12;
  const colPhase = (x: number) => (x / width) * 24;
  const onLine = (phase: number) => {
    const frac = phase - Math.floor(phase);
    return frac < 0.02 || frac > 0.98;
  };
  for (let y = 0; y < height; y++) {
    const v = height > 1 ? y / (height - 1) : 0;
    const polar = Math.abs(v - 0.5) * 2;
    for (let x = 0; x < width; x++) {
      const color =
        polar > 0.86 ? FALLBACK_POLE : onLine(rowPhase(y)) || onLine(colPhase(x)) ? FALLBACK_GRID : FALLBACK_OCEAN;
      const i = (y * width + x) * 4;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
    }
  }
  return px;
}
