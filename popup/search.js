let allTabs = [];
let filteredTabs = [];
let selectedIndex = 0;
let activeTabId = null;

const input = document.getElementById('search-input');
const resultsEl = document.getElementById('results');

const SETTINGS_KEY = 'tabjoo_settings';
const DEFAULTS = {
  theme: 'auto',
  accentColor: '#a78bfa',
  density: 'normal',
  popupWidth: 520,
  searchMode: 'balanced',
  maxResults: 50,
  boostPinned: true,
  boostAudible: true,
  boostRecency: true,
  showFooter: true,
  disableMouse: false,
  navStyle: 'arrows+vim',
  keyUp: 'ArrowUp',
  keyDown: 'ArrowDown',
  keySelect: 'Enter',
  keyClose: 'Escape',
  keyUpAlt: 'k',
  keyDownAlt: 'j',
  openShortcut: 'Ctrl+Shift+Space',
};

let settings = {};

const MODE_MULTIPLIERS = {
  balanced:  { title: 1, url: 1, domain: 1, recency: 1, audible: 1, pinned: 1, fuzzy: 1 },
  title:     { title: 2, url: 0.3, domain: 0.3, recency: 0.6, audible: 0.4, pinned: 0.4, fuzzy: 0.4 },
  url:       { title: 0.3, url: 2, domain: 2, recency: 0.6, audible: 0.4, pinned: 0.4, fuzzy: 0.2 },
  recency:   { title: 0.5, url: 0.5, domain: 0.5, recency: 3, audible: 0.6, pinned: 0.6, fuzzy: 0.2 },
  fuzzy:     { title: 0.2, url: 0.2, domain: 0.2, recency: 0.4, audible: 0.2, pinned: 0.2, fuzzy: 3 },
};

async function loadSettings() {
  try {
    const res = await browser.storage.sync.get(SETTINGS_KEY);
    settings = { ...DEFAULTS, ...(res[SETTINGS_KEY] || {}) };
  } catch {
    try {
      const res = await browser.storage.local.get(SETTINGS_KEY);
      settings = { ...DEFAULTS, ...(res[SETTINGS_KEY] || {}) };
    } catch {
      settings = { ...DEFAULTS };
    }
  }
}

function applySettings() {
  const root = document.documentElement;
  const footer = document.querySelector('.footer');

  root.style.setProperty('--zen-primary', settings.accentColor);
  root.style.setProperty('--zen-primary-soft', settings.accentColor + '1a');
  root.style.setProperty('--zen-primary-glow', settings.accentColor + '26');

  if (settings.theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else if (settings.theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (matchMedia && matchMedia('(prefers-color-scheme: light)').matches) {
    root.setAttribute('data-theme', 'light');
  } else {
    root.setAttribute('data-theme', 'dark');
  }

  document.body.classList.toggle('compact', settings.density === 'compact');
  document.body.classList.toggle('mouse-disabled', settings.disableMouse);
  root.style.setProperty('--popup-width', settings.popupWidth + 'px');
  if (footer) footer.style.display = settings.showFooter ? '' : 'none';

  const hint = document.querySelector('.shortcut-hint');
  if (hint) hint.textContent = settings.openShortcut || 'Ctrl+Shift+Space';
}

function tryFocus() {
  input.focus({preventScroll: true});
  if (document.activeElement !== input) {
    requestAnimationFrame(() => input.focus({preventScroll: true}));
  }
}

(async function init() {
  await loadSettings();
  applySettings();

  tryFocus();
  input.addEventListener('input', onSearch);
  input.addEventListener('keydown', onKeydown);

  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  const tabs = await browser.tabs.query({ currentWindow: true });
  const active = await browser.tabs.query({ currentWindow: true, active: true });
  activeTabId = active[0]?.id ?? null;

  allTabs = tabs.map(t => ({
    id: t.id,
    title: t.title || '',
    url: t.url || '',
    favIconUrl: t.favIconUrl || '',
    audible: t.audible || false,
    pinned: t.pinned || false,
    lastAccessed: t.lastAccessed || 0,
    windowId: t.windowId,
  }));

  filteredTabs = [...allTabs];
  render();
  tryFocus();
})();

function onSearch() {
  const query = input.value;
  if (!query.trim()) {
    filteredTabs = [...allTabs];
  } else {
    const scored = allTabs.map(t => ({ tab: t, score: scoreTab(t, query) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    filteredTabs = scored.map(s => s.tab);
  }
  selectedIndex = 0;
  render();
}

function render() {
  resultsEl.innerHTML = '';
  if (filteredTabs.length === 0) {
    resultsEl.innerHTML = '<div class="no-results">No matching tabs found</div>';
    return;
  }

  const query = input.value.trim().toLowerCase();
  const fragment = document.createDocumentFragment();

  const displayTabs = filteredTabs.slice(0, settings.maxResults);

  displayTabs.forEach((tab, i) => {
    const item = document.createElement('div');
    item.className = 'result-item' + (i === selectedIndex ? ' selected' : '');
    item.dataset.index = i;

    const favicon = document.createElement('img');
    favicon.className = 'favicon';
    favicon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23313244" rx="2"/></svg>';
    favicon.onerror = () => { favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23313244" rx="2"/></svg>'; };

    const info = document.createElement('div');
    info.className = 'tab-info';

    const title = document.createElement('div');
    title.className = 'tab-title';
    setHighlightedContent(title, tab.title, query);

    const url = document.createElement('div');
    url.className = 'tab-url';
    try {
      const u = new URL(tab.url);
      setHighlightedContent(url, u.hostname + u.pathname + u.search, query);
    } catch {
      setHighlightedContent(url, tab.url, query);
    }

    info.appendChild(title);
    info.appendChild(url);
    item.appendChild(favicon);
    item.appendChild(info);

    if (tab.id === activeTabId) {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = 'current';
      item.appendChild(badge);
    } else if (tab.audible) {
      const badge = document.createElement('span');
      badge.className = 'tab-audible';
      badge.textContent = '\u266B';
      item.appendChild(badge);
    }

    if (!settings.disableMouse) {
      item.addEventListener('click', () => switchToTab(tab.id));
      item.addEventListener('mouseenter', () => {
        selectedIndex = i;
        updateSelected();
      });
    }

    fragment.appendChild(item);
  });

  resultsEl.appendChild(fragment);
  scrollToSelected();
}

function updateSelected() {
  document.querySelectorAll('.result-item').forEach((el, i) => {
    el.classList.toggle('selected', i === selectedIndex);
  });
  scrollToSelected();
}

function scrollToSelected() {
  const sel = document.querySelector('.result-item.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function switchToTab(tabId) {
  browser.tabs.update(tabId, { active: true }).then(() => {
    window.close();
  });
}

function matchKey(e, binding) {
  if (!binding) return false;
  const parts = binding.split('+');
  let ctrl = false, alt = false, shift = false, meta = false, key = null;
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === 'ctrl' || low === 'control') ctrl = true;
    else if (low === 'alt') alt = true;
    else if (low === 'shift') shift = true;
    else if (low === 'meta' || low === 'cmd' || low === 'command') meta = true;
    else key = p;
  }
  if (ctrl !== e.ctrlKey) return false;
  if (alt !== e.altKey) return false;
  if (shift !== e.shiftKey) return false;
  if (meta !== e.metaKey) return false;
  if (key) {
    const eventKey = key === 'Space' ? ' ' : key;
    if (e.key !== eventKey) return false;
  }
  return true;
}

function onKeydown(e) {
  const isDownPrimary = settings.navStyle !== 'vim' && matchKey(e, settings.keyDown);
  const isDownAlt = settings.navStyle !== 'arrows' && matchKey(e, 'Ctrl+' + settings.keyDownAlt);
  const isUpPrimary = settings.navStyle !== 'vim' && matchKey(e, settings.keyUp);
  const isUpAlt = settings.navStyle !== 'arrows' && matchKey(e, 'Ctrl+' + settings.keyUpAlt);
  const isSelect = matchKey(e, settings.keySelect);
  const isClose = matchKey(e, settings.keyClose);

  if (isDownPrimary || isDownAlt) {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filteredTabs.length - 1);
    updateSelected();
  } else if (isUpPrimary || isUpAlt) {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelected();
  } else if (isSelect) {
    e.preventDefault();
    const tab = filteredTabs[selectedIndex];
    if (tab) switchToTab(tab.id);
  } else if (isClose) {
    window.close();
  }
}

function scoreTab(tab, query) {
  const raw = query.trim();
  if (!raw) return 0;

  const q = raw.toLowerCase();
  const title = (tab.title || '').toLowerCase();
  const url = (tab.url || '').toLowerCase();

  let score = 0;
  const m = MODE_MULTIPLIERS[settings.searchMode] || MODE_MULTIPLIERS.balanced;

  if (title === q) {
    score += 150 * m.title;
  }

  if (title.startsWith(q)) {
    score += 100 * m.title;
  }

  const qWords = q.split(/\s+/).filter(Boolean);
  const titleWords = title.split(/\s+/).filter(Boolean);

  for (const qw of qWords) {
    for (const tw of titleWords) {
      if (tw === qw) {
        score += 40 * m.title;
      } else if (tw.startsWith(qw)) {
        score += 25 * m.title;
      } else if (tw.includes(qw)) {
        score += 10 * m.title;
      }
    }
  }

  if (title.includes(q)) {
    score += 30 * m.title;
  }

  if (url.includes(q)) {
    score += 25 * m.url;
  }

  try {
    const domain = new URL(tab.url).hostname.toLowerCase();
    if (domain === q) {
      score += 50 * m.domain;
    } else if (domain.includes(q)) {
      score += 20 * m.domain;
    } else {
      for (const qw of qWords) {
        if (domain.includes(qw)) {
          score += 10 * m.domain;
        }
      }
    }
  } catch {}

  try {
    const u = new URL(tab.url);
    const segments = (u.hostname + '/' + u.pathname + u.search).toLowerCase().split(/[/.\-?&=#]+/).filter(Boolean);
    for (const qw of qWords) {
      for (const seg of segments) {
        if (seg.startsWith(qw)) score += 8 * m.url;
        else if (seg.includes(qw)) score += 4 * m.url;
      }
    }
  } catch {}

  const fuzzyScore = fuzzyMatchScore(title, q);
  score += fuzzyScore * m.fuzzy;

  if (fuzzyScore === 0) {
    score += fuzzyMatchScore(url, q) * 0.5 * m.fuzzy;
  }

  if (settings.boostRecency) {
    const age = Date.now() - (tab.lastAccessed || 0);
    const hoursAgo = age / 3_600_000;
    if (hoursAgo < 0.5) score += 25 * m.recency;
    else if (hoursAgo < 2) score += 18 * m.recency;
    else if (hoursAgo < 8) score += 12 * m.recency;
    else if (hoursAgo < 24) score += 6 * m.recency;
    else if (hoursAgo < 72) score += 3 * m.recency;
    else score += 1 * m.recency;
  }

  if (settings.boostAudible && tab.audible) score += 8 * m.audible;
  if (settings.boostPinned && tab.pinned) score += 4 * m.pinned;

  return score;
}

function fuzzyMatchScore(text, query) {
  if (!query || !text) return 0;
  let qi = 0;
  let distance = 0;
  let lastMatch = -1;

  for (const ch of query) {
    const found = text.indexOf(ch, lastMatch + 1);
    if (found === -1) return 0;
    if (lastMatch >= 0) {
      distance += (found - lastMatch - 1);
    }
    lastMatch = found;
    qi++;
  }

  if (qi !== query.length) return 0;

  const density = 1 - distance / Math.max(text.length, 1);
  return 10 + density * 15;
}

function setHighlightedContent(el, text, query) {
  el.textContent = '';
  if (!query) {
    el.textContent = text;
    return;
  }
  const q = query.trim();
  if (!q) {
    el.textContent = text;
    return;
  }
  const parts = text.split(new RegExp(`(${escapeRegex(q)})`, 'gi'));
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const mark = document.createElement('mark');
      mark.textContent = parts[i];
      el.appendChild(mark);
    } else if (parts[i]) {
      el.appendChild(document.createTextNode(parts[i]));
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
