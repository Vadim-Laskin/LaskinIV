const { getJSON } = require('./utils/store');
const {
  busyIntervalsFromIcs,
  windowsFromTemplate,
  subtractBusy,
  groupByDay,
  isFreeNow,
  nextFree,
  zonedParts,
  zonedTimeToUtc,
  DEFAULT_ZONE,
} = require('./utils/schedule');

const DAYS_AHEAD = 7;

exports.handler = async (event) => {
  try {
    const tgId = (event.queryStringParameters || {}).tg_id;
    const settings = await getJSON('settings', {
      timezone: DEFAULT_ZONE,
      quickReplyText: 'Обычно отвечаю в течение нескольких часов.',
      weeklyTemplate: [],
      icsUrl: '',
      botUsername: '',
      displayName: '',
    });

    const timeZone = settings.timezone || DEFAULT_ZONE;

    let personal = null;
    if (tgId) {
      personal = await getJSON(`override:${tgId}`, null);
    }

    const now = new Date();
    // "Today" as read on a clock in the configured timezone, not the
    // server's own timezone.
    const todayYMD = zonedParts(now, timeZone);
    const rangeStart = zonedTimeToUtc(todayYMD.year, todayYMD.month, todayYMD.day, 0, 0, timeZone);
    const rangeEnd = new Date(rangeStart.getTime() + DAYS_AHEAD * 86400000);

    const template = personal?.weeklyTemplate?.length ? personal.weeklyTemplate : settings.weeklyTemplate;
    let windows = windowsFromTemplate(template, todayYMD, DAYS_AHEAD, timeZone);

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
        // template only rather than failing the whole page.
      }
    }

    const body = {
      mode: personal ? 'personal' : 'general',
      note: personal?.note || settings.quickReplyText,
      freeNow: isFreeNow(windows, now),
      next: nextFree(windows, now),
      schedule: groupByDay(windows, timeZone),
      timezone: timeZone,
      botUsername: settings.botUsername,
      displayName: settings.displayName,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
