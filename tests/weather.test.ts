import { describe, it, expect } from 'vitest';
import {
  WEATHER_ENDPOINT,
  buildWeatherUrl,
  fetchCityWeather,
  parseWeatherResponse,
  type WeatherLocation,
} from '../src/weather/forecast';
import {
  CLOUD_LAYER,
  buildCloudUrl,
  cloudCropRect,
  loadCloudSnapshot,
  utcDateString,
} from '../src/weather/clouds';
import { weatherConditionKey, weatherIconKey, weatherIconSvg } from '../src/weather/icons';
import { isMeteoSatellite, pickMeteoSatellites, METEO_SATELLITES } from '../src/orbit/meteo';
import { dictKeys, hasKey, t } from '../src/ui/i18n';

const locations: WeatherLocation[] = [
  { key: 'Beijing', lat: 39.9042, lon: 116.4074 },
  { key: 'Tokyo', lat: 35.6762, lon: 139.6503 },
];

describe('weather forecast', () => {
  it('builds a multi-location url with current fields', () => {
    const url = buildWeatherUrl(locations);
    expect(url.startsWith(WEATHER_ENDPOINT)).toBe(true);
    expect(url).toContain('latitude=39.904,35.676');
    expect(url).toContain('longitude=116.407,139.650');
    expect(url).toContain('weather_code');
    expect(url).toContain('is_day');
  });

  it('parses an array response (multi-location)', () => {
    const parsed = parseWeatherResponse(
      [
        { current: { temperature_2m: 21.4, weather_code: 3, wind_speed_10m: 12.2, precipitation: 0.4, is_day: 1 } },
        { current: { temperature_2m: 27, weather_code: 61, wind_speed_10m: 8, precipitation: 1.2, is_day: 0 } },
      ],
      locations,
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ key: 'Beijing', code: 3, tempC: 21.4, isDay: true });
    expect(parsed[1]).toMatchObject({ key: 'Tokyo', code: 61, isDay: false });
  });

  it('parses a single-object response and tolerates missing fields', () => {
    const parsed = parseWeatherResponse({ current: { weather_code: 0 } }, locations);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].key).toBe('Beijing');
    expect(Number.isNaN(parsed[0].tempC)).toBe(true);
    expect(parsed[0].isDay).toBe(true);
  });

  it('drops entries without a weather code', () => {
    const parsed = parseWeatherResponse([{ current: { temperature_2m: 10 } }], locations);
    expect(parsed).toHaveLength(0);
  });

  it('batches requests and keeps working when one batch fails', async () => {
    const urls: string[] = [];
    const many: WeatherLocation[] = Array.from({ length: 90 }, (_, index) => ({
      key: `city-${index}`,
      lat: index,
      lon: index,
    }));
    const fetchImpl = (async (url: string) => {
      urls.push(String(url));
      if (urls.length === 2) return { ok: false, status: 500 } as unknown as Response;
      const count = new URL(String(url)).searchParams.get('latitude')!.split(',').length;
      return {
        ok: true,
        status: 200,
        json: async () =>
          Array.from({ length: count }, () => ({ current: { weather_code: 1, is_day: 1 } })),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const bundle = await fetchCityWeather(many, { fetchImpl });
    expect(urls).toHaveLength(3);
    expect(bundle.failedBatches).toBe(1);
    // 90 个坐标按 40 一批拆成 3 次请求，第二批失败 → 剩下 50 个城市
    expect(bundle.byKey.size).toBe(50);
  });

  it('throws when every batch fails', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 503 }) as unknown as Response) as unknown as typeof fetch;
    await expect(fetchCityWeather(locations, { fetchImpl })).rejects.toThrow();
  });
});

describe('weather icons', () => {
  it('maps wmo codes to icon keys', () => {
    expect(weatherIconKey(0, true)).toBe('clear-day');
    expect(weatherIconKey(0, false)).toBe('clear-night');
    expect(weatherIconKey(2, true)).toBe('partly-day');
    expect(weatherIconKey(3, true)).toBe('cloudy');
    expect(weatherIconKey(45, true)).toBe('fog');
    expect(weatherIconKey(55, true)).toBe('drizzle');
    expect(weatherIconKey(63, true)).toBe('rain');
    expect(weatherIconKey(81, true)).toBe('rain');
    expect(weatherIconKey(73, true)).toBe('snow');
    expect(weatherIconKey(86, true)).toBe('snow');
    expect(weatherIconKey(99, true)).toBe('thunder');
  });

  it('produces a distinct inline svg for every icon', () => {
    const keys = [
      'clear-day',
      'clear-night',
      'partly-day',
      'partly-night',
      'cloudy',
      'fog',
      'drizzle',
      'rain',
      'snow',
      'thunder',
    ] as const;
    const rendered = keys.map((key) => weatherIconSvg(key));
    for (const svg of rendered) expect(svg.startsWith('<svg')).toBe(true);
    expect(new Set(rendered).size).toBe(keys.length);
  });

  it('maps codes to localized condition keys', () => {
    expect(t('zh', weatherConditionKey(0))).toBe('晴');
    expect(t('en', weatherConditionKey(0))).toBe('Clear');
    expect(t('zh', weatherConditionKey(95))).toBe('雷暴');
    expect(t('zh', weatherConditionKey(48))).toBe('雾');
  });
});

describe('cloud imagery', () => {
  it('formats utc dates with day offsets', () => {
    const now = new Date('2026-09-16T02:30:00Z');
    expect(utcDateString(0, now)).toBe('2026-09-16');
    expect(utcDateString(-1, now)).toBe('2026-09-15');
    expect(utcDateString(-2, now)).toBe('2026-09-14');
    // 跨月边界
    expect(utcDateString(-1, new Date('2026-10-01T00:10:00Z'))).toBe('2026-09-30');
  });

  it('builds a square snapshot url for the viirs layer', () => {
    const url = buildCloudUrl('2026-09-15', 2048);
    expect(url).toContain('REQUEST=GetSnapshot');
    expect(url).toContain('CRS=EPSG:4326');
    expect(url).toContain('WIDTH=2048');
    expect(url).toContain('HEIGHT=2048');
    expect(url).toContain('BBOX=-180,-90,180,90');
    expect(url).toContain(`LAYERS=${CLOUD_LAYER}`);
    expect(url).toContain('TIME=2026-09-15');
  });

  it('crops the middle half of the square canvas (equirect world)', () => {
    expect(cloudCropRect(2048, 2048)).toEqual({ sx: 0, sy: 512, sw: 2048, sh: 1024 });
    expect(cloudCropRect(1024, 1024)).toEqual({ sx: 0, sy: 256, sw: 1024, sh: 512 });
  });

  it('loads, crops and returns the canvas', async () => {
    const image = { width: 2048, height: 2048 } as unknown as CanvasImageSource & {
      width: number;
      height: number;
    };
    const drawn: unknown[][] = [];
    const snapshot = await loadCloudSnapshot({
      width: 2048,
      now: new Date('2026-09-16T00:00:00Z'),
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => 'true' },
          blob: async () => new Blob([]),
        }) as unknown as Response) as unknown as typeof fetch,
      decodeImpl: async () => image,
      createCanvasImpl: ((width: number, height: number) =>
        ({
          width,
          height,
          getContext: () => ({
            drawImage: (...args: unknown[]) => {
              drawn.push(args);
            },
          }),
        }) as unknown as HTMLCanvasElement) as (width: number, height: number) => HTMLCanvasElement,
    });

    expect(snapshot.date).toBe('2026-09-15');
    expect(snapshot.layer).toBe(CLOUD_LAYER);
    expect(snapshot.canvas.width).toBe(2048);
    expect(snapshot.canvas.height).toBe(1024);
    expect(drawn[0]).toEqual([image, 0, 512, 2048, 1024, 0, 0, 2048, 1024]);
  });

  it('falls back to the day before when the latest day has no data', async () => {
    const urls: string[] = [];
    const snapshot = await loadCloudSnapshot({
      width: 1024,
      now: new Date('2026-09-16T00:00:00Z'),
      fetchImpl: (async (url: string) => {
        urls.push(String(url));
        return {
          ok: true,
          status: 200,
          headers: { get: () => (urls.length === 1 ? 'false' : 'true') },
          blob: async () => new Blob([]),
        } as unknown as Response;
      }) as unknown as typeof fetch,
      decodeImpl: async () => ({ width: 1024, height: 1024 }) as unknown as CanvasImageSource & {
        width: number;
        height: number;
      },
      createCanvasImpl: ((width: number, height: number) =>
        ({ width, height, getContext: () => ({ drawImage: () => undefined }) }) as unknown as HTMLCanvasElement) as (
        width: number,
        height: number,
      ) => HTMLCanvasElement,
    });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('TIME=2026-09-15');
    expect(snapshot.date).toBe('2026-09-14');
  });

  it('throws when no day can be fetched', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 }) as unknown as Response) as unknown as typeof fetch;
    await expect(
      loadCloudSnapshot({ width: 1024, fetchImpl, attempts: 2 }),
    ).rejects.toThrow();
  });
});

describe('weather satellites', () => {
  it('recognises the operational fleet', () => {
    expect(METEO_SATELLITES.length).toBeGreaterThanOrEqual(8);
    expect(isMeteoSatellite(41866)).toBe(true);
    expect(isMeteoSatellite(12345)).toBe(false);
  });

  it('filters records and keeps catalog order', () => {
    const records = [
      { noradId: 25544, name: 'ISS' },
      { noradId: 43013, name: 'NOAA 20' },
      { noradId: 99999, name: 'X' },
      { noradId: 41836, name: 'HIMAWARI-9' },
    ];
    expect(pickMeteoSatellites(records).map((record) => record.name)).toEqual(['NOAA 20', 'HIMAWARI-9']);
  });
});

describe('i18n parity', () => {
  it('defines every key in both languages', () => {
    for (const key of dictKeys()) {
      expect(hasKey('zh', key), `zh missing ${key}`).toBe(true);
      expect(hasKey('en', key), `en missing ${key}`).toBe(true);
    }
  });
});
