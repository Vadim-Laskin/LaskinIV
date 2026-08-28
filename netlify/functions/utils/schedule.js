// Lightweight scheduling engine: no external calendar/timezone libraries.
// All "wall clock" math (weekly slots, day grouping, display times) is
// done relative to an explicit IANA timezone using the built-in Intl API,
// rather than the server's own timezone -- Netlify Functions typically run
// in UTC, so without this every slot would silently shift.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_ZONE = 'Asia/Novosibirsk';

function pad(n) {
  return String(n).padStart(2, '0');
}

// --- Timezone helpers --------------------------------------------------

function getOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
  }
  if (parts.hour === 24) parts.hour = 0;
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  return (asUTC - date.getTime()) / 60000;
}

// Converts a "wall clock" date/time -- as read off a clock physically
// located in `timeZone` -- into the correct absolute UTC Date instant.
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = getOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
}

// Reads the wall-clock date/time an absolute instant corresponds to in
// `timeZone`.
function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  if (parts.hour === '24') parts.hour = '00';
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: parts.hour, minute: parts.minute,
  };
}

function addDaysYMD(ymd, i) {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  d.setUTCDate(d.getUTCDate() + i);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function weekdayOfYMD(ymd) {
  return WEEKDAYS[new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay()];
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

function parseIcsDate(value, tzid, fallbackZone) {
  // Handles YYYYMMDD, YYYYMMDDTHHMMSS, YYYYMMDDTHHMMSSZ
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  if (!value.includes('T')) {
    // all-day date: treat midnight as being in the configured timezone.
    return zonedTimeToUtc(year, month, day, 0, 0, fallbackZone);
  }
  if (z) {
    return new Date(Date.UTC(year, month - 1, day, Number(h), Number(mi)));
  }
  // Floating time: use the event's own TZID if given, otherwise assume
  // the site's configured timezone rather than the server's.
  return zonedTimeToUtc(year, month, day, Number(h), Number(mi), tzid || fallbackZone);
}

function parseIcs(text, fallbackZone) {
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
      const segments = keyPart.split(';');
      const key = segments[0];
      const tzidParam = segments.find((s) => s.startsWith('TZID='));
      const tzid = tzidParam ? tzidParam.slice(5) : null;
      if (key === 'DTSTART') cur.start = parseIcsDate(value, tzid, fallbackZone);
      else if (key === 'DTEND') cur.end = parseIcsDate(value, tzid, fallbackZone);
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
      results.push({ start: new Date(t), end: new Date(t + dur) });
    }
    t += stepMs;
  }
  return results;
}

function busyIntervalsFromIcs(icsText, rangeStart, rangeEnd, timeZone) {
  const events = parseIcs(icsText, timeZone || DEFAULT_ZONE);
  const busy = [];
  for (const ev of events) {
    if (!ev.start) continue;
    busy.push(...expandRRule(ev, rangeStart, rangeEnd));
  }
  return busy;
}

// --- Weekly template -> concrete windows ------------------------------

// template: [{ day: 'mon', start: '09:00', end: '18:00' }, ...]
// startYMD: { year, month, day } -- "today" as read on a clock in timeZone
function windowsFromTemplate(template, startYMD, days, timeZone) {
  const zone = timeZone || DEFAULT_ZONE;
  const windows = [];
  for (let i = 0; i < days; i++) {
    const ymd = addDaysYMD(startYMD, i);
    const dow = weekdayOfYMD(ymd);
    for (const slot of template || []) {
      if (slot.day !== dow) continue;
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      const start = zonedTimeToUtc(ymd.year, ymd.month, ymd.day, sh, sm, zone);
      const end = zonedTimeToUtc(ymd.year, ymd.month, ymd.day, eh, em, zone);
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

function formatTime(d, timeZone) {
  const p = zonedParts(d, timeZone || DEFAULT_ZONE);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

function groupByDay(windows, timeZone) {
  const zone = timeZone || DEFAULT_ZONE;
  const byDay = {};
  for (const w of windows) {
    const p = zonedParts(w.start, zone);
    const key = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    byDay[key] = byDay[key] || [];
    byDay[key].push({ start: formatTime(w.start, zone), end: formatTime(w.end, zone) });
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
  zonedParts,
  zonedTimeToUtc,
  WEEKDAYS,
  DEFAULT_ZONE,
};
