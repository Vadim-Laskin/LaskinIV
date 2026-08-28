const { getJSON, setJSON } = require('./utils/store');
const { requireAuth } = require('./utils/auth');

const DEFAULTS = {
  timezone: 'Europe/Moscow',
  quickReplyText: 'Обычно отвечаю в течение нескольких часов.',
  weeklyTemplate: [],
  icsUrl: '',
  botUsername: '',
  displayName: '',
};

exports.handler = async (event) => {
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  try {
    if (event.httpMethod === 'GET') {
      const settings = await getJSON('settings', DEFAULTS);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) };
    }

    if (event.httpMethod === 'POST') {
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
      }
      const current = await getJSON('settings', DEFAULTS);
      const updated = { ...current, ...payload };
      await setJSON('settings', updated);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) };
    }

    return { statusCode: 405, body: 'Method not allowed' };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
