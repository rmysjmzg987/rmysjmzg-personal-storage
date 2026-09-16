import { t, type Lang } from './i18n';

export interface HudState {
  simTimeIso: string;
  /** 已按设备时区格式化好的本机时间 */
  localTimeLabel: string;
  playing: boolean;
  rate: number;
  fps: number;
  snapshotDate: string;
  quality: 'low' | 'medium' | 'high';
  lang: Lang;
  satelliteCount: number;
  visibleCount: number;
  sourceLabel: string;
  layers: { footprint: boolean; graticule: boolean; orbits: boolean };
  selectedName: string | null;
}

export type LayerKey = 'footprint' | 'graticule' | 'orbits';

export interface HudCallbacks {
  onTogglePlay(): void;
  onRate(rate: number): void;
  onNow(): void;
  onToggleLang(): void;
  onToggleLayer(key: LayerKey): void;
  onAddSatellite(): void;
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
  const langButton = shell.querySelector<HTMLButtonElement>('[data-action="lang"]')!;
  const playButton = shell.querySelector<HTMLButtonElement>('[data-action="play"]')!;
  const nowButton = shell.querySelector<HTMLButtonElement>('[data-action="now"]')!;
  const addButton = shell.querySelector<HTMLButtonElement>('[data-action="add"]')!;

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

  const refresh = () => {
    const state = getState();
    titleEl.textContent = t(state.lang, 'title');
    clockEl.textContent = `${timeOf(state.simTimeIso)} UTC`;
    localEl.textContent = `${t(state.lang, 'localTime')} ${state.localTimeLabel}`;
    statsEl.textContent = `${t(state.lang, 'satellites', { count: state.satelliteCount })} · ${t(state.lang, 'visible', {
      count: state.visibleCount,
    })}`;
    fpsEl.textContent = `${Math.round(state.fps)} fps`;
    qualityEl.textContent = state.quality;
    noteEl.textContent = t(state.lang, 'snapshot', { date: state.snapshotDate });
    noteEl.title = t(state.lang, 'source', { source: state.sourceLabel });

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
