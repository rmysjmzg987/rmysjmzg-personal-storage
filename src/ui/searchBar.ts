import { t, type Lang } from './i18n';
import type { AddSatelliteEntry } from './addSatellite';

export interface SearchBarCallbacks {
  lang(): Lang;
  /** 可搜索的全部卫星（含未显示在场景中的） */
  entries(): AddSatelliteEntry[];
  /** 点击结果：确保该卫星已显示并锁定跟随 */
  onPick(noradId: number): void;
}

export interface SearchBarHandle {
  refresh(): void;
  /** 语言或数据变化后重绘 */
  isOpen(): boolean;
}

const MAX_RESULTS = 40;

export interface SearchMatch {
  /** 越小越靠前：名称前缀 0 < 名称包含 1 < 分组名命中 2 */
  rank: number;
  /** 命中的别名（名称以外的写法），用于向用户说明为什么匹配 */
  alias: string | null;
}

/** 名称/编号/分组命中的优先级：前缀命中 > 包含命中 */
export function matchSatellite(entry: AddSatelliteEntry, query: string): SearchMatch | null {
  const primary = [entry.name, entry.secondary].filter((value) => value.length > 0);
  const primaryLower = primary.map((value) => value.toLowerCase());
  let best: number | null = null;
  for (const value of primaryLower) {
    const index = value.indexOf(query);
    if (index < 0) continue;
    const hit = index === 0 ? 0 : 1;
    if (best === null || hit < best) best = hit;
  }
  if (best !== null) return { rank: best, alias: null };

  const digits = String(entry.noradId);
  if (digits.startsWith(query)) return { rank: 0, alias: null };

  // 别名（中英双语原名）：命中后仍然显示本地化名称，并附带命中写法
  let alias: string | null = null;
  let aliasRank: number | null = null;
  for (const candidate of entry.aliases) {
    const lower = candidate.toLowerCase();
    const index = lower.indexOf(query);
    if (index < 0) continue;
    const hit = index === 0 ? 0 : 1;
    if (aliasRank === null || hit < aliasRank) {
      aliasRank = hit;
      alias = candidate;
    }
  }
  if (aliasRank !== null) return { rank: aliasRank, alias };
  if (digits.includes(query)) return { rank: 1, alias: null };
  if (entry.groupLabel.toLowerCase().includes(query)) return { rank: 2, alias: null };
  return null;
}

export function mountSearchBar(root: HTMLElement, callbacks: SearchBarCallbacks): SearchBarHandle {
  const dock = document.createElement('div');
  dock.className = 'search-dock';

  const field = document.createElement('div');
  field.className = 'search-field';
  const icon = document.createElement('span');
  icon.className = 'search-icon';
  icon.textContent = '⌕';
  const input = document.createElement('input');
  input.className = 'search-input';
  input.type = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  field.append(icon, input);

  const resultList = document.createElement('div');
  resultList.className = 'search-results';
  resultList.hidden = true;

  const hint = document.createElement('div');
  hint.className = 'search-hint';
  hint.hidden = true;

  dock.append(field, resultList, hint);
  root.appendChild(dock);

  let matches: { entry: AddSatelliteEntry; alias: string | null }[] = [];
  let highlight = 0;
  let open = false;

  const lang = () => callbacks.lang();

  function close(): void {
    open = false;
    resultList.hidden = true;
    hint.hidden = true;
    resultList.textContent = '';
  }

  function pick(entry: AddSatelliteEntry): void {
    callbacks.onPick(entry.noradId);
    input.value = '';
    close();
    input.blur();
  }

  function render(): void {
    const query = input.value.trim().toLowerCase();
    resultList.textContent = '';
    hint.textContent = t(lang(), 'searchEmpty');
    // 先算出本次匹配结果，再决定提示是否显示：否则会残留上一次搜索的状态
    const scored: { entry: AddSatelliteEntry; rank: number; alias: string | null }[] = [];
    for (const entry of callbacks.entries()) {
      const match = matchSatellite(entry, query);
      if (match !== null) scored.push({ entry, rank: match.rank, alias: match.alias });
    }
    scored.sort((a, b) => a.rank - b.rank);
    matches = query.length === 0 ? [] : scored.slice(0, MAX_RESULTS);
    highlight = 0;
    hint.hidden = query.length === 0 || matches.length > 0;
    if (query.length === 0) {
      close();
      return;
    }

    if (matches.length === 0) {
      resultList.hidden = true;
      open = false;
      return;
    }

    matches.forEach(({ entry, alias }, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-result';
      row.classList.toggle('is-active', entry.active);
      row.dataset.index = String(index);

      const main = document.createElement('span');
      main.className = 'search-result-name';
      main.textContent = entry.name;
      const sub = document.createElement('span');
      sub.className = 'search-result-meta';
      sub.textContent = [alias ?? '', entry.groupLabel, entry.typeLabel, entry.altitudeLabel]
        .filter((part) => part.length > 0)
        .join(' · ');
      const badge = document.createElement('span');
      badge.className = 'search-result-badge';
      badge.textContent = t(lang(), entry.active ? 'searchShown' : 'searchHidden');

      row.append(main, sub, badge);
      row.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        pick(entry);
      });
      row.addEventListener('pointerenter', () => {
        highlight = index;
        markHighlight();
      });
      resultList.appendChild(row);
    });
    open = true;
    resultList.hidden = false;
    markHighlight();
  }

  function markHighlight(): void {
    const rows = resultList.querySelectorAll<HTMLElement>('.search-result');
    rows.forEach((row, index) => row.classList.toggle('is-highlight', index === highlight));
  }

  function step(delta: number): void {
    if (!open || matches.length === 0) return;
    highlight = (highlight + delta + matches.length) % matches.length;
    markHighlight();
    resultList.querySelectorAll<HTMLElement>('.search-result')[highlight]?.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => {
    if (input.value.trim().length > 0) render();
  });
  input.addEventListener('blur', () => {
    // 让 pointerdown 先完成选星，再收起列表
    window.setTimeout(close, 120);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Enter') {
      if (open && matches[highlight]) {
        event.preventDefault();
        pick(matches[highlight].entry);
      }
    } else if (event.key === 'Escape') {
      input.value = '';
      close();
      input.blur();
    }
  });

  // 按 “/” 直接聚焦搜索框（不在输入框里时才触发）
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
    event.preventDefault();
    input.focus();
  });

  const refresh = () => {
    input.placeholder = t(lang(), 'searchPlaceholder');
    if (open) render();
  };
  refresh();

  return { refresh, isOpen: () => open };
}
