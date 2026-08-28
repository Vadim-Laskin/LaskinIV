const { getJSON, setJSON } = require('./utils/store');
const { requireAuth } = require('./utils/auth');

exports.handler = async (event) => {
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  const subscribers = await getJSON('subscribers', {});

  if (event.httpMethod === 'GET') {
    const list = Object.entries(subscribers).map(([chatId, info]) => ({ chatId, ...info }));
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list) };
  }

  if (event.httpMethod === 'DELETE') {
    const chatId = (event.queryStringParameters || {}).chatId;
    if (!chatId) return { statusCode: 400, body: JSON.stringify({ error: 'chatId is required' }) };
    delete subscribers[chatId];
    await setJSON('subscribers', subscribers);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: 'Method not allowed' };
};
