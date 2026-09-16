import { t, type Lang } from './i18n';

export interface HudState {
  simTimeIso: string;
  /** 已按设备时区格式化好的本机时间 */
  localTimeLabel: string;
  playing: boolean;
  rate: number;
  fps: number;
  snapshotDate: string;
  version: string;
  quality: 'low' | 'medium' | 'high';
  lang: Lang;
  satelliteCount: number;
  visibleCount: number;
  sourceLabel: string;
  layers: { footprint: boolean; graticule: boolean; orbits: boolean };
  selectedName: string | null;
  /** 卫星轨道 / 气象云图 */
  mode: 'orbit' | 'weather';
  /** 气象模式下是否叠加显示专业气象卫星 */
  meteoOnly: boolean;
  /** 云图加载状态 */
  weatherStatus: 'idle' | 'loading' | 'ready' | 'error';
  /** 气象模式下的数据说明（云图时间 / 天气更新时间） */
  weatherNote: string;
  /** 云图日期（气象模式顶栏统计用） */
  weatherCloudDate: string;
  /** 气象数据来源 */
  weatherSource: string;
  /** 名单里的主力气象卫星数量（气象模式的顶栏统计用） */
  meteoSatelliteCount: number;
}

export type LayerKey = 'footprint' | 'graticule' | 'orbits';

export interface HudCallbacks {
  onTogglePlay(): void;
  onRate(rate: number): void;
  onNow(): void;
  onToggleLang(): void;
  onToggleLayer(key: LayerKey): void;
  onAddSatellite(): void;
  onMode(mode: 'orbit' | 'weather'): void;
  onToggleMeteo(): void;
  onRefreshWeather(): void;
}

const RATES = [1, 10, 60, 600];

function timeOf(iso: string): string {
  return iso.slice(11, 19);
}

export function mountHud(
  root: HTMLElement,
  getState: () => HudState,
  callbacks: HudCallbacks,
): { refresh(): void } {
  const shell = document.createElement('div');
  shell.className = 'hud-shell';
  shell.innerHTML = `
    <div class="hud-top">
      <span class="hud-brand" data-role="title"></span>
      <div class="hud-modes" data-role="modes">
        <button class="hud-mode" data-mode="orbit" type="button"></button>
        <button class="hud-mode" data-mode="weather" type="button"></button>
      </div>
      <span class="hud-clock" data-role="clock"></span>
      <span class="hud-local" data-role="local"></span>
      <span class="hud-stats" data-role="stats"></span>
      <span class="hud-fps" data-role="fps"></span>
      <span class="hud-quality" data-role="quality"></span>
      <button class="hud-btn" data-action="lang"></button>
    </div>
    <div class="hud-bottom">
      <button class="hud-btn hud-btn-primary" data-action="play"></button>
      <button class="hud-btn" data-action="now"></button>
      <div class="hud-rates" data-role="rates"></div>
      <div class="hud-layers" data-role="layers"></div>
      <button class="hud-btn" data-action="add"></button>
    </div>
    <div class="hud-note" data-role="note"></div>
    <div class="hud-follow" data-role="follow" hidden></div>
    <div class="hud-weather" data-role="weather" hidden>
      <button class="hud-btn hud-toggle" data-action="meteo" type="button"></button>
      <button class="hud-btn" data-action="refresh-weather" type="button"></button>
      <div class="hud-weather-note" data-role="weather-note"></div>
    </div>
  `;
  root.appendChild(shell);

  const el = <T extends HTMLElement>(role: string) => shell.querySelector<T>(`[data-role="${role}"]`)!;
  const titleEl = el<HTMLElement>('title');
  const clockEl = el<HTMLElement>('clock');
  const localEl = el<HTMLElement>('local');
  const statsEl = el<HTMLElement>('stats');
  const fpsEl = el<HTMLElement>('fps');
  const qualityEl = el<HTMLElement>('quality');
  const noteEl = el<HTMLElement>('note');
  const followEl = el<HTMLElement>('follow');
  const ratesEl = el<HTMLElement>('rates');
  const layersEl = el<HTMLElement>('layers');
  const bottomEl = shell.querySelector<HTMLElement>('.hud-bottom')!;
  const weatherEl = el<HTMLElement>('weather');
  const weatherNoteEl = el<HTMLElement>('weather-note');
  const langButton = shell.querySelector<HTMLButtonElement>('[data-action="lang"]')!;
  const playButton = shell.querySelector<HTMLButtonElement>('[data-action="play"]')!;
  const nowButton = shell.querySelector<HTMLButtonElement>('[data-action="now"]')!;
  const addButton = shell.querySelector<HTMLButtonElement>('[data-action="add"]')!;
  const orbitModeButton = shell.querySelector<HTMLButtonElement>('[data-mode="orbit"]')!;
  const weatherModeButton = shell.querySelector<HTMLButtonElement>('[data-mode="weather"]')!;
  const meteoButton = shell.querySelector<HTMLButtonElement>('[data-action="meteo"]')!;
  const refreshWeatherButton = shell.querySelector<HTMLButtonElement>('[data-action="refresh-weather"]')!;

  const rateButtons = RATES.map((rate) => {
    const button = document.createElement('button');
    button.className = 'hud-btn hud-rate';
    button.textContent = `×${rate}`;
    button.addEventListener('click', () => callbacks.onRate(rate));
    ratesEl.appendChild(button);
    return { rate, button };
  });

  const layerDefs: [LayerKey, string][] = [
    ['footprint', 'layerFootprint'],
    ['graticule', 'layerGraticule'],
    ['orbits', 'layerOrbits'],
  ];
  const layerButtons = layerDefs.map(([key, labelKey]) => {
    const button = document.createElement('button');
    button.className = 'hud-btn hud-toggle';
    button.dataset.layer = key;
    button.dataset.labelKey = labelKey;
    button.addEventListener('click', () => callbacks.onToggleLayer(key));
    layersEl.appendChild(button);
    return { key, button, labelKey };
  });

  playButton.addEventListener('click', () => callbacks.onTogglePlay());
  nowButton.addEventListener('click', () => callbacks.onNow());
  langButton.addEventListener('click', () => callbacks.onToggleLang());
  addButton.addEventListener('click', () => callbacks.onAddSatellite());
  orbitModeButton.addEventListener('click', () => callbacks.onMode('orbit'));
  weatherModeButton.addEventListener('click', () => callbacks.onMode('weather'));
  meteoButton.addEventListener('click', () => callbacks.onToggleMeteo());
  refreshWeatherButton.addEventListener('click', () => callbacks.onRefreshWeather());

  const refresh = () => {
    const state = getState();
    const weatherMode = state.mode === 'weather';
    titleEl.textContent = t(state.lang, 'title');
    clockEl.textContent = `${timeOf(state.simTimeIso)} UTC`;
    localEl.textContent = `${t(state.lang, 'localTime')} ${state.localTimeLabel}`;
    // 两种模式都占着这一格：统计文字一旦消失，顶栏宽度变化会让整条栏左右跳动
    statsEl.textContent = weatherMode
      ? t(state.lang, 'weatherStats', {
          date: state.weatherCloudDate || '—',
          count: state.meteoSatelliteCount,
        })
      : `${t(state.lang, 'satellites', { count: state.satelliteCount })} · ${t(state.lang, 'visible', {
          count: state.visibleCount,
        })}`;
    fpsEl.textContent = `${Math.round(state.fps)} fps`;
    qualityEl.textContent = state.quality;

    orbitModeButton.textContent = t(state.lang, 'modeOrbit');
    weatherModeButton.textContent = t(state.lang, 'modeWeather');
    orbitModeButton.title = t(state.lang, 'modeHint');
    weatherModeButton.title = t(state.lang, 'modeHint');
    orbitModeButton.classList.toggle('is-active', state.mode === 'orbit');
    weatherModeButton.classList.toggle('is-active', state.mode === 'weather');

    bottomEl.hidden = weatherMode;
    weatherEl.hidden = !weatherMode;
    if (weatherMode) {
      meteoButton.textContent = t(state.lang, 'weatherSats');
      meteoButton.title = t(state.lang, 'weatherSatsHint');
      meteoButton.classList.toggle('is-active', state.meteoOnly);
      meteoButton.disabled = state.weatherStatus === 'loading';
      refreshWeatherButton.textContent = t(state.lang, 'weatherRefresh');
      refreshWeatherButton.disabled = state.weatherStatus === 'loading';
      weatherNoteEl.textContent =
        state.weatherStatus === 'loading'
          ? t(state.lang, 'weatherLoading')
          : state.weatherStatus === 'error'
            ? t(state.lang, 'weatherFailed')
            : state.weatherNote;
      noteEl.textContent = state.weatherSource;
      noteEl.title = '';
    } else {
      noteEl.textContent = t(state.lang, 'snapshot', { date: state.snapshotDate, version: state.version });
      noteEl.title = t(state.lang, 'source', { source: state.sourceLabel });
    }

    langButton.textContent = t(state.lang, 'language');
    playButton.textContent = state.playing ? t(state.lang, 'pause') : t(state.lang, 'play');
    nowButton.textContent = t(state.lang, 'now');
    addButton.textContent = t(state.lang, 'addSatellite');

    for (const { rate, button } of rateButtons) {
      button.classList.toggle('is-active', state.playing && rate === state.rate);
    }
    for (const { key, button, labelKey } of layerButtons) {
      button.textContent = t(state.lang, labelKey);
      button.classList.toggle('is-active', state.layers[key]);
    }

    if (state.selectedName) {
      followEl.hidden = false;
      followEl.textContent = t(state.lang, 'following', { name: state.selectedName });
    } else {
      followEl.hidden = true;
    }
  };

  refresh();
  return { refresh };
}
