import { describe, it, expect } from 'vitest';
import { t } from '../src/ui/i18n';

describe('i18n', () => {
  it('translates static keys', () => {
    expect(t('zh', 'title')).toBe('卫星轨道可视化');
    expect(t('en', 'title')).toBe('Satellite Orbit Viewer');
  });

  it('interpolates parameters', () => {
    expect(t('zh', 'satellites', { count: 76 })).toContain('76');
    expect(t('en', 'following', { name: 'ISS' })).toContain('ISS');
    expect(t('zh', 'snapshot', { date: '2026-09-16' })).toContain('2026-09-16');
  });

  it('falls back to the key when missing', () => {
    expect(t('en', 'nope')).toBe('nope');
  });

  it('keeps both languages in sync for every key', () => {
    const keys = [
      'title',
      'snapshot',
      'paused',
      'play',
      'pause',
      'satellites',
      'addSatellite',
      'orbitType',
      'altitude',
      'description',
      'lock',
      'unlock',
    ];
    for (const key of keys) {
      expect(t('zh', key)).not.toBe(key);
      expect(t('en', key)).not.toBe(key);
    }
  });
});
