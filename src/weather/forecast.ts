/**
 * 城市天气数据：Open-Meteo 免费接口。
 * 浏览器可直连（CORS: *），无需 API key，一次请求可带多个坐标。
 */
export const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
/** 单个请求携带的坐标数量上限（再多就拆成多次请求） */
export const WEATHER_BATCH_SIZE = 40;
/** 超过这个时长就重新拉一次（毫秒） */
export const WEATHER_STALE_MS = 30 * 60 * 1000;

export interface WeatherLocation {
  /** 城市 key（与 cityLabels 的 cityKey 一致） */
  key: string;
  lat: number;
  lon: number;
}

export interface CityWeather {
  key: string;
  /** WMO 天气码 */
  code: number;
  /** 气温 ℃ */
  tempC: number;
  /** 风速 km/h */
  windKmh: number;
  /** 当前降水 mm */
  precipMm: number;
  /** 当地是否白天（决定晴/多云的图标形态） */
  isDay: boolean;
}

export interface WeatherBundle {
  byKey: Map<string, CityWeather>;
  /** 拉取完成时刻（毫秒） */
  updatedAt: number;
  /** 失败的批次数量 */
  failedBatches: number;
}

export function buildWeatherUrl(locations: readonly WeatherLocation[]): string {
  const lat = locations.map((item) => item.lat.toFixed(3)).join(',');
  const lon = locations.map((item) => item.lon.toFixed(3)).join(',');
  const current = ['temperature_2m', 'weather_code', 'wind_speed_10m', 'precipitation', 'is_day'].join(',');
  return `${WEATHER_ENDPOINT}?latitude=${lat}&longitude=${lon}&current=${current}&timezone=UTC`;
}

interface OpenMeteoCurrent {
  temperature_2m?: number;
  weather_code?: number;
  wind_speed_10m?: number;
  precipitation?: number;
  is_day?: number;
}

function toNumber(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/** 把接口返回解析成城市天气；接口对多坐标按请求顺序返回数组，单坐标返回对象 */
export function parseWeatherResponse(
  payload: unknown,
  locations: readonly WeatherLocation[],
): CityWeather[] {
  const items: unknown[] = Array.isArray(payload) ? payload : [payload];
  const count = Math.min(items.length, locations.length);
  const result: CityWeather[] = [];
  for (let index = 0; index < count; index += 1) {
    const item = items[index] as { current?: OpenMeteoCurrent } | null | undefined;
    const current = item?.current;
    if (!current || current.weather_code === undefined) continue;
    const code = toNumber(current.weather_code, Number.NaN);
    if (!Number.isFinite(code)) continue;
    result.push({
      key: locations[index].key,
      code,
      tempC: toNumber(current.temperature_2m, Number.NaN),
      windKmh: toNumber(current.wind_speed_10m, Number.NaN),
      precipMm: toNumber(current.precipitation, Number.NaN),
      isDay: current.is_day !== 0,
    });
  }
  return result;
}

export interface FetchWeatherOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** 拉取一批城市的当前天气；个别批次失败不影响其它城市，全部失败才抛错 */
export async function fetchCityWeather(
  locations: readonly WeatherLocation[],
  options: FetchWeatherOptions = {},
): Promise<WeatherBundle> {
  const doFetch = options.fetchImpl ?? fetch;
  const chunks: WeatherLocation[][] = [];
  for (let index = 0; index < locations.length; index += WEATHER_BATCH_SIZE) {
    chunks.push(locations.slice(index, index + WEATHER_BATCH_SIZE));
  }

  const settled = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const response = await doFetch(buildWeatherUrl(chunk), { signal: options.signal });
      if (!response.ok) throw new Error(`weather HTTP ${response.status}`);
      const payload = (await response.json()) as unknown;
      return parseWeatherResponse(payload, chunk);
    }),
  );

  const byKey = new Map<string, CityWeather>();
  let failedBatches = 0;
  for (const entry of settled) {
    if (entry.status === 'fulfilled') {
      for (const item of entry.value) byKey.set(item.key, item);
    } else {
      failedBatches += 1;
    }
  }
  if (byKey.size === 0 && failedBatches > 0) {
    throw new Error('weather fetch failed');
  }
  return { byKey, updatedAt: Date.now(), failedBatches };
}

