import { t, type Lang } from './i18n';

export interface DetailView {
  lang: Lang;
  name: string;
  subtitle: string;
  typeName: string;
  typeNameEn: string;
  typeDesc: string;
  typeColor: string;
  altitude: string;
  speed: string;
  period: string;
  inclination: string;
  eccentricity: string;
  subpoint: string;
  fov: string;
  description: string;
  locked: boolean;
}

export interface DetailCallbacks {
  onClose(): void;
  onToggleLock(): void;
}

export function mountDetail(
  root: HTMLElement,
  callbacks: DetailCallbacks,
): { update(view: DetailView | null): void } {
  const card = document.createElement('div');
  card.className = 'detail-card';
  card.hidden = true;
  card.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title" data-role="name"></div>
        <div class="detail-subtitle" data-role="subtitle"></div>
      </div>
      <button class="detail-close" data-role="close" aria-label="close">×</button>
    </div>
    <div class="detail-rows"></div>
    <div class="detail-desc" data-role="desc"></div>
    <div class="detail-actions">
      <button class="hud-btn hud-btn-primary" data-role="lock"></button>
    </div>
  `;
  root.appendChild(card);

  const nameEl = card.querySelector<HTMLElement>('[data-role="name"]')!;
  const subtitleEl = card.querySelector<HTMLElement>('[data-role="subtitle"]')!;
  const rowsEl = card.querySelector<HTMLElement>('.detail-rows')!;
  const descEl = card.querySelector<HTMLElement>('[data-role="desc"]')!;
  const lockButton = card.querySelector<HTMLButtonElement>('[data-role="lock"]')!;
  const closeButton = card.querySelector<HTMLButtonElement>('[data-role="close"]')!;

  closeButton.addEventListener('click', () => callbacks.onClose());
  lockButton.addEventListener('click', () => callbacks.onToggleLock());

  function renderRows(view: DetailView): void {
    const rows: [string, string][] = [
      [t(view.lang, 'altitude'), view.altitude],
      [t(view.lang, 'speed'), view.speed],
      [t(view.lang, 'period'), view.period],
      [t(view.lang, 'inclination'), view.inclination],
      [t(view.lang, 'eccentricity'), view.eccentricity],
      [t(view.lang, 'subpoint'), view.subpoint],
      [t(view.lang, 'fov'), view.fov],
    ];

    rowsEl.innerHTML = '';

    const typeRow = document.createElement('div');
    typeRow.className = 'detail-row';
    const typeKey = document.createElement('span');
    typeKey.className = 'key';
    typeKey.append(t(view.lang, 'orbitType'));
    const infoIcon = document.createElement('span');
    infoIcon.className = 'info-icon';
    infoIcon.tabIndex = 0;
    infoIcon.textContent = 'i';
    infoIcon.setAttribute('aria-label', t(view.lang, 'orbitTypeHint'));
    const tip = document.createElement('span');
    tip.className = 'info-tip';
    const tipTitle = document.createElement('strong');
    tipTitle.textContent = `${view.typeName} · ${view.typeNameEn}`;
    tip.append(tipTitle, document.createTextNode(view.typeDesc));
    infoIcon.appendChild(tip);
    typeKey.appendChild(infoIcon);

    const typeValue = document.createElement('span');
    typeValue.className = 'value detail-type';
    const dot = document.createElement('span');
    dot.className = 'type-dot';
    dot.style.background = view.typeColor;
    dot.style.boxShadow = `0 0 8px ${view.typeColor}`;
    typeValue.append(dot, document.createTextNode(view.typeName));
    typeRow.append(typeKey, typeValue);
    rowsEl.appendChild(typeRow);

    for (const [key, value] of rows) {
      const row = document.createElement('div');
      row.className = 'detail-row';
      const keyEl = document.createElement('span');
      keyEl.className = 'key';
      keyEl.textContent = key;
      const valueEl = document.createElement('span');
      valueEl.className = 'value';
      valueEl.textContent = value;
      row.append(keyEl, valueEl);
      rowsEl.appendChild(row);
    }
  }

  return {
    update(view) {
      if (!view) {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      nameEl.textContent = view.name;
      subtitleEl.textContent = view.subtitle;
      descEl.textContent = view.description;
      descEl.hidden = view.description.length === 0;
      lockButton.textContent = view.locked ? t(view.lang, 'unlock') : t(view.lang, 'lock');
      renderRows(view);
    },
  };
}
