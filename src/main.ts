import './styles/main.css';
import { createSceneContext } from './core/scene';
import { createClock } from './core/clock';
import {
  julianDate,
  gmstRadians,
  eciToEcef,
  ecefToGeodetic,
  geodeticToEcef,
  rotateZ,
  EARTH_RADIUS_KM,
} from './core/frames';
import { sunDirectionEci } from './core/sun';
import { createEarth } from './core/earth';
import { resolveTextureUrl } from './core/earth-texture';
import { createStarfield } from './viz/starfield';
import { createGraticule } from './viz/graticule';
import {
  createFpsSampler,
  qualitySettings,
  shouldDowngrade,
  nextLowerLevel,
  type QualityLevel,
} from './core/quality';
import { createFollowController } from './core/followCamera';
import { loadData, displayName, buildRecord, type DataBundle } from './orbit/catalog';
import type { SatelliteRecord } from './orbit/types';
import {
  nextCustomNoradId,
  parseStore,
  readStore,
  writeStore,
  type CustomStoreData,
} from './orbit/custom';
import { mountAddSatellite, type AddSatelliteEntry } from './ui/addSatellite';
import { createSatelliteScene, type SatelliteSceneHandle } from './viz/satelliteScene';
import { createFootprint } from './viz/footprint';
import {
  createCityLabels,
  cityKey,
  isCityWithin,
  cityHighlightRadius,
  cityPassRadius,
  createSweepMemory,
  type CityLabelHandle,
} from './ui/cityLabels';
import { mountHud, type HudState, type LayerKey } from './ui/hud';
import { mountDetail, type DetailView } from './ui/detail';
import { mountSearchBar } from './ui/searchBar';
import { t, type Lang } from './ui/i18n';

const FALLBACK_SNAPSHOT = '2026-09-16';
const HEO_PERIGEE = 0.25;

function formatDegrees(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(2)}° ${hemisphere}`;
}

function formatPeriod(seconds: number | null, lang: Lang): string {
  if (!seconds) return '—';
  const minutes = seconds / 60;
  if (minutes < 90) return `${minutes.toFixed(1)} ${lang === 'zh' ? '分钟' : 'min'}`;
  const hours = minutes / 60;
  return `${hours.toFixed(2)} ${lang === 'zh' ? '小时' : 'h'}`;
}

/** 相机锁定距离：按轨道类型取景（规格 §4 的相机策略） */
function lockDistanceFor(record: SatelliteRecord): number {
  switch (record.derived.orbitClass) {
    case 'geo':
      return 26000;
    case 'igso':
      return 16000;
    case 'meo':
      return 9000;
    case 'heo':
      return 14000;
    default:
      return 2400;
  }
}

async function bootstrap(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const hudRoot = document.querySelector<HTMLElement>('#hud');
  if (!canvas || !hudRoot) throw new Error('missing #stage or #hud in index.html');

  const ctx = createSceneContext(canvas);
  const base = import.meta.env.BASE_URL;

  let quality: QualityLevel = 'medium';
  let settings = qualitySettings(quality);

  const clock = createClock({ rate: 60 });
  const follow = createFollowController({ camera: ctx.camera, controls: ctx.controls });

  const sun = sunDirectionEci(clock.now());
  const view = rotateZ(sun, 0.45);
  const distance = 24000;
  ctx.camera.position.set(view.x * distance, view.y * distance, view.z * distance + 5200);
  ctx.camera.lookAt(0, 0, 0);
  ctx.controls.update();

  const dayUrl = await resolveTextureUrl(base + 'textures/earth-day.jpg');
  const nightUrl = await resolveTextureUrl(base + 'textures/earth-night.jpg');
  const earth = await createEarth({
    dayUrl,
    nightUrl,
    maxAnisotropy: ctx.renderer.capabilities.getMaxAnisotropy(),
    maxTextureSize: ctx.renderer.capabilities.maxTextureSize,
  });
  ctx.scene.add(earth.group);

  const starfield = createStarfield(settings.starCount);
  ctx.scene.add(starfield);
  const graticule = createGraticule(EARTH_RADIUS_KM * 1.001);
  earth.group.add(graticule);
  const footprint = createFootprint();
  ctx.scene.add(footprint.group);

  // ---- 状态 ----
  const state = {
    lang: 'zh' as Lang,
    selectedId: null as string | null,
    hoveredId: null as string | null,
    locked: false,
    layers: { footprint: true, graticule: true, orbits: true } as Record<LayerKey, boolean>,
    snapshotDate: FALLBACK_SNAPSHOT,
    sourceLabel: 'CelesTrak',
    fps: 0,
  };

  let data: DataBundle | null = null;
  let satelliteScene: SatelliteSceneHandle | null = null;
  let records: SatelliteRecord[] = [];
  let customStore: CustomStoreData = readStore();
  let cityLabels: CityLabelHandle | null = null;
  let cityUnits: { key: string; unit: { x: number; y: number; z: number } }[] = [];
  const coveredCities = new Set<string>();
  const sweepMemory = createSweepMemory();
  const sweptScratch: string[] = [];
  const emptySwept = new Set<string>();
  let sweptCities: Set<string> = emptySwept;

  const recordById = (id: string | null) => (id ? records.find((record) => record.id === id) ?? null : null);
  const selectedRecord = () => recordById(state.selectedId);

  // ---- 自定义卫星：预制 + 启用的库卫星 + 用户自定义 ----
  function rebuildRecords(): SatelliteRecord[] {
    if (!data) return [];
    const enabled = new Set(customStore.enabledLibraryIds);
    const hidden = new Set(customStore.hiddenPresetIds);
    const base = data.records.filter((record) =>
      record.preset ? !hidden.has(record.noradId) : enabled.has(record.noradId),
    );
    const custom = customStore.customSatellites.map((meta) =>
      buildRecord(meta, data!.orbitTypeByKey, { custom: true, idPrefix: 'user' }),
    );
    return [...base, ...custom];
  }

  function persistStore(): void {
    writeStore(customStore);
  }

  function refreshScene(): void {
    if (!data) return;
    records = rebuildRecords();
    satelliteScene?.setRecords(records);
    if (state.selectedId && !records.some((record) => record.id === state.selectedId)) {
      clearSelection();
    } else if (state.selectedId) {
      updateDetail();
    }
    hud.refresh();
  }

  function altitudeRangeLabel(record: SatelliteRecord): string {
    const perigee = record.derived.perigeeAltitudeKm;
    const apogee = record.derived.apogeeAltitudeKm;
    if (!Number.isFinite(perigee) || !Number.isFinite(apogee)) return '—';
    if (Math.abs(apogee - perigee) < 40) return `≈ ${perigee.toFixed(0)} km`;
    return `${perigee.toFixed(0)}–${apogee.toFixed(0)} km`;
  }

  function entryOf(record: SatelliteRecord, kind: AddSatelliteEntry['kind'], active: boolean): AddSatelliteEntry {
    const lang = state.lang;
    const type = data?.orbitTypeByKey.get(record.derived.orbitClass);
    return {
      noradId: record.noradId,
      name: displayName(record, lang),
      secondary: lang === 'zh' ? record.label ?? '' : record.labelZh ?? '',
      // 中英原名都进搜索索引，中文界面同样能用 "sentinel" / "landsat" 搜到
      aliases: [record.name, record.label ?? '', record.labelZh ?? ''],
      groupKey: kind === 'custom' ? 'custom' : record.group,
      groupLabel:
        kind === 'custom'
          ? t(lang, 'libCustom')
          : (data?.groups.find((group) => group.key === record.group)?.[lang === 'zh' ? 'zh' : 'en'] ?? record.group),
      kind,
      active,
      typeLabel: type ? (lang === 'zh' ? type.zh : type.en) : record.derived.orbitClass,
      altitudeLabel: altitudeRangeLabel(record),
    };
  }

  function libraryEntries(): AddSatelliteEntry[] {
    if (!data) return [];
    const activeIds = new Set(records.map((record) => record.id));
    const hiddenPresetIds = new Set(customStore.hiddenPresetIds);
    const groupOrder = new Map(data.groups.map((group, index) => [group.key, index]));
    const entries: AddSatelliteEntry[] = [];
    for (const record of data.records) {
      entries.push(
        entryOf(
          record,
          record.preset ? 'preset' : 'library',
          activeIds.has(record.id) || (record.preset === true && !hiddenPresetIds.has(record.noradId)),
        ),
      );
    }
    for (const record of records) {
      if (record.custom) entries.push(entryOf(record, 'custom', true));
    }
    // 同一分组的预设与库卫星排在一起，分组顺序沿用 catalog 定义
    entries.sort((a, b) => {
      const orderA = groupOrder.get(a.groupKey) ?? groupOrder.size;
      const orderB = groupOrder.get(b.groupKey) ?? groupOrder.size;
      if (orderA !== orderB) return orderA - orderB;
      if (a.kind === b.kind) return 0;
      if (a.kind === 'preset') return -1;
      if (b.kind === 'preset') return 1;
      return a.kind === 'library' ? -1 : 1;
    });
    return entries;
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'hover-tip';
  tooltip.hidden = true;
  hudRoot.appendChild(tooltip);

  const detailRoot = document.createElement('div');
  hudRoot.appendChild(detailRoot);

  const toast = document.createElement('div');
  toast.className = 'toast';
  hudRoot.appendChild(toast);

  const debugEl = document.createElement('div');
  debugEl.className = 'hud-debug';
  // 在地址后加 #debug 可打开相机与图层调试信息
  const debugEnabled = window.location.hash.includes('debug') || window.location.search.includes('debug');
  if (debugEnabled) hudRoot.appendChild(debugEl);
  let toastTimer: number | undefined;
  const showToast = (message: string) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  };

  function updateDetail(): void {
    const record = selectedRecord();
    if (!record) {
      detail.update(null);
      return;
    }
    const simTime = clock.now();
    const position = record.propagator.positionEciKm(simTime);
    const velocity = record.propagator.velocityEciKmS(simTime);
    const type = data?.orbitTypeByKey.get(record.derived.orbitClass);
    const ecef = position ? eciToEcef(position, gmstRadians(julianDate(simTime))) : null;
    const geodetic = ecef ? ecefToGeodetic(ecef) : null;
    const speed = velocity ? Math.hypot(velocity.x, velocity.y, velocity.z) : null;
    const altitude = position ? Math.hypot(position.x, position.y, position.z) - EARTH_RADIUS_KM : null;

    const view: DetailView = {
      lang: state.lang,
      name: displayName(record, state.lang),
      subtitle: `NORAD ${record.noradId} · ${record.custom ? (state.lang === 'zh' ? '自定义' : 'custom') : 'CelesTrak TLE'}`,
      typeName: type ? (state.lang === 'zh' ? type.zh : type.en) : record.derived.orbitClass,
      typeNameEn: type ? type.en : '',
      typeDesc: type ? (state.lang === 'zh' ? type.descZh : type.descEn) : '',
      typeColor: record.colorHex,
      altitude: `${altitude === null ? '—' : altitude.toFixed(0)} km`,
      speed: `${speed === null ? '—' : speed.toFixed(2)} km/s`,
      period: formatPeriod(record.derived.periodSeconds, state.lang),
      inclination: `${record.derived.inclinationDeg.toFixed(2)}°`,
      eccentricity: record.derived.eccentricity.toFixed(4),
      subpoint: geodetic
        ? `${formatDegrees(geodetic.latDeg, 'N', 'S')} ${formatDegrees(geodetic.lonDeg, 'E', 'W')}`
        : '—',
      fov: `${record.fovDeg.toFixed(1)}°`,
      description: state.lang === 'zh' ? record.descZh : record.descEn,
      locked: state.locked && state.selectedId === record.id,
      viewMode: follow.viewMode(),
    };
    detail.update(view);
  }

  function lockOn(record: SatelliteRecord): void {
    state.selectedId = record.id;
    state.locked = true;
    satelliteScene?.setSelected(record.id);
    const position = record.propagator.positionEciKm(clock.now());
    if (position) {
      follow.lock(record.id, position, lockDistanceFor(record));
      follow.setAdaptive(record.derived.eccentricity > HEO_PERIGEE);
    }
    updateDetail();
  }

  function clearSelection(): void {
    state.selectedId = null;
    state.locked = false;
    satelliteScene?.setSelected(null);
    follow.unlock();
    detail.update(null);
  }

  const addSatellite = mountAddSatellite(hudRoot, {
    lang: () => state.lang,
    entries: () => libraryEntries(),
    nextNoradId: () => nextCustomNoradId(records.map((record) => record.noradId)),
    onAddCustom: (meta) => {
      if (records.some((record) => record.noradId === meta.noradId)) {
        showToast(t(state.lang, 'toastExists', { name: meta.name }));
        return;
      }
      customStore.customSatellites.push(meta);
      persistStore();
      refreshScene();
      showToast(t(state.lang, 'toastCustomAdded', { name: meta.name }));
      addSatellite.close();
    },
    onToggle: (noradId) => {
      const customIndex = customStore.customSatellites.findIndex((sat) => sat.noradId === noradId);
      if (customIndex >= 0) {
        const [removed] = customStore.customSatellites.splice(customIndex, 1);
        persistStore();
        refreshScene();
        showToast(t(state.lang, 'toastRemoved', { name: removed.name }));
        return;
      }
      const meta = data?.records.find((record) => record.noradId === noradId);
      const name = meta ? displayName(meta, state.lang) : `NORAD ${noradId}`;
      // 预制卫星：从场景里移除／重新加回（记录在 hiddenPresetIds）
      if (meta?.preset) {
        const hidden = customStore.hiddenPresetIds.includes(noradId);
        customStore.hiddenPresetIds = hidden
          ? customStore.hiddenPresetIds.filter((id) => id !== noradId)
          : [...customStore.hiddenPresetIds, noradId];
        persistStore();
        refreshScene();
        showToast(t(state.lang, hidden ? 'toastAdded' : 'toastRemoved', { name }));
        return;
      }
      const enabled = customStore.enabledLibraryIds.includes(noradId);
      customStore.enabledLibraryIds = enabled
        ? customStore.enabledLibraryIds.filter((id) => id !== noradId)
        : [...customStore.enabledLibraryIds, noradId];
      persistStore();
      refreshScene();
      showToast(t(state.lang, enabled ? 'toastRemoved' : 'toastAdded', { name }));
    },
    onRestoreDefaults: () => {
      customStore.enabledLibraryIds = [];
      customStore.hiddenPresetIds = [];
      customStore.customSatellites = [];
      persistStore();
      refreshScene();
      showToast(t(state.lang, 'toastRestored'));
    },
    onRemoveAll: () => {
      customStore.enabledLibraryIds = [];
      customStore.customSatellites = [];
      customStore.hiddenPresetIds = (data?.records ?? [])
        .filter((record) => record.preset)
        .map((record) => record.noradId);
      persistStore();
      refreshScene();
      showToast(t(state.lang, 'toastCleared'));
    },
    onImport: (rawText) => {
      const parsed = parseStore(rawText);
      const count = parsed.customSatellites.length + parsed.enabledLibraryIds.length;
      if (count === 0) {
        showToast(t(state.lang, 'toastImportFailed'));
        return;
      }
      customStore = parsed;
      persistStore();
      refreshScene();
      showToast(t(state.lang, 'toastImported', { count }));
    },
    exportData: () => customStore,
    notify: (message) => showToast(message),
  });

  const detail = mountDetail(detailRoot, {
    onClose: () => clearSelection(),
    onToggleView: () => {
      if (!state.locked) return;
      follow.toggleViewMode();
      updateDetail();
    },
    onToggleLock: () => {
      const record = selectedRecord();
      if (!record) return;
      if (state.locked) {
        state.locked = false;
        follow.unlock();
      } else {
        lockOn(record);
        return;
      }
      updateDetail();
    },
  });

  /** 确保某颗卫星出现在场景里（预制卫星取消隐藏、库卫星加入启用列表） */
  function ensureVisible(noradId: number): SatelliteRecord | null {
    const existing = records.find((record) => record.noradId === noradId);
    if (existing) return existing;
    const meta = data?.records.find((record) => record.noradId === noradId);
    if (!meta) return null;
    if (meta.preset) {
      customStore.hiddenPresetIds = customStore.hiddenPresetIds.filter((id) => id !== noradId);
    } else if (!customStore.enabledLibraryIds.includes(noradId)) {
      customStore.enabledLibraryIds = [...customStore.enabledLibraryIds, noradId];
    }
    persistStore();
    refreshScene();
    return records.find((record) => record.noradId === noradId) ?? null;
  }

  const searchBar = mountSearchBar(hudRoot, {
    lang: () => state.lang,
    entries: () => libraryEntries(),
    onPick: (noradId) => {
      const record = ensureVisible(noradId);
      if (record) lockOn(record);
    },
  });

  const hud = mountHud(
    hudRoot,
    (): HudState => ({
      simTimeIso: clock.now().toISOString(),
      localTimeLabel: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      playing: clock.isPlaying(),
      rate: clock.rate(),
      fps: state.fps,
      snapshotDate: state.snapshotDate,
      quality,
      lang: state.lang,
      satelliteCount: records.length,
      visibleCount: satelliteScene?.visibleCount() ?? 0,
      sourceLabel: state.sourceLabel,
      layers: { ...state.layers },
      selectedName: state.selectedId ? displayName(selectedRecord()!, state.lang) : null,
    }),
    {
      onTogglePlay: () => clock.setPlaying(!clock.isPlaying()),
      onRate: (rate) => {
        clock.setRate(rate);
        clock.setPlaying(true);
      },
      onNow: () => {
        clock.resetToNow();
        showToast(state.lang === 'zh' ? '已回到本机当前时间' : 'Back to local time');
      },
      onToggleLang: () => {
        state.lang = state.lang === 'zh' ? 'en' : 'zh';
        hud.refresh();
        updateDetail();
        addSatellite.refresh();
        searchBar.refresh();
      },
      onToggleLayer: (key) => {
        state.layers[key] = !state.layers[key];
        if (key === 'graticule') graticule.visible = state.layers.graticule;
        if (key === 'orbits') satelliteScene?.setOrbitLinesVisible(state.layers.orbits);
        hud.refresh();
      },
      onAddSatellite: () => {
        addSatellite.open();
      },
    },
  );

  // ---- 交互 ----
  const pointer = { x: 0, y: 0, downX: 0, downY: 0, down: false, moved: false, button: 0 };

  function updateHover(): void {
    if (!satelliteScene) return;
    // 先找卫星点，找不到再找轨道线：高轨道卫星点太小，靠线条也能选
    const pointId = satelliteScene.pick(pointer.x, pointer.y, 24);
    const id = pointId ?? satelliteScene.pickOrbit(pointer.x, pointer.y, 10);
    if (id !== state.hoveredId) {
      state.hoveredId = id;
      satelliteScene.setHovered(id);
    }
    satelliteScene.setHoveredOrbit(pointId ? null : id);
    canvas!.classList.toggle('is-hovering-satellite', Boolean(id));
    const record = recordById(id);
    if (!record) {
      tooltip.hidden = true;
      return;
    }
    const position = record.propagator.positionEciKm(clock.now());
    const altitude = position ? Math.hypot(position.x, position.y, position.z) - EARTH_RADIUS_KM : null;
    tooltip.hidden = false;
    tooltip.style.left = `${pointer.x}px`;
    tooltip.style.top = `${pointer.y}px`;
    const type = data?.orbitTypeByKey.get(record.derived.orbitClass);
    tooltip.innerHTML = `<span class="name"></span><span class="meta"></span>`;
    const nameEl = tooltip.querySelector<HTMLElement>('.name')!;
    const metaEl = tooltip.querySelector<HTMLElement>('.meta')!;
    nameEl.textContent = displayName(record, state.lang);
    const hint = pointId ? '' : state.lang === 'zh' ? ' · 点击锁定' : ' · click to lock';
    metaEl.textContent = `${altitude === null ? '—' : altitude.toFixed(0)} km · ${
      type ? (state.lang === 'zh' ? type.zh : type.en) : ''
    }${hint}`;
  }

  canvas.addEventListener('pointermove', (event) => {
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointer.down && (Math.abs(event.clientX - pointer.downX) > 3 || Math.abs(event.clientY - pointer.downY) > 3)) {
      pointer.moved = true;
    }
    // 锁定状态下自己处理拖拽：左键绕视角中心旋转、右键平移视角中心，
    // 手感与未锁定时的 OrbitControls 一致，且中心点始终跟着卫星走
    if (pointer.down && pointer.moved && state.locked && !follow.isTransitioning()) {
      if (pointer.button === 2) follow.panBy(dx, dy);
      else follow.rotateBy(dx, dy);
      tooltip.hidden = true;
      return;
    }
    updateHover();
  });
  canvas.addEventListener('pointerleave', () => {
    tooltip.hidden = true;
    satelliteScene?.setHoveredOrbit(null);
  });
  canvas.addEventListener('pointerdown', (event) => {
    pointer.down = true;
    pointer.moved = false;
    pointer.button = event.button;
    pointer.downX = event.clientX;
    pointer.downY = event.clientY;
    if (state.locked && (event.button === 0 || event.button === 2)) follow.setDragging(true);
  });
  // 锁定期间右键要用来平移，屏蔽浏览器右键菜单
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!state.locked) return;
      event.preventDefault();
      follow.zoomBy(event.deltaY);
    },
    { passive: false },
  );
  window.addEventListener('pointerup', (event) => {
    const wasDown = pointer.down;
    pointer.down = false;
    follow.setDragging(false);
    if (!wasDown || pointer.moved || !satelliteScene) return;
    if (event.button !== 0) return;
    // 卫星点优先；点不到点上时退化为点击轨道线（高轨/远端卫星点非常小）
    const id =
      satelliteScene.pick(event.clientX, event.clientY, 24) ??
      satelliteScene.pickOrbit(event.clientX, event.clientY, 12);
    const record = recordById(id);
    if (record) {
      lockOn(record);
    } else {
      clearSelection();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') clearSelection();
    // V：在俯视 / 正视取景之间切换（仅锁定时有效）
    if ((event.key === 'v' || event.key === 'V') && state.locked) {
      follow.toggleViewMode();
      updateDetail();
    }
  });

  const resize = () => {
    ctx.resize(window.innerWidth, window.innerHeight);
    satelliteScene?.setResolution(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);

  // ---- 数据 ----
  try {
    data = await loadData(base);
    state.snapshotDate = data.snapshotDate;
    state.sourceLabel = data.source;
    records = rebuildRecords();
    satelliteScene = createSatelliteScene(records);
    ctx.scene.add(satelliteScene.group);
    cityLabels = createCityLabels(hudRoot, data.cities);
    cityUnits = data.cities.map((city) => {
      const ecef = geodeticToEcef(city.lat, city.lon, 0);
      const length = Math.hypot(ecef.x, ecef.y, ecef.z) || 1;
      return {
        key: cityKey(city),
        unit: { x: ecef.x / length, y: ecef.y / length, z: ecef.z / length },
      };
    });
    resize();
    hud.refresh();
    const lockParam = new URLSearchParams(window.location.search).get('lock');
    if (lockParam) {
      const target = records.find(
        (record) => String(record.noradId) === lockParam || record.id === lockParam,
      );
      if (target) lockOn(target);
    }
  } catch (error) {
    console.error(error);
    showToast(t(state.lang, 'error'));
  }

  const sampler = createFpsSampler(1000);
  let lowFpsMs = 0;
  let sinceDowngrade = 0;
  let last = performance.now();
  let hudAccumulator = 0;
  let detailAccumulator = 0;

  ctx.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    clock.tick(dt);

    const simTime = clock.now();
    const gmstRad = gmstRadians(julianDate(simTime));
    earth.update({
      gmstRad,
      sunDirEci: sunDirectionEci(simTime),
      atmosphere: settings.atmosphere,
    });

    if (satelliteScene) {
      // 点尺寸随视场角变化（锁定时会收缩 FOV），每帧按当前相机参数换算
      satelliteScene.setPointScale(
        window.innerHeight / (2 * Math.tan((ctx.camera.fov * Math.PI) / 360)),
      );
      satelliteScene.update(simTime, ctx.camera, window.innerWidth, window.innerHeight, dt);
      const selected = selectedRecord();
      if (state.locked && selected) {
        const position = satelliteScene.positionOf(selected.id);
        if (position) {
          if (selected.derived.eccentricity > HEO_PERIGEE) {
            const altitude = Math.hypot(position.x, position.y, position.z) - EARTH_RADIUS_KM;
            follow.setDesiredDistance(Math.min(32000, Math.max(2600, altitude * 0.55)));
          }
          follow.update(position, dt);
        }
      }

      const footprintRecord = state.selectedId ? selected : recordById(state.hoveredId);
      sweptCities = emptySwept;
      if (state.layers.footprint && footprintRecord) {
        const position = satelliteScene.positionOf(footprintRecord.id);
        if (position) {
          footprint.setVisible(true);
          footprint.update({ satelliteEci: position, gmstRad, fovDeg: footprintRecord.fovDeg });
          coveredCities.clear();
          const nadir = footprint.nadirUnitEci();
          const coverage = footprint.coverageAngleRad();
          if (nadir && coverage > 0) {
            const highlight = cityHighlightRadius(coverage);
            const pass = cityPassRadius(coverage);
            sweptScratch.length = 0;
            for (const city of cityUnits) {
              const eci = rotateZ(city.unit, gmstRad);
              const inShot = isCityWithin(eci, nadir, highlight);
              if (inShot) {
                coveredCities.add(city.key);
              }
              // 掠过圈比拍摄范围大：这一带刚被光锥扫过就留下暖色余辉
              if (inShot || isCityWithin(eci, nadir, pass)) sweptScratch.push(city.key);
            }
            sweepMemory.record(sweptScratch, simTime.getTime());
            sweptCities = sweepMemory.active(simTime.getTime());
          }
        } else {
          footprint.setVisible(false);
          coveredCities.clear();
          sweepMemory.clear();
        }
      } else {
        footprint.setVisible(false);
        coveredCities.clear();
        sweepMemory.clear();
      }

      cityLabels?.update({
        camera: ctx.camera,
        width: window.innerWidth,
        height: window.innerHeight,
        gmstRad,
        lang: state.lang,
        covered: coveredCities,
        swept: sweptCities,
        footprintActive: footprint.group.visible,
      });

      if (!pointer.down) updateHover();
    }

    // 星空当作无限远的背景：跟着相机走，缩放到任何距离都不会被"缩掉"或穿帮
    starfield.position.copy(ctx.camera.position);
    ctx.render();

    sampler.push(dt);
    hudAccumulator += dt;
    detailAccumulator += dt;
    if (hudAccumulator > 200) {
      hudAccumulator = 0;
      state.fps = sampler.fps();
      hud.refresh();
    }
    if (detailAccumulator > 320 && state.selectedId) {
      detailAccumulator = 0;
      updateDetail();
    }
    if (debugEnabled) {
      const cameraRadius = ctx.camera.position.length();
      const target = ctx.camera.position.distanceTo(ctx.controls.target);
      debugEl.textContent = [
        `cam r=${cameraRadius.toFixed(0)} km`,
        `dist=${target.toFixed(0)} km`,
        `target r=${ctx.controls.target.length().toFixed(0)} km`,
        `fov=${ctx.camera.fov.toFixed(1)}`,
        `footprint=${footprint.group.visible ? 'on' : 'off'}`,
        `cities=${coveredCities.size}`,
        `swept=${sweptCities.size}`,
      ].join('\n');
    }

    const fps = sampler.fps();
    lowFpsMs = fps < 30 ? lowFpsMs + dt : 0;
    sinceDowngrade += dt;
    if (shouldDowngrade(fps, lowFpsMs, sinceDowngrade)) {
      const lower = nextLowerLevel(quality);
      if (lower) {
        quality = lower;
        settings = qualitySettings(quality);
        ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
        sinceDowngrade = 0;
        lowFpsMs = 0;
      }
    }
  });
}

void bootstrap();
