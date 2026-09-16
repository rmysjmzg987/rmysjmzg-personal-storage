import { t, type Lang } from './i18n';
import {
  TEMPLATES,
  elementsFromForm,
  elementsToTle,
  parseTle,
  validateElements,
  type ElementFormValues,
  type ValidationResult,
} from '../orbit/elements';
import { CUSTOM_GROUP, type CustomStoreData } from '../orbit/custom';
import type { SatelliteMeta } from '../orbit/types';

export interface AddSatelliteEntry {
  noradId: number;
  name: string;
  secondary: string;
  /** 额外可搜索的名称（如中英双语原名），用于跨语言匹配 */
  aliases: string[];
  groupKey: string;
  groupLabel: string;
  kind: 'preset' | 'library' | 'custom';
  active: boolean;
  typeLabel: string;
  altitudeLabel: string;
}

export interface AddSatelliteCallbacks {
  lang(): Lang;
  entries(): AddSatelliteEntry[];
  nextNoradId(): number;
  onAddCustom(meta: SatelliteMeta): void;
  onToggle(noradId: number): void;
  /** 恢复为默认显示：只保留预制卫星，清掉库卫星与自定义卫星 */
  onRestoreDefaults(): void;
  /** 清空场景里的全部卫星 */
  onRemoveAll(): void;
  /** 原始 JSON 文本，由调用方解析并提示失败 */
  onImport(rawText: string): void;
  exportData(): CustomStoreData;
  notify(message: string): void;
}

export interface AddSatelliteHandle {
  open(): void;
  close(): void;
  /** 语言切换时重绘文案（弹窗关闭时无操作） */
  refresh(): void;
  isOpen(): boolean;
}

type TabKey = 'library' | 'manage' | 'tle' | 'elements';

const ERROR_KEYS: Record<string, string> = {
  'perigee-too-low': 'errPerigeeTooLow',
  'perigee-too-high': 'errPerigeeTooHigh',
  'eccentricity-out-of-range': 'errEccentricity',
  'inclination-out-of-range': 'errInclination',
  'fov-out-of-range': 'errFov',
  'raan-not-finite': 'errAngles',
  'arg-perigee-not-finite': 'errAngles',
  'mean-anomaly-not-finite': 'errAngles',
};

const WARN_KEYS: Record<string, string> = {
  'very-low-orbit': 'warnVeryLow',
  'heo-low-inclination': 'warnHeoLowInc',
  'very-high-apogee': 'warnHighApogee',
};

const NUMBER_FIELDS: { key: keyof ElementFormValues; labelKey: string; step: number; min?: number; max?: number }[] = [
  { key: 'altitudeKm', labelKey: 'fieldAltitude', step: 1 },
  { key: 'eccentricity', labelKey: 'fieldEccentricity', step: 0.0005, min: 0, max: 0.95 },
  { key: 'inclinationDeg', labelKey: 'fieldInclination', step: 0.1, min: 0, max: 180 },
  { key: 'raanDeg', labelKey: 'fieldRaan', step: 0.1 },
  { key: 'argPerigeeDeg', labelKey: 'fieldArgPerigee', step: 0.1 },
  { key: 'meanAnomalyDeg', labelKey: 'fieldMeanAnomaly', step: 0.1 },
];

const DEFAULT_TEMPLATE = TEMPLATES.find((entry) => entry.key === 'sso') ?? TEMPLATES[0];

export function mountAddSatellite(root: HTMLElement, callbacks: AddSatelliteCallbacks): AddSatelliteHandle {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'modal';
  panel.setAttribute('role', 'dialog');
  backdrop.appendChild(panel);

  const head = document.createElement('div');
  head.className = 'modal-head';
  const headText = document.createElement('div');
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  const subtitleEl = document.createElement('div');
  subtitleEl.className = 'modal-subtitle';
  headText.append(titleEl, subtitleEl);
  const closeButton = document.createElement('button');
  closeButton.className = 'detail-close';
  closeButton.type = 'button';
  closeButton.textContent = '×';
  head.append(headText, closeButton);

  const tabBar = document.createElement('div');
  tabBar.className = 'modal-tabs';
  const tabs: { key: TabKey; labelKey: string }[] = [
    { key: 'library', labelKey: 'tabLibrary' },
    { key: 'manage', labelKey: 'tabManage' },
    { key: 'tle', labelKey: 'tabTle' },
    { key: 'elements', labelKey: 'tabElements' },
  ];
  const tabButtons = new Map<TabKey, HTMLButtonElement>();
  for (const tab of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'modal-tab';
    button.dataset.tab = tab.key;
    button.dataset.labelKey = tab.labelKey;
    button.addEventListener('click', () => setTab(tab.key));
    tabBar.appendChild(button);
    tabButtons.set(tab.key, button);
  }

  const body = document.createElement('div');
  body.className = 'modal-body';

  // ---- 卫星库 ----
  const libraryPanel = document.createElement('div');
  libraryPanel.className = 'modal-panel';
  libraryPanel.dataset.panel = 'library';
  const searchInput = document.createElement('input');
  searchInput.className = 'modal-input';
  searchInput.type = 'search';
  searchInput.addEventListener('input', () => renderLibrary());
  const libraryList = document.createElement('div');
  libraryList.className = 'library-list';
  libraryPanel.append(searchInput, libraryList);

  // ---- 卫星管理 ----
  const managePanel = document.createElement('div');
  managePanel.className = 'modal-panel';
  managePanel.dataset.panel = 'manage';
  const manageHint = document.createElement('div');
  manageHint.className = 'modal-hint';
  manageHint.dataset.role = 'manage-hint';
  const manageActions = document.createElement('div');
  manageActions.className = 'manage-actions';
  const restoreButton = document.createElement('button');
  restoreButton.type = 'button';
  restoreButton.className = 'hud-btn';
  restoreButton.dataset.role = 'restore';
  const removeAllButton = document.createElement('button');
  removeAllButton.type = 'button';
  removeAllButton.className = 'hud-btn';
  removeAllButton.dataset.role = 'remove-all';
  manageActions.append(restoreButton, removeAllButton);
  const manageList = document.createElement('div');
  manageList.className = 'library-list manage-list';
  managePanel.append(manageHint, manageActions, manageList);

  // ---- 粘贴 TLE ----
  const tlePanel = document.createElement('div');
  tlePanel.className = 'modal-panel';
  tlePanel.dataset.panel = 'tle';
  const tleHint = document.createElement('div');
  tleHint.className = 'modal-hint';
  const tleText = document.createElement('textarea');
  tleText.className = 'modal-textarea';
  tleText.rows = 5;
  tleText.spellcheck = false;
  const tleName = document.createElement('input');
  tleName.className = 'modal-input';
  tleName.type = 'text';
  const tleStatus = document.createElement('div');
  tleStatus.className = 'modal-status';
  tlePanel.append(tleHint, tleText, tleName, tleStatus);

  // ---- 轨道根数 ----
  const elementPanel = document.createElement('div');
  elementPanel.className = 'modal-panel';
  elementPanel.dataset.panel = 'elements';
  const templateRow = document.createElement('div');
  templateRow.className = 'template-row';
  const templateButtons = new Map<string, HTMLButtonElement>();
  for (const template of TEMPLATES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-btn';
    button.dataset.template = template.key;
    button.addEventListener('click', () => {
      fillForm(template.values);
      renderElementStatus(null);
    });
    templateRow.appendChild(button);
    templateButtons.set(template.key, button);
  }
  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'field-grid';
  const nameField = document.createElement('input');
  nameField.className = 'modal-input';
  nameField.type = 'text';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'modal-field modal-field-wide';
  const nameLabelText = document.createElement('span');
  nameLabel.append(nameLabelText, nameField);
  fieldGrid.appendChild(nameLabel);
  const elementInputs = new Map<string, HTMLInputElement>();
  const elementLabels = new Map<string, HTMLSpanElement>();
  for (const field of NUMBER_FIELDS) {
    const label = document.createElement('label');
    label.className = 'modal-field';
    const labelText = document.createElement('span');
    const input = document.createElement('input');
    input.className = 'modal-input';
    input.type = 'number';
    input.step = String(field.step);
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    input.addEventListener('input', () => renderElementStatus(null));
    label.append(labelText, input);
    fieldGrid.appendChild(label);
    elementInputs.set(field.key, input);
    elementLabels.set(field.key, labelText);
  }
  const elementStatus = document.createElement('div');
  elementStatus.className = 'modal-status';
  elementPanel.append(templateRow, fieldGrid, elementStatus);

  body.append(libraryPanel, managePanel, tlePanel, elementPanel);

  // ---- 底部操作 ----
  const foot = document.createElement('div');
  foot.className = 'modal-foot';
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'hud-btn';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'hud-btn';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  const spacer = document.createElement('span');
  spacer.className = 'modal-spacer';
  const fovWrap = document.createElement('label');
  fovWrap.className = 'modal-field modal-field-inline';
  const fovLabelText = document.createElement('span');
  const fovInput = document.createElement('input');
  fovInput.className = 'modal-input modal-input-sm';
  fovInput.type = 'number';
  fovInput.min = '0.1';
  fovInput.max = '174';
  fovInput.step = '0.1';
  fovInput.value = '20';
  fovWrap.append(fovLabelText, fovInput);
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'hud-btn';
  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'hud-btn hud-btn-primary';
  foot.append(importButton, fileInput, exportButton, spacer, fovWrap, cancelButton, submitButton);

  panel.append(head, tabBar, body, foot);
  root.appendChild(backdrop);

  let activeTab: TabKey = 'library';
  let open = false;
  /** 「全部移除」的二次确认状态 */
  let removeAllArmed = false;
  let armTimer: number | undefined;

  function lang(): Lang {
    return callbacks.lang();
  }

  function setTab(tab: TabKey): void {
    activeTab = tab;
    for (const [key, button] of tabButtons) button.classList.toggle('is-active', key === tab);
    for (const section of [libraryPanel, managePanel, tlePanel, elementPanel]) {
      section.classList.toggle('is-active', section.dataset.panel === tab);
    }
    const editable = tab === 'tle' || tab === 'elements';
    fovWrap.hidden = !editable;
    submitButton.hidden = !editable;
    if (tab === 'library') renderLibrary();
    if (tab === 'manage') renderManage();
  }

  function renderText(): void {
    const language = lang();
    titleEl.textContent = t(language, 'addTitle');
    subtitleEl.textContent = t(language, 'addSubtitle');
    for (const [key, button] of tabButtons) {
      button.textContent = t(language, button.dataset.labelKey ?? key);
    }
    for (const [key, button] of templateButtons) {
      const template = TEMPLATES.find((entry) => entry.key === key)!;
      button.textContent = language === 'zh' ? template.zh : template.en;
    }
    searchInput.placeholder = t(language, 'libSearch');
    tleHint.textContent = t(language, 'tleHint');
    tleText.placeholder = t(language, 'tlePlaceholder');
    tleName.placeholder = t(language, 'fieldNamePlaceholder');
    nameLabelText.textContent = t(language, 'fieldName');
    nameField.placeholder = t(language, 'fieldNamePlaceholder');
    for (const field of NUMBER_FIELDS) elementLabels.get(field.key)!.textContent = t(language, field.labelKey);
    fovLabelText.textContent = t(language, 'fieldFov');
    importButton.textContent = t(language, 'btnImport');
    exportButton.textContent = t(language, 'btnExport');
    cancelButton.textContent = t(language, 'btnCancel');
    submitButton.textContent = t(language, 'confirmAdd');
  }

  function formatStatus(parts: { text: string; kind: 'error' | 'warn' | 'ok' }[], element: HTMLElement): void {
    element.textContent = '';
    element.classList.toggle('is-error', parts.some((part) => part.kind === 'error'));
    element.classList.toggle('is-warn', !parts.some((part) => part.kind === 'error') && parts.some((part) => part.kind === 'warn'));
    if (parts.length === 0) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    element.textContent = parts.map((part) => part.text).join(' · ');
  }

  function renderElementStatus(result: ValidationResult | null): void {
    const language = lang();
    if (!result) {
      formatStatus([], elementStatus);
      return;
    }
    const parts: { text: string; kind: 'error' | 'warn' | 'ok' }[] = [];
    for (const error of result.errors) parts.push({ text: t(language, ERROR_KEYS[error] ?? error), kind: 'error' });
    for (const warning of result.warnings) parts.push({ text: t(language, WARN_KEYS[warning] ?? warning), kind: 'warn' });
    formatStatus(parts, elementStatus);
  }

  function renderTleStatus(): void {
    const language = lang();
    const text = tleText.value.trim();
    if (text.length === 0) {
      formatStatus([], tleStatus);
      return;
    }
    const parsed = parseTle(text);
    tleText.classList.toggle('is-error', !parsed);
    if (!parsed) {
      formatStatus([{ text: t(language, 'tleInvalid'), kind: 'error' }], tleStatus);
      return;
    }
    if (parsed.name && tleName.value.trim().length === 0) tleName.value = parsed.name;
    formatStatus([{ text: t(language, 'tleParsed', { noradId: parsed.noradId }), kind: 'ok' }], tleStatus);
  }

  function readForm(): ElementFormValues | null {
    const readNumber = (key: string): number => Number.parseFloat(elementInputs.get(key)!.value);
    const values: ElementFormValues = {
      name: nameField.value.trim(),
      altitudeKm: readNumber('altitudeKm'),
      eccentricity: readNumber('eccentricity'),
      inclinationDeg: readNumber('inclinationDeg'),
      raanDeg: readNumber('raanDeg'),
      argPerigeeDeg: readNumber('argPerigeeDeg'),
      meanAnomalyDeg: readNumber('meanAnomalyDeg'),
      fovDeg: Number.parseFloat(fovInput.value),
      epoch: new Date(),
    };
    return values;
  }

  function fillForm(values: Omit<ElementFormValues, 'name' | 'epoch'>): void {
    for (const field of NUMBER_FIELDS) {
      const value = values[field.key as keyof typeof values];
      if (typeof value === 'number') elementInputs.get(field.key)!.value = String(value);
    }
    fovInput.value = String(values.fovDeg);
  }

  function renderLibrary(): void {
    const language = lang();
    const query = searchInput.value.trim().toLowerCase();
    libraryList.textContent = '';
    const entries = callbacks
      .entries()
      .filter((entry) => query.length === 0 || `${entry.name} ${entry.secondary} ${entry.groupLabel}`.toLowerCase().includes(query));

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'library-empty';
      empty.textContent = t(language, 'libEmpty');
      libraryList.appendChild(empty);
      return;
    }

    let currentGroup = '';
    for (const entry of entries) {
      if (entry.groupKey !== currentGroup) {
        currentGroup = entry.groupKey;
        const groupTitle = document.createElement('div');
        groupTitle.className = 'library-group';
        groupTitle.textContent = entry.groupLabel;
        libraryList.appendChild(groupTitle);
      }
      const item = document.createElement('div');
      item.className = 'library-item';
      item.dataset.kind = entry.kind;
      item.classList.toggle('is-active', entry.active);

      const info = document.createElement('div');
      info.className = 'library-info';
      const nameRow = document.createElement('div');
      nameRow.className = 'library-name';
      nameRow.appendChild(document.createTextNode(entry.name));
      const badge = document.createElement('span');
      badge.className = 'library-badge';
      badge.textContent = t(language, entry.kind === 'preset' ? 'libPreset' : entry.kind === 'custom' ? 'libCustom' : 'libAdd');
      badge.hidden = entry.kind === 'library';
      nameRow.appendChild(badge);
      const meta = document.createElement('div');
      meta.className = 'library-meta';
      meta.textContent = [entry.secondary, entry.typeLabel, entry.altitudeLabel].filter((part) => part.length > 0).join(' · ');
      info.append(nameRow, meta);

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'hud-btn library-btn';
      action.textContent = t(language, entry.active ? 'libRemove' : 'libAdd');
      action.classList.toggle('is-active', entry.active);
      action.addEventListener('click', () => {
        callbacks.onToggle(entry.noradId);
        renderLibrary();
        if (open && activeTab === 'manage') renderManage();
      });
      item.append(info, action);
      libraryList.appendChild(item);
    }
  }

  /** 管理页：列出场景中当前显示的卫星，逐个移除或一键恢复/清空 */
  function renderManage(): void {
    const language = lang();
    manageHint.textContent = t(language, 'manageHint');
    restoreButton.textContent = t(language, 'manageRestore');
    removeAllButton.textContent = t(language, removeAllArmed ? 'manageRemoveAllConfirm' : 'manageRemoveAll');
    removeAllButton.classList.toggle('is-armed', removeAllArmed);
    manageList.textContent = '';

    const active = callbacks.entries().filter((entry) => entry.active);
    if (active.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'library-empty';
      empty.textContent = t(language, 'manageEmpty');
      manageList.appendChild(empty);
      return;
    }

    for (const entry of active) {
      const item = document.createElement('div');
      item.className = 'library-item is-active';
      item.dataset.kind = entry.kind;
      const info = document.createElement('div');
      info.className = 'library-info';
      const nameRow = document.createElement('div');
      nameRow.className = 'library-name';
      nameRow.appendChild(document.createTextNode(entry.name));
      const badge = document.createElement('span');
      badge.className = 'library-badge';
      badge.textContent = t(
        language,
        entry.kind === 'preset' ? 'libPreset' : entry.kind === 'custom' ? 'libCustom' : 'libAdd',
      );
      nameRow.appendChild(badge);
      const meta = document.createElement('div');
      meta.className = 'library-meta';
      meta.textContent = [entry.groupLabel, entry.typeLabel, entry.altitudeLabel]
        .filter((part) => part.length > 0)
        .join(' · ');
      info.append(nameRow, meta);

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'hud-btn library-btn is-active';
      action.dataset.role = 'remove';
      action.textContent = t(language, 'libRemove');
      action.addEventListener('click', () => {
        callbacks.onToggle(entry.noradId);
        renderManage();
        if (open && activeTab === 'library') renderLibrary();
      });
      item.append(info, action);
      manageList.appendChild(item);
    }
  }

  function submitCustom(): void {
    const language = lang();
    const name = nameField.value.trim();
    const values = readForm();
    if (!values) return;
    const result = validateElements(values);
    if (!result.ok) {
      renderElementStatus(result);
      return;
    }
    const noradId = callbacks.nextNoradId();
    const elements = elementsFromForm({ ...values, name: name || `SAT-${noradId}` });
    const tle = elementsToTle(elements, noradId);
    callbacks.onAddCustom({
      noradId,
      name: name || `SAT-${noradId}`,
      label: name || `SAT-${noradId}`,
      group: CUSTOM_GROUP,
      fovDeg: values.fovDeg,
      tle1: tle.line1,
      tle2: tle.line2,
      descZh: t(language, 'customDesc', { altitude: values.altitudeKm.toFixed(0) }),
      descEn: t(language, 'customDesc', { altitude: values.altitudeKm.toFixed(0) }),
    });
  }

  function submitTle(): void {
    const parsed = parseTle(tleText.value);
    if (!parsed) {
      renderTleStatus();
      return;
    }
    const fallbackName = `CUSTOM-${parsed.noradId}`;
    const name = tleName.value.trim() || parsed.name || fallbackName;
    callbacks.onAddCustom({
      noradId: parsed.noradId,
      name,
      label: name,
      group: CUSTOM_GROUP,
      fovDeg: Number.parseFloat(fovInput.value) || 20,
      tle1: parsed.line1,
      tle2: parsed.line2,
      descZh: t(lang(), 'customDescTle'),
      descEn: t(lang(), 'customDescTle'),
    });
  }

  function openDialog(): void {
    open = true;
    backdrop.hidden = false;
    renderText();
    if (tleText.value.trim().length === 0) {
      const template = DEFAULT_TEMPLATE.values;
      fillForm(template);
    }
    setTab('library');
    renderTleStatus();
    renderLibrary();
  }

  function closeDialog(): void {
    open = false;
    backdrop.hidden = true;
  }

  function refreshDialog(): void {
    if (!open) return;
    renderText();
    renderTleStatus();
    if (activeTab === 'library') renderLibrary();
    if (activeTab === 'manage') renderManage();
  }

  closeButton.addEventListener('click', closeDialog);
  cancelButton.addEventListener('click', closeDialog);
  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) closeDialog();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) closeDialog();
  });

  tleText.addEventListener('input', renderTleStatus);
  submitButton.addEventListener('click', () => {
    if (activeTab === 'tle') submitTle();
    else if (activeTab === 'elements') submitCustom();
  });

  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void file.text().then((text) => callbacks.onImport(text));
  });
  exportButton.addEventListener('click', () => {
    const data = JSON.stringify(callbacks.exportData(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'satviz-satellites.json';
    anchor.click();
    URL.revokeObjectURL(url);
    callbacks.notify(t(lang(), 'toastExported'));
  });

  restoreButton.addEventListener('click', () => {
    callbacks.onRestoreDefaults();
    renderManage();
    renderLibrary();
  });
  removeAllButton.addEventListener('click', () => {
    // 自定义卫星是用户自己加的，「全部移除」连它们一起删，所以要点两次确认
    if (!removeAllArmed) {
      removeAllArmed = true;
      renderManage();
      window.clearTimeout(armTimer);
      armTimer = window.setTimeout(() => {
        removeAllArmed = false;
        renderManage();
      }, 4000);
      return;
    }
    window.clearTimeout(armTimer);
    removeAllArmed = false;
    callbacks.onRemoveAll();
    renderManage();
    renderLibrary();
  });

  return {
    open: openDialog,
    close: closeDialog,
    refresh: refreshDialog,
    isOpen: () => open,
  };
}
