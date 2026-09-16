/**
 * 实时云图：NASA GIBS / Worldview Snapshot 接口。
 * 浏览器可直连（CORS: *），无需 API key，一次请求返回一张全球等距圆柱图。
 *
 * 图层用 VIIRS（NOAA-20）真彩：它是宽幅扫描，全球拼接后没有 MODIS 那种楔形轨道缝。
 * 数据每天更新一次，所以默认取"昨天"，没有数据再往前回溯。
 */
export const CLOUD_ENDPOINT = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot';
export const CLOUD_LAYER = 'VIIRS_NOAA20_CorrectedReflectance_TrueColor';

/**
 * 接口返回的方形画布里，世界图只占「横向铺满」的一条带，上下都是纯黑边：
 * 顶边落在画布高度的 26.17% 处，带宽固定是高度的 7/16，这条带覆盖的正好是纬度 ±90°。
 * （把 GIBS 的海岸线图层叠在云图上逐像素校准过：马达加斯加南北跨越 13.6° 落在 137 个像素上，
 *  折合每度约 10 像素，只有「这条带 = ±90°」才对得上。）
 * 裁多了会把黑边和整体纵向拉伸的云一起贴上球，云的纬度会偏出好几度，所以这两个比例是个硬约束。
 */
export const CLOUD_CROP_TOP_FRACTION = 0.2617;
export const CLOUD_CROP_HEIGHT_FRACTION = 0.4375;

/**
 * 全球底图的画布尺寸阶梯：先用小图把画面点亮，再在后台逐级换成大图。
 * 实测 8192 会返回全黑（超出服务端上限），所以最大只到 6144。
 * 另外画布必须是正方形：同样宽度下换成 2:1 的画布，内容带会跟着被压薄，纵向分辨率反而更低。
 *
 * 这条阶梯不跟画质档走：画质档只凭几秒的掉帧就会降级，云图分辨率跟着被砍半的话，
 * 白白牺牲清晰度，而大贴图多花的是显存和一次性上传，逐帧采样开销和小图几乎一样。
 * 6144 那张约 17 像素/度（4096 只有 11），是服务端给得起的最高一档；
 * 体积上 6144 的 JPEG 实测约 4.4 MB，比随包发布的 4.6 MB 地球贴图还小一点。
 */
export const CLOUD_WIDTH_LADDER: readonly number[] = [2048, 4096, 6144];

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
  /** 直接取这一天，不再回溯（换更大尺寸时沿用已经确定的那一天，免得画面跳日期） */
  date?: string;
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
  const dates = options.date
    ? [options.date]
    : Array.from({ length: attempts }, (_, index) => utcDateString(-(index + 1), now));
  let lastError: unknown = null;

  for (const date of dates) {
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
