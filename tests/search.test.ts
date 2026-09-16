import { describe, it, expect } from 'vitest';
import { matchSatellite } from '../src/ui/searchBar';
import type { AddSatelliteEntry } from '../src/ui/addSatellite';

function entry(patch: Partial<AddSatelliteEntry>): AddSatelliteEntry {
  return {
    noradId: 40697,
    name: '哨兵二号 A 星',
    secondary: '',
    aliases: ['SENTINEL-2A'],
    groupKey: 'remote',
    groupLabel: '遥感影像',
    kind: 'library',
    active: false,
    typeLabel: '太阳同步',
    altitudeLabel: '≈ 786 km',
    ...patch,
  };
}

describe('搜索匹配', () => {
  it('本地化名称前缀命中排在最前', () => {
    const match = matchSatellite(entry({}), '哨兵');
    expect(match).toEqual({ rank: 0, alias: null });
  });

  it('中文界面下英文原名同样能搜到，并回传命中的别名', () => {
    const match = matchSatellite(entry({}), 'sentinel');
    expect(match).toEqual({ rank: 0, alias: 'SENTINEL-2A' });
  });

  it('别名中段命中优先级低于前缀命中', () => {
    const match = matchSatellite(entry({ aliases: ['SENTINEL-2A'] }), 'inel');
    expect(match).toEqual({ rank: 1, alias: 'SENTINEL-2A' });
  });

  it('编号前缀与编号包含都能命中', () => {
    expect(matchSatellite(entry({}), '4069')).toEqual({ rank: 0, alias: null });
    expect(matchSatellite(entry({}), '069')).toEqual({ rank: 1, alias: null });
  });

  it('名称优先于别名，别名优先于分组名', () => {
    const named = entry({ name: 'SENTINEL 卫星', aliases: ['SENTINEL-2A'] });
    expect(matchSatellite(named, 'sentinel')).toEqual({ rank: 0, alias: null });
    expect(matchSatellite(entry({ name: '哨兵二号 A 星' }), '遥感')).toEqual({ rank: 2, alias: null });
  });

  it('完全匹配不上时返回 null', () => {
    expect(matchSatellite(entry({}), '哈勃')).toBeNull();
  });
});
