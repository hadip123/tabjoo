let allTabs = [];
let filteredTabs = [];
let selectedIndex = 0;
let activeTabId = null;

const input = document.getElementById('search-input');
const resultsEl = document.getElementById('results');

(async function init() {
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

  input.focus();
  input.addEventListener('input', onSearch);
  input.addEventListener('keydown', onKeydown);
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

  // Limit displayed results for performance
  const displayTabs = filteredTabs.slice(0, 50);

  displayTabs.forEach((tab, i) => {
    const item = document.createElement('div');
    item.className = 'result-item' + (i === selectedIndex ? ' selected' : '') + (tab.id === activeTabId ? ' active-tab' : '');
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

    item.addEventListener('click', () => switchToTab(tab.id));
    item.addEventListener('mouseenter', () => {
      selectedIndex = i;
      updateSelected();
    });

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

function onKeydown(e) {
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filteredTabs.length - 1);
    updateSelected();
  } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelected();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const tab = filteredTabs[selectedIndex];
    if (tab) switchToTab(tab.id);
  } else if (e.key === 'Escape') {
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

  // --- exact match on title (highest priority) ---
  if (title === q) {
    score += 150;
  }

  // --- title starts with query ---
  if (title.startsWith(q)) {
    score += 100;
  }

  // --- word-boundary match ---
  const qWords = q.split(/\s+/).filter(Boolean);
  const titleWords = title.split(/\s+/).filter(Boolean);

  for (const qw of qWords) {
    for (const tw of titleWords) {
      if (tw === qw) {
        score += 40;               // exact word match
      } else if (tw.startsWith(qw)) {
        score += 25;               // word prefix match
      } else if (tw.includes(qw)) {
        score += 10;               // word substring match
      }
    }
  }

  // --- title contains query as substring ---
  if (title.includes(q)) {
    score += 30;
  }

  // --- URL contains query ---
  if (url.includes(q)) {
    score += 25;
  }

  // --- domain match ---
  try {
    const domain = new URL(tab.url).hostname.toLowerCase();
    if (domain === q) {
      score += 50;
    } else if (domain.includes(q)) {
      score += 20;
    } else {
      for (const qw of qWords) {
        if (domain.includes(qw)) {
          score += 10;
        }
      }
    }
  } catch {}

  // --- URL path/segment match ---
  try {
    const u = new URL(tab.url);
    const segments = (u.hostname + '/' + u.pathname + u.search).toLowerCase().split(/[/.\-?&=#]+/).filter(Boolean);
    for (const qw of qWords) {
      for (const seg of segments) {
        if (seg.startsWith(qw)) score += 8;
        else if (seg.includes(qw)) score += 4;
      }
    }
  } catch {}

  // --- fuzzy character match on title ---
  const fuzzyScore = fuzzyMatchScore(title, q);
  score += fuzzyScore;

  // --- fuzzy on URL as fallback ---
  if (fuzzyScore === 0) {
    score += fuzzyMatchScore(url, q) * 0.5;
  }

  // --- recency boost ---
  const age = Date.now() - (tab.lastAccessed || 0);
  const hoursAgo = age / 3_600_000;
  if (hoursAgo < 0.5) score += 25;
  else if (hoursAgo < 2) score += 18;
  else if (hoursAgo < 8) score += 12;
  else if (hoursAgo < 24) score += 6;
  else if (hoursAgo < 72) score += 3;
  else score += 1;

  // --- audible boost ---
  if (tab.audible) score += 8;

  // --- pinned boost ---
  if (tab.pinned) score += 4;

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
