const STORAGE_KEY = 'tabjoo_settings';
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

let recordingFor = null;

function getEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

async function loadSettings() {
  try {
    const result = await browser.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULTS, ...(result[STORAGE_KEY] || {}) };
  } catch {
    try {
      const result = await browser.storage.local.get(STORAGE_KEY);
      return { ...DEFAULTS, ...(result[STORAGE_KEY] || {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }
}

async function saveSettings(data) {
  const payload = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key in data) payload[key] = data[key];
  }
  try {
    await browser.storage.sync.set({ [STORAGE_KEY]: payload });
  } catch {
    await browser.storage.local.set({ [STORAGE_KEY]: payload });
  }
}

function readForm() {
  const data = {};
  for (const key of Object.keys(DEFAULTS)) {
    const el = document.getElementsByName(key)[0];
    if (!el) continue;
    if (el.type === 'checkbox') {
      data[key] = el.checked;
    } else if (el.type === 'number' || el.tagName === 'INPUT' && el.type === 'range') {
      data[key] = Number(el.value);
    } else {
      data[key] = el.value;
    }
  }
  return data;
}

function populateForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const el = document.getElementsByName(key)[0];
    if (!el) continue;
    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
    } else {
      el.value = value;
    }
  }
  syncDisplay();
}

function syncDisplay() {
  const width = Number(getEl('popupWidth').value);
  getEl('popupWidthVal').textContent = width + 'px';
  getEl('maxResultsVal').textContent = String(getEl('maxResults').value);
  getEl('accentColorText').value = getEl('accentColor').value;
}

function showToast(msg, ok) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 20px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#fff',
    background: ok ? '#2ecc71' : '#e74c3c',
    zIndex: '999',
    opacity: '0',
    transition: 'opacity 0.2s ease',
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; });
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 200);
  }, 2000);
}

async function handleSave(e) {
  e.preventDefault();
  const data = readForm();
  await saveSettings(data);

  const shortcut = data.openShortcut;
  if (shortcut && browser.commands && typeof browser.commands.update === 'function') {
    try {
      await browser.commands.update({
        name: '_execute_action',
        shortcut: shortcut,
      });
    } catch (err) {
      showToast('Shortcut not applied: ' + (err.message || err), false);
    }
  }

  showToast('Settings saved', true);
}

async function handleReset(e) {
  e.preventDefault();
  populateForm(DEFAULTS);
  await saveSettings(DEFAULTS);
  showToast('Reset to defaults', true);
}

function formatKey(label) {
  const el = document.querySelector(`[data-key="${label}"]`);
  if (!el) return;
  const hidden = document.querySelector(`input[name="${label}"]`);
  if (!hidden) return;
  const val = hidden.value;
  const isAlt = label === 'keyUpAlt' || label === 'keyDownAlt';
  if (isAlt && val && !val.startsWith('Ctrl+')) {
    el.innerHTML = `<kbd>Ctrl</kbd> + ${val}`;
  } else if (val) {
    el.innerHTML = val.replace(/\+/g, ' + ');
  }
}

function syncRecorders() {
  ['keyUp','keyDown','keySelect','keyClose','keyUpAlt','keyDownAlt','openShortcut'].forEach(formatKey);
}

function startRecording(keyName) {
  if (recordingFor) {
    const old = document.querySelector(`[data-key="${recordingFor}"]`);
    if (old) old.classList.remove('recording');
  }
  recordingFor = keyName;
  const btn = document.querySelector(`[data-key="${keyName}"]`);
  if (btn) {
    btn.textContent = '… press keys …';
    btn.classList.add('recording');
  }
}

function handleKeyCapture(e) {
  if (!recordingFor) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    const btn = document.querySelector(`[data-key="${recordingFor}"]`);
    if (btn) btn.classList.remove('recording');
    formatKey(recordingFor);
    recordingFor = null;
    return;
  }

  if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta') return;

  let key = e.key;
  if (key === ' ') key = 'Space';

  const isAlt = recordingFor === 'keyUpAlt' || recordingFor === 'keyDownAlt';
  let combo;
  if (isAlt) {
    if (!e.ctrlKey) return;
    combo = 'Ctrl+' + key;
  } else {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    parts.push(key);
    combo = parts.join('+');
  }

  const hidden = document.querySelector(`input[name="${recordingFor}"]`);
  if (hidden) hidden.value = combo;

  const btn = document.querySelector(`[data-key="${recordingFor}"]`);
  if (btn) {
    btn.textContent = '✓ ' + combo;
    btn.classList.remove('recording');
    setTimeout(() => formatKey(recordingFor), 600);
  }

  recordingFor = null;
}

function init() {
  ['change', 'input'].forEach(ev =>
    document.querySelectorAll('input, select').forEach(el =>
      el.addEventListener(ev, syncDisplay)
    )
  );

  getEl('accentColor').addEventListener('input', () => {
    getEl('accentColorText').value = getEl('accentColor').value;
  });
  getEl('accentColorText').addEventListener('input', () => {
    const v = getEl('accentColorText').value;
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      getEl('accentColor').value = v;
    }
  });

  getEl('saveBtn').addEventListener('click', handleSave);
  getEl('resetBtn').addEventListener('click', handleReset);

  document.querySelectorAll('.key-recorder').forEach(btn => {
    btn.addEventListener('click', () => startRecording(btn.dataset.key));
  });
  document.addEventListener('keydown', handleKeyCapture, true);

  loadSettings().then(async (settings) => {
    try {
      const commands = await browser.commands.getAll();
      const action = commands.find(c => c.name === '_execute_action');
      if (action && action.shortcut) {
        settings.openShortcut = action.shortcut;
        const hidden = document.querySelector('input[name="openShortcut"]');
        if (hidden) hidden.value = action.shortcut;
      }
    } catch {}
    populateForm(settings);
    syncRecorders();
  });
}

document.addEventListener('DOMContentLoaded', init);
