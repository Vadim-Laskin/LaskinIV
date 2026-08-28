(function () {
  const DAY_LABELS = {
    0: 'Воскресенье', 1: 'Понедельник', 2: 'Вторник', 3: 'Среда',
    4: 'Четверг', 5: 'Пятница', 6: 'Суббота',
  };

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function todayInZone(timeZone) {
    // en-CA formats as YYYY-MM-DD, handy for direct string comparison.
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  }

  function fmtDay(dateStr, timeZone) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateUTC = Date.UTC(y, m - 1, d);
    const [ty, tm, td] = todayInZone(timeZone).split('-').map(Number);
    const todayUTC = Date.UTC(ty, tm - 1, td);
    const diffDays = Math.round((dateUTC - todayUTC) / 86400000);
    const label = DAY_LABELS[new Date(dateUTC).getUTCDay()];
    if (diffDays === 0) return `Сегодня · ${label}`;
    if (diffDays === 1) return `Завтра · ${label}`;
    return `${label}, ${d}.${String(m).padStart(2, '0')}`;
  }

  function renderBoard(schedule, timeZone) {
    const board = document.getElementById('boardBody');
    board.innerHTML = '';

    if (!schedule || schedule.length === 0) {
      const row = document.createElement('div');
      row.className = 'board-row empty-day';
      row.innerHTML = `<span class="day">Ближайшие дни</span><span class="slots"><span class="flap wide">свободных окон не найдено</span></span>`;
      board.appendChild(row);
      return;
    }

    schedule
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .forEach((day) => {
        const row = document.createElement('div');
        row.className = 'board-row';
        const slotsHtml = day.slots.map((s) => `<span class="flap">${s.start}–${s.end}</span>`).join('');
        row.innerHTML = `<span class="day">${fmtDay(day.date, timeZone)}</span><span class="slots">${slotsHtml}</span>`;
        board.appendChild(row);
      });
  }

  async function callApi(path, body) {
    const res = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  function renderSubscribeActions({ tgId, botUsername, state }) {
    const actions = document.getElementById('subscribeActions');
    const title = document.getElementById('subscribeTitle');
    const desc = document.getElementById('subscribeDesc');
    actions.innerHTML = '';

    const botLink = botUsername ? `https://t.me/${botUsername}?start=web` : null;

    if (state === 'unsubscribed') {
      title.textContent = 'Вы отписаны';
      desc.textContent = 'Уведомления больше не приходят. Можете подписаться заново в любой момент.';
    }

    if (state === 'subscribed') {
      const badge = document.createElement('span');
      badge.className = 'subscribed-badge';
      badge.textContent = '✅ Вы подписаны';
      actions.appendChild(badge);
      const hint = document.createElement('p');
      hint.className = 'subscribe-hint';
      hint.textContent = 'Отписаться можно кнопкой под сообщением бота.';
      actions.appendChild(hint);
      return;
    }

    if (!tgId) {
      // No tg_id in the link -- we have no chat to auto-subscribe, so just
      // point people at the bot directly.
      if (botLink) {
        const a = document.createElement('a');
        a.className = 'btn';
        a.href = botLink;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Подписаться в Telegram';
        actions.appendChild(a);
      }
      return;
    }

    const subscribeBtn = document.createElement('button');
    subscribeBtn.className = 'btn';
    subscribeBtn.textContent = 'Подписаться на уведомления';
    subscribeBtn.addEventListener('click', async () => {
      subscribeBtn.disabled = true;
      subscribeBtn.textContent = 'Проверяю…';
      try {
        const res = await callApi('subscribe', { tgId });
        if (res.ok) {
          renderSubscribeActions({ tgId, botUsername, state: 'subscribed' });
        } else {
          renderNotStarted();
        }
      } catch {
        subscribeBtn.disabled = false;
        subscribeBtn.textContent = 'Подписаться на уведомления';
      }
    });
    actions.appendChild(subscribeBtn);

    function renderNotStarted() {
      actions.innerHTML = '';
      const hint = document.createElement('p');
      hint.className = 'subscribe-hint';
      hint.textContent = 'Сначала напишите боту что-нибудь в Telegram, потом нажмите ещё раз.';
      actions.appendChild(hint);
      if (botLink) {
        const a = document.createElement('a');
        a.className = 'btn ghost';
        a.href = botLink;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Открыть бота';
        actions.appendChild(a);
      }
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn';
      retryBtn.textContent = 'Я написал, проверить снова';
      retryBtn.addEventListener('click', () => renderSubscribeActions({ tgId, botUsername, state: null }));
      actions.appendChild(retryBtn);
    }
  }

  async function handleAutoUnsubscribe(tgId) {
    try {
      await callApi('unsubscribe', { tgId });
    } catch {
      // best effort
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('unsub');
    window.history.replaceState({}, '', url);
  }

  async function load() {
    const tgId = params().get('tg_id') || '';
    const isUnsub = params().get('unsub') === '1';
    const url = tgId ? `/api/availability?tg_id=${encodeURIComponent(tgId)}` : '/api/availability';

    if (isUnsub && tgId) await handleAutoUnsubscribe(tgId);

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.displayName) {
        document.getElementById('displayName').textContent = data.displayName;
      }

      const statusEl = document.getElementById('status');
      const dotText = document.getElementById('statusText');
      statusEl.classList.remove('is-free', 'is-busy');
      if (data.freeNow) {
        statusEl.classList.add('is-free');
        dotText.textContent = 'Свободен прямо сейчас';
      } else {
        statusEl.classList.add('is-busy');
        if (data.next) {
          const n = new Date(data.next.start);
          dotText.textContent = `Сейчас занят · освобожусь ${n.toLocaleString('ru-RU', {
            weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: data.timezone,
          })}`;
        } else {
          dotText.textContent = 'Сейчас занят';
        }
      }

      document.getElementById('note').textContent = data.note || '';
      if (data.timezone) document.getElementById('tz').textContent = `Часовой пояс: ${data.timezone}`;

      renderBoard(data.schedule, data.timezone);

      if (data.botUsername) {
        document.getElementById('subscribeBlock').hidden = false;
        renderSubscribeActions({
          tgId,
          botUsername: data.botUsername,
          state: isUnsub ? 'unsubscribed' : null,
        });
      }
    } catch (err) {
      document.getElementById('statusText').textContent = 'Не удалось загрузить расписание';
      console.error(err);
    }
  }

  load();
})();
