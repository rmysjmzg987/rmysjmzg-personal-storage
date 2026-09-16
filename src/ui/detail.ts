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
  /** 取景模式：俯视 / 正视 */
  viewMode: 'nadir' | 'side';
}

export interface DetailCallbacks {
  onClose(): void;
  onToggleLock(): void;
  onToggleView(): void;
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
      <button class="hud-btn" data-role="view"></button>
      <button class="hud-btn hud-btn-primary" data-role="lock"></button>
    </div>
  `;
  root.appendChild(card);

  const nameEl = card.querySelector<HTMLElement>('[data-role="name"]')!;
  const subtitleEl = card.querySelector<HTMLElement>('[data-role="subtitle"]')!;
  const rowsEl = card.querySelector<HTMLElement>('.detail-rows')!;
  const descEl = card.querySelector<HTMLElement>('[data-role="desc"]')!;
  const lockButton = card.querySelector<HTMLButtonElement>('[data-role="lock"]')!;
  const viewButton = card.querySelector<HTMLButtonElement>('[data-role="view"]')!;
  const closeButton = card.querySelector<HTMLButtonElement>('[data-role="close"]')!;

  closeButton.addEventListener('click', () => callbacks.onClose());
  lockButton.addEventListener('click', () => callbacks.onToggleLock());
  viewButton.addEventListener('click', () => callbacks.onToggleView());
  // 指针停在卡片上时冻结数值刷新：悬停 (i) 图标时不再改动 DOM，
  // 从根上避免提示气泡被打断造成的闪烁/抖动
  let pointerInside = false;
  card.addEventListener('pointerenter', () => {
    pointerInside = true;
  });
  card.addEventListener('pointerleave', () => {
    pointerInside = false;
  });

  // 行结构只建一次：详情每 320ms 刷新，重建 DOM 会让悬停中的轨道说明闪烁
  const ROW_KEYS = ['altitude', 'speed', 'period', 'inclination', 'eccentricity', 'subpoint', 'fov'] as const;

  const typeRow = document.createElement('div');
  typeRow.className = 'detail-row';
  const typeKey = document.createElement('span');
  typeKey.className = 'key';
  const typeKeyText = document.createElement('span');
  typeKeyText.dataset.role = 'type-key';
  const infoIcon = document.createElement('span');
  infoIcon.className = 'info-icon';
  infoIcon.tabIndex = 0;
  infoIcon.textContent = 'i';
  const tip = document.createElement('span');
  tip.className = 'info-tip';
  const tipTitle = document.createElement('strong');
  const tipBody = document.createElement('span');
  tipBody.className = 'info-tip-body';
  tip.append(tipTitle, tipBody);
  infoIcon.appendChild(tip);
  typeKey.append(typeKeyText, infoIcon);

  const typeValue = document.createElement('span');
  typeValue.className = 'value detail-type';
  const typeDot = document.createElement('span');
  typeDot.className = 'type-dot';
  const typeNameEl = document.createElement('span');
  typeValue.append(typeDot, typeNameEl);
  typeRow.append(typeKey, typeValue);
  rowsEl.appendChild(typeRow);

  const rowValues = new Map<string, HTMLElement>();
  const rowKeys = new Map<string, HTMLElement>();
  for (const key of ROW_KEYS) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    const keyEl = document.createElement('span');
    keyEl.className = 'key';
    const valueEl = document.createElement('span');
    valueEl.className = 'value';
    row.append(keyEl, valueEl);
    rowsEl.appendChild(row);
    rowKeys.set(key, keyEl);
    rowValues.set(key, valueEl);
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
      viewButton.textContent = view.viewMode === 'side' ? t(view.lang, 'viewModeSide') : t(view.lang, 'viewModeNadir');
      viewButton.title = t(view.lang, 'viewModeHint');
      viewButton.setAttribute('aria-label', t(view.lang, 'viewModeHint'));
      viewButton.disabled = !view.locked;

      if (pointerInside) return;

      typeKeyText.textContent = t(view.lang, 'orbitType');
      infoIcon.setAttribute('aria-label', t(view.lang, 'orbitTypeHint'));
      tipTitle.textContent = `${view.typeName} · ${view.typeNameEn}`;
      tipBody.textContent = view.typeDesc;
      typeDot.style.background = view.typeColor;
      typeDot.style.boxShadow = `0 0 8px ${view.typeColor}`;
      typeNameEl.textContent = view.typeName;

      const values: Record<(typeof ROW_KEYS)[number], string> = {
        altitude: view.altitude,
        speed: view.speed,
        period: view.period,
        inclination: view.inclination,
        eccentricity: view.eccentricity,
        subpoint: view.subpoint,
        fov: view.fov,
      };
      for (const key of ROW_KEYS) {
        rowKeys.get(key)!.textContent = t(view.lang, key);
        const valueEl = rowValues.get(key)!;
        if (valueEl.textContent !== values[key]) valueEl.textContent = values[key];
      }
    },
  };
}
