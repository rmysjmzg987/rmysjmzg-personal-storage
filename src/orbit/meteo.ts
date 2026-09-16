/**
 * 主力在轨气象卫星名单（NORAD 编号）。
 *
 * 气象模式右侧的「气象卫星」开关只显示这些卫星：静止轨道星负责连续的区域观测，
 * 极轨星负责全球高分辨率扫描。气象模式是独立视图，命中名单即显示，
 * 不受用户在轨道模式里对卫星的增删影响。
 */
export interface MeteoSatelliteInfo {
  noradId: number;
  label: string;
  labelZh: string;
  /** geo = 静止轨道（地球同步），polar = 极轨（太阳同步） */
  kind: 'geo' | 'polar';
}

export const METEO_SATELLITES: readonly MeteoSatelliteInfo[] = [
  { noradId: 41866, label: 'GOES-16', labelZh: 'GOES-16', kind: 'geo' },
  { noradId: 51850, label: 'GOES-18', labelZh: 'GOES-18', kind: 'geo' },
  { noradId: 40267, label: 'Himawari-8', labelZh: '向日葵 8 号', kind: 'geo' },
  { noradId: 41836, label: 'Himawari-9', labelZh: '向日葵 9 号', kind: 'geo' },
  { noradId: 48808, label: 'Fengyun-4B', labelZh: '风云四号 B 星', kind: 'geo' },
  { noradId: 54743, label: 'Meteosat-12', labelZh: '气象卫星 12 号', kind: 'geo' },
  { noradId: 43010, label: 'Fengyun-3D', labelZh: '风云三号 D 星', kind: 'polar' },
  { noradId: 56232, label: 'Fengyun-3G', labelZh: '风云三号 G 星', kind: 'polar' },
  { noradId: 43013, label: 'NOAA-20', labelZh: 'NOAA-20', kind: 'polar' },
  { noradId: 54234, label: 'NOAA-21', labelZh: 'NOAA-21', kind: 'polar' },
];

export function isMeteoSatellite(noradId: number): boolean {
  return METEO_SATELLITES.some((sat) => sat.noradId === noradId);
}

/** 从卫星列表里挑出气象卫星，保持原有顺序 */
export function pickMeteoSatellites<T extends { noradId: number }>(records: readonly T[]): T[] {
  return records.filter((record) => isMeteoSatellite(record.noradId));
}

