/**
 * 实时云图：NASA GIBS / Worldview Snapshot 接口。
 * 浏览器可直连（CORS: *），无需 API key，一次请求返回一张全球等距圆柱图。
 *
 * 图层用 VIIRS（NOAA-20）真彩：它是宽幅扫描，全球拼接后没有 MODIS 那种楔形轨道缝。
 * 数据每天更新一次，所以默认取"昨天"，没有数据再往前回溯。
 */
import type { QualityLevel } from '../core/quality';

export const CLOUD_ENDPOINT = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot';
export const CLOUD_LAYER = 'VIIRS_NOAA20_CorrectedReflectance_TrueColor';
/** 按画质档选择的请求画布宽度（输出世界图宽度与之相同，高度为其一半） */
export const CLOUD_WIDTH: Record<QualityLevel, number> = { low: 1024, medium: 2048, high: 3072 };
/**
 * 实测结论：接口把 2:1 的世界图渲染在「宽度 × 高度/2」的区域、并在画布中竖向居中，
 * 所以想要不变形的等距圆柱图，就请求方形画布、再裁掉上下各 25%。
 */
export const CLOUD_CROP_TOP_FRACTION = 0.25;
export const CLOUD_CROP_HEIGHT_FRACTION = 0.5;

export interface CloudCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** 从接口返回的方形画布里裁出等距圆柱世界图 */
export function cloudCropRect(width: number, height: number): CloudCrop {
  const sy = Math.round(height * CLOUD_CROP_TOP_FRACTION);
  const sh = Math.max(1, Math.round(height * CLOUD_CROP_HEIGHT_FRACTION));
  return { sx: 0, sy, sw: Math.max(1, Math.round(width)), sh };
}

/** 相对今天偏移若干天的 UTC 日期（YYYY-MM-DD） */
export function utcDateString(offsetDays: number, from: Date = new Date()): string {
  const date = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + offsetDays),
  );
  return date.toISOString().slice(0, 10);
}

export function buildCloudUrl(date: string, width: number): string {
  const query = [
    'REQUEST=GetSnapshot',
    'CRS=EPSG:4326',
    'FORMAT=image/jpeg',
    `WIDTH=${width}`,
    `HEIGHT=${width}`,
    'BBOX=-180,-90,180,90',
    `LAYERS=${CLOUD_LAYER}`,
    `TIME=${date}`,
  ].join('&');
  return `${CLOUD_ENDPOINT}?${query}`;
}

export interface CloudSnapshot {
  canvas: HTMLCanvasElement;
  /** 云图对应的 UTC 日期 */
  date: string;
  layer: string;
  fetchedAt: number;
}

type DecodedImage = CanvasImageSource & { width: number; height: number };

export interface LoadCloudOptions {
  width: number;
  now?: Date;
  fetchImpl?: typeof fetch;
  decodeImpl?: (blob: Blob) => Promise<DecodedImage>;
  createCanvasImpl?: (width: number, height: number) => HTMLCanvasElement;
  /** 最多往前回溯几天找有数据的一天 */
  attempts?: number;
  signal?: AbortSignal;
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      return (await createImageBitmap(blob)) as DecodedImage;
    } catch {
      // 个别浏览器对 JPEG 的 createImageBitmap 支持不佳，退回 <img>
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('cloud image decode failed'));
      image.src = url;
    });
    return image as DecodedImage;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function defaultCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** 拉取云图并裁成等距圆柱图；带日期回溯与失败重试 */
export async function loadCloudSnapshot(options: LoadCloudOptions): Promise<CloudSnapshot> {
  const doFetch = options.fetchImpl ?? fetch;
  const decode = options.decodeImpl ?? decodeImage;
  const createCanvas = options.createCanvasImpl ?? defaultCanvas;
  const attempts = Math.max(1, options.attempts ?? 2);
  const now = options.now ?? new Date();
  let lastError: unknown = null;

  for (let step = 1; step <= attempts; step += 1) {
    const date = utcDateString(-step, now);
    try {
      const response = await doFetch(buildCloudUrl(date, options.width), { signal: options.signal });
      if (!response.ok) throw new Error(`cloud HTTP ${response.status}`);
      // GIBS 用 Data-Present 头说明这一天有没有数据
      if (response.headers?.get('Data-Present') === 'false') throw new Error('no cloud data');
      const blob = await response.blob();
      const image = await decode(blob);
      const crop = cloudCropRect(image.width, image.height);
      const canvas = createCanvas(crop.sw, crop.sh);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas 2d context unavailable');
      context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
      return { canvas, date, layer: CLOUD_LAYER, fetchedAt: Date.now() };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('cloud imagery unavailable');
}

