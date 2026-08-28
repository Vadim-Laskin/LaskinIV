// Lightweight scheduling engine: no external calendar libraries, so it
// covers the common cases well (single events + simple weekly/daily
// recurrence) rather than the full iCalendar RFC. Good enough for a
// personal "when am I free" page; very exotic recurring rules in the
// source calendar may not expand perfectly.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function pad(n) {
  return String(n).padStart(2, '0');
}

// --- ICS parsing -----------------------------------------------------

function unfoldLines(text) {
  // RFC5545: lines starting with a space/tab continue the previous line.
  const lines = text.split(/\r\n|\n|\r/);
  const out = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseIcsDate(value) {
  // Handles YYYYMMDD, YYYYMMDDTHHMMSS, YYYYMMDDTHHMMSSZ
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  if (h === '0' && mi === '0' && s === '0' && !value.includes('T')) {
    // all-day date, treat as local midnight
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }
  if (z) {
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  }
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

function parseIcs(text) {
  const lines = unfoldLines(text);
  const events = [];
  let cur = null;
  for (const raw of lines) {
    if (raw === 'BEGIN:VEVENT') {
      cur = {};
    } else if (raw === 'END:VEVENT') {
      if (cur && cur.start) events.push(cur);
      cur = null;
    } else if (cur) {
      const idx = raw.indexOf(':');
      if (idx === -1) continue;
      const keyPart = raw.slice(0, idx);
      const value = raw.slice(idx + 1);
      const key = keyPart.split(';')[0];
      if (key === 'DTSTART') cur.start = parseIcsDate(value);
      else if (key === 'DTEND') cur.end = parseIcsDate(value);
      else if (key === 'RRULE') cur.rrule = value;
      else if (key === 'SUMMARY') cur.summary = value;
    }
  }
  return events;
}

function expandRRule(event, rangeStart, rangeEnd) {
  const dur = (event.end?.getTime() || event.start.getTime() + 3600000) - event.start.getTime();
  const rules = Object.fromEntries(
    (event.rrule || '').split(';').filter(Boolean).map((p) => p.split('='))
  );
  const freq = rules.FREQ;
  const results = [];
  if (!freq) {
    if (event.start < rangeEnd && event.end > rangeStart) {
      results.push({ start: event.start, end: event.end || new Date(event.start.getTime() + dur) });
    }
    return results;
  }
  const stepMs = freq === 'DAILY' ? DAY_MS : freq === 'WEEKLY' ? DAY_MS * 7 : null;
  if (!stepMs) {
    // MONTHLY/YEARLY etc: fall back to treating as a single occurrence.
    if (event.start < rangeEnd && (event.end || event.start) > rangeStart) {
      results.push({ start: event.start, end: event.end || new Date(event.start.getTime() + dur) });
    }
    return results;
  }
  let t = event.start.getTime();
  let guard = 0;
  while (t < rangeEnd.getTime() && guard < 1000) {
    guard++;
    if (t + dur > rangeStart.getTime()) {
      const s = new Date(t);
      results.push({ start: s, end: new Date(t + dur) });
    }
    t += stepMs;
  }
  return results;
}

function busyIntervalsFromIcs(icsText, rangeStart, rangeEnd) {
  const events = parseIcs(icsText);
  const busy = [];
  for (const ev of events) {
    if (!ev.start) continue;
    busy.push(...expandRRule(ev, rangeStart, rangeEnd));
  }
  return busy;
}

// --- Weekly template -> concrete windows ------------------------------

// template: [{ day: 'mon', start: '09:00', end: '18:00' }, ...]
function windowsFromTemplate(template, rangeStart, days) {
  const windows = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + i);
    const dow = WEEKDAYS[day.getDay()];
    for (const slot of template || []) {
      if (slot.day !== dow) continue;
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em);
      windows.push({ start, end });
    }
  }
  return windows.sort((a, b) => a.start - b.start);
}

function subtractBusy(windows, busy) {
  let free = windows.map((w) => ({ start: w.start, end: w.end }));
  for (const b of busy) {
    const next = [];
    for (const w of free) {
      if (b.end <= w.start || b.start >= w.end) {
        next.push(w);
        continue;
      }
      if (b.start > w.start) next.push({ start: w.start, end: new Date(Math.min(b.start, w.end)) });
      if (b.end < w.end) next.push({ start: new Date(Math.max(b.end, w.start)), end: w.end });
    }
    free = next.filter((w) => w.end > w.start);
  }
  return free.sort((a, b) => a.start - b.start);
}

function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function groupByDay(windows) {
  const byDay = {};
  for (const w of windows) {
    const key = `${w.start.getFullYear()}-${pad(w.start.getMonth() + 1)}-${pad(w.start.getDate())}`;
    byDay[key] = byDay[key] || [];
    byDay[key].push({ start: formatTime(w.start), end: formatTime(w.end) });
  }
  return Object.entries(byDay).map(([date, slots]) => ({ date, slots }));
}

function isFreeNow(windows, now) {
  return windows.some((w) => w.start <= now && now < w.end);
}

function nextFree(windows, now) {
  const upcoming = windows.filter((w) => w.end > now).sort((a, b) => a.start - b.start);
  return upcoming[0] || null;
}

module.exports = {
  busyIntervalsFromIcs,
  windowsFromTemplate,
  subtractBusy,
  groupByDay,
  isFreeNow,
  nextFree,
  formatTime,
  WEEKDAYS,
};
