/** WMO 天气码 → 图标形态。图标是内联 SVG，不依赖任何图标库或网络字体。 */
export type WeatherIconKey =
  | 'clear-day'
  | 'clear-night'
  | 'partly-day'
  | 'partly-night'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder';

const SUN = '#ffd166';
const MOON = '#d8e6ff';
const CLOUD = '#e8eefb';
const CLOUD_DIM = '#b6c6e2';
const RAIN = '#7cc4ff';
const SNOW = '#dff1ff';

/** 小云朵：给「晴转多云」这类图标用，整体更小、偏右上 */
const SMALL_CLOUD_PATH = 'M8.4 20.6h8.6a3.2 3.2 0 0 0 .3-6.35 4.45 4.45 0 0 0-8.4-.95 3.25 3.25 0 0 0-.5 7.3Z';

const SUN_RAYS = (cx: number, cy: number, r: number) =>
  `<g stroke="${SUN}" stroke-width="1.6" stroke-linecap="round">` +
  `<path d="M${cx} ${cy - r - 2.1}v1.9M${cx} ${cy + r + 0.2}v1.9M${cx - r - 2.1} ${cy}h1.9M${cx + r + 0.2} ${cy}h1.9` +
  `<path d="M${cx - r - 1.5} ${cy - r - 1.5}l1.3 1.3M${cx + r + 0.2} ${cy + r + 0.2}l1.3 1.3` +
  `M${cx + r + 1.5} ${cy - r - 1.5}l-1.3 1.3M${cx - r - 1.5} ${cy + r + 1.5}l1.3-1.3"/></g>`;

function svg(body: string): string {
  return `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">${body}</svg>`;
}

const ICONS: Record<WeatherIconKey, string> = {
  'clear-day': svg(
    `<circle cx="12" cy="12" r="4.35" fill="${SUN}"/>` + SUN_RAYS(12, 12, 4.35),
  ),
  'clear-night': svg(
    `<path d="M20.4 14.7A8.7 8.7 0 0 1 9.3 3.6a8.7 8.7 0 1 0 11.1 11.1Z" fill="${MOON}"/>` +
      `<path d="M6.1 5.1l.45 1.15 1.15.45-1.15.45-.45 1.15-.45-1.15L4.5 6.7l1.15-.45Z" fill="#f2f7ff"/>`,
  ),
  'partly-day': svg(
    `<circle cx="8.6" cy="7.6" r="3.15" fill="${SUN}"/>` + SUN_RAYS(8.6, 7.6, 3.15) +
      `<path d="${SMALL_CLOUD_PATH}" fill="${CLOUD}"/>`,
  ),
  'partly-night': svg(
    `<path d="M12.1 2.4a5.9 5.9 0 0 1-7.5 6.9 5.9 5.9 0 1 0 7.5-6.9Z" fill="${MOON}"/>` +
      `<path d="${SMALL_CLOUD_PATH}" fill="${CLOUD}"/>`,
  ),
  cloudy: svg(
    `<path d="M8.2 20.6h7.7a3.5 3.5 0 0 0 .35-6.95 4.9 4.9 0 0 0-9.25-1.05A3.6 3.6 0 0 0 8.2 20.6Z" fill="${CLOUD}"/>` +
      `<path d="M9.6 9.1a4.6 4.6 0 0 1 5.5-1.7 3.4 3.4 0 0 0-5 2.6 4.4 4.4 0 0 0 .35 1.6 3.3 3.3 0 0 1-.85-2.5Z" fill="${CLOUD_DIM}"/>`,
  ),
  fog: svg(
    `<path d="M7.4 16.6h9.4a3.55 3.55 0 0 0 .35-7.05 5 5 0 0 0-9.45-1.05A3.65 3.65 0 0 0 7.4 16.6Z" fill="${CLOUD}"/>` +
      `<g stroke="${CLOUD_DIM}" stroke-width="1.5" stroke-linecap="round"><path d="M5.2 19.2h8.4M12.6 21.4h6.2"/></g>`,
  ),
  drizzle: svg(
    `<path d="M7.4 16.6h9.4a3.55 3.55 0 0 0 .35-7.05 5 5 0 0 0-9.45-1.05A3.65 3.65 0 0 0 7.4 16.6Z" fill="${CLOUD}"/>` +
      `<g stroke="${RAIN}" stroke-width="1.5" stroke-linecap="round"><path d="M9.6 19.1v1.6M14.2 19.1v1.6"/></g>`,
  ),
  rain: svg(
    `<path d="M7 15.9h9.9a3.7 3.7 0 0 0 .35-7.35 5.2 5.2 0 0 0-9.85-1.1A3.8 3.8 0 0 0 7 15.9Z" fill="${CLOUD}"/>` +
      `<g stroke="${RAIN}" stroke-width="1.6" stroke-linecap="round"><path d="M8.9 18.3l-.7 2.4M12.4 18.3l-.7 2.4M15.9 18.3l-.7 2.4"/></g>`,
  ),
  snow: svg(
    `<path d="M7 15.9h9.9a3.7 3.7 0 0 0 .35-7.35 5.2 5.2 0 0 0-9.85-1.1A3.8 3.8 0 0 0 7 15.9Z" fill="${CLOUD}"/>` +
      `<g fill="${SNOW}"><circle cx="9.2" cy="19.4" r="1.15"/><circle cx="12.6" cy="21" r="1.05"/><circle cx="15.7" cy="19.2" r="1.15"/></g>`,
  ),
  thunder: svg(
    `<path d="M7 15.9h9.9a3.7 3.7 0 0 0 .35-7.35 5.2 5.2 0 0 0-9.85-1.1A3.8 3.8 0 0 0 7 15.9Z" fill="${CLOUD}"/>` +
      `<path d="M12.9 17.4l-3.1 3.9h2.2l-.7 2.1 3.2-4.1h-2.15Z" fill="${SUN}"/>`,
  ),
};

export function weatherIconSvg(key: WeatherIconKey): string {
  return ICONS[key];
}

/** WMO 天气码 → 图标形态（晴与多云分白天/夜晚） */
export function weatherIconKey(code: number, isDay: boolean): WeatherIconKey {
  const value = Math.round(code);
  if (value === 0) return isDay ? 'clear-day' : 'clear-night';
  if (value === 1 || value === 2) return isDay ? 'partly-day' : 'partly-night';
  if (value === 3) return 'cloudy';
  if (value === 45 || value === 48) return 'fog';
  if ((value >= 51 && value <= 57) || value === 77) return 'drizzle';
  if ((value >= 61 && value <= 67) || (value >= 80 && value <= 82)) return 'rain';
  if ((value >= 71 && value <= 75) || value === 85 || value === 86) return 'snow';
  if (value >= 95) return 'thunder';
  return 'cloudy';
}

/** WMO 天气码 → i18n 文案 key */
export function weatherConditionKey(code: number): string {
  const value = Math.round(code);
  if (value === 0) return 'wmoClear';
  if (value === 1) return 'wmoMainlyClear';
  if (value === 2) return 'wmoPartly';
  if (value === 3) return 'wmoOvercast';
  if (value === 45 || value === 48) return 'wmoFog';
  if (value >= 51 && value <= 57) return 'wmoDrizzle';
  if (value === 66 || value === 67) return 'wmoFreezingRain';
  if (value >= 61 && value <= 65) return 'wmoRain';
  if (value >= 71 && value <= 77) return 'wmoSnow';
  if (value >= 80 && value <= 82) return 'wmoShowers';
  if (value === 85 || value === 86) return 'wmoSnowShowers';
  if (value >= 95) return 'wmoThunder';
  return 'wmoCloudy';
}
