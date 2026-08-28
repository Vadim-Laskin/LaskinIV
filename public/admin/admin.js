(function () {
  const DAY_OPTIONS = [
    ['mon', 'Пн'], ['tue', 'Вт'], ['wed', 'Ср'], ['thu', 'Чт'],
    ['fri', 'Пт'], ['sat', 'Сб'], ['sun', 'Вс'],
  ];

  const tokenKey = 'admin_token';
  const getToken = () => localStorage.getItem(tokenKey);
  const setToken = (t) => localStorage.setItem(tokenKey, t);
  const clearToken = () => localStorage.removeItem(tokenKey);

  async function api(path, options = {}) {
    const res = await fetch(`/api/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      clearToken();
      showLogin();
      throw new Error('Unauthorized');
    }
    return res.json();
  }

  function showLogin() {
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('app').hidden = true;
  }

  function showApp() {
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('app').hidden = false;
    loadSettings();
    loadOverrides();
    loadSubscribers();
  }

  // --- Login ---

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || 'Ошибка входа';
        return;
      }
      setToken(data.token);
      showApp();
    } catch {
      errEl.textContent = 'Не удалось связаться с сервером';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearToken();
    showLogin();
  });

  // --- Tabs ---

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // --- Weekly slots editor ---

  function addSlotRow(slot = { day: 'mon', start: '09:00', end: '18:00' }) {
    const row = document.createElement('div');
    row.className = 'weekly-row';
    const daySelect = document.createElement('select');
    DAY_OPTIONS.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (val === slot.day) opt.selected = true;
      daySelect.appendChild(opt);
    });
    const startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.value = slot.start;
    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.value = slot.end;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => row.remove());

    row.append(daySelect, startInput, document.createTextNode('–'), endInput, removeBtn);
    row.dataset.day = '';
    row._get = () => ({ day: daySelect.value, start: startInput.value, end: endInput.value });
    document.getElementById('weeklyRows').appendChild(row);
  }

  document.getElementById('addSlotBtn').addEventListener('click', () => addSlotRow());

  function readWeeklyTemplate() {
    return Array.from(document.querySelectorAll('#weeklyRows .weekly-row')).map((row) => row._get());
  }

  // --- Settings ---

  async function loadSettings() {
    const s = await api('admin-settings');
    document.getElementById('displayName').value = s.displayName || '';
    document.getElementById('timezone').value = s.timezone || '';
    document.getElementById('quickReplyText').value = s.quickReplyText || '';
    document.getElementById('icsUrl').value = s.icsUrl || '';
    document.getElementById('botUsername').value = s.botUsername || '';

    document.getElementById('weeklyRows').innerHTML = '';
    (s.weeklyTemplate || []).forEach(addSlotRow);
    if (!s.weeklyTemplate || s.weeklyTemplate.length === 0) addSlotRow();
  }

  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const payload = {
      displayName: document.getElementById('displayName').value,
      timezone: document.getElementById('timezone').value,
      quickReplyText: document.getElementById('quickReplyText').value,
      icsUrl: document.getElementById('icsUrl').value,
      botUsername: document.getElementById('botUsername').value.replace('@', ''),
      weeklyTemplate: readWeeklyTemplate(),
    };
    await api('admin-settings', { method: 'POST', body: JSON.stringify(payload) });
    const hint = document.getElementById('settingsSaved');
    hint.textContent = 'Сохранено ✓';
    setTimeout(() => (hint.textContent = ''), 2500);
  });

  // --- Broadcast ---

  document.getElementById('broadcastBtn').addEventListener('click', async () => {
    const text = document.getElementById('broadcastText').value || undefined;
    const resultEl = document.getElementById('broadcastResult');
    resultEl.textContent = 'Отправляю…';
    const res = await api('admin-broadcast', { method: 'POST', body: JSON.stringify({ text }) });
    resultEl.textContent = `Отправлено: ${res.sent} из ${res.total}. Отписано автоматически: ${res.removed}.`;
    loadSubscribers();
  });

  // --- Overrides ---

  async function loadOverrides() {
    const items = await api('admin-overrides');
    const list = document.getElementById('overridesList');
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<p class="list-empty">Пока нет персональных записей.</p>';
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `<span>ID ${item.tgId} — ${item.note || 'без заметки'}</span>`;
      const btn = document.createElement('button');
      btn.className = 'btn danger';
      btn.style.marginTop = '0';
      btn.textContent = 'Удалить';
      btn.addEventListener('click', async () => {
        await api(`admin-overrides?tgId=${encodeURIComponent(item.tgId)}`, { method: 'DELETE' });
        loadOverrides();
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  document.getElementById('saveOverrideBtn').addEventListener('click', async () => {
    const tgId = document.getElementById('ovTgId').value.trim();
    const note = document.getElementById('ovNote').value.trim();
    if (!tgId) return;
    await api('admin-overrides', { method: 'POST', body: JSON.stringify({ tgId, note }) });
    document.getElementById('ovTgId').value = '';
    document.getElementById('ovNote').value = '';
    loadOverrides();
  });

  // --- Subscribers ---

  async function loadSubscribers() {
    const items = await api('admin-subscribers');
    const list = document.getElementById('subscribersList');
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<p class="list-empty">Подписчиков пока нет.</p>';
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `<span>${item.username ? '@' + item.username : item.chatId} <span class="meta">· ${item.chatId}</span></span>`;
      const btn = document.createElement('button');
      btn.className = 'btn danger';
      btn.style.marginTop = '0';
      btn.textContent = 'Отписать';
      btn.addEventListener('click', async () => {
        await api(`admin-subscribers?chatId=${encodeURIComponent(item.chatId)}`, { method: 'DELETE' });
        loadSubscribers();
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  // --- Boot ---

  if (getToken()) showApp();
  else showLogin();
})();
