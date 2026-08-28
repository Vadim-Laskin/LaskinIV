const { getJSON } = require('./utils/store');
const { computeWindows } = require('./utils/compute');
const { groupByDay, isFreeNow, nextFree, DEFAULT_ZONE } = require('./utils/schedule');

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

    let personal = null;
    if (tgId) {
      personal = await getJSON(`override:${tgId}`, null);
    }

    const template = personal?.weeklyTemplate?.length ? personal.weeklyTemplate : settings.weeklyTemplate;
    const { windows, timeZone, now } = await computeWindows(settings, template);

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
