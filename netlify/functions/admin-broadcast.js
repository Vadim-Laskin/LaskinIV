const { requireAuth } = require('./utils/auth');
const { broadcastToSubscribers } = require('./utils/broadcast');

exports.handler = async (event) => {
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      payload = {};
    }
    const text = payload.text || '🟢 Я сейчас свободен и на связи!';
    const result = await broadcastToSubscribers(text);

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
