const {
  windowsFromTemplate,
  subtractBusy,
  busyIntervalsFromIcs,
  zonedParts,
  zonedTimeToUtc,
  DEFAULT_ZONE,
} = require('./schedule');

async function computeWindows(settings, template, daysAhead = 7) {
  const timeZone = settings.timezone || DEFAULT_ZONE;
  const now = new Date();
  const todayYMD = zonedParts(now, timeZone);
  const rangeStart = zonedTimeToUtc(todayYMD.year, todayYMD.month, todayYMD.day, 0, 0, timeZone);
  const rangeEnd = new Date(rangeStart.getTime() + daysAhead * 86400000);

  let windows = windowsFromTemplate(template, todayYMD, daysAhead, timeZone);

  if (settings.icsUrl) {
    try {
      const res = await fetch(settings.icsUrl);
      if (res.ok) {
        const text = await res.text();
        const busy = busyIntervalsFromIcs(text, rangeStart, rangeEnd, timeZone);
        windows = subtractBusy(windows, busy);
      }
    } catch {
      // If the calendar feed is unreachable, fall back to the manual
      // template only rather than failing the whole computation.
    }
  }

  return { windows, timeZone, now };
}

module.exports = { computeWindows };
