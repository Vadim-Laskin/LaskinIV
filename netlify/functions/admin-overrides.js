const { dataStore, getJSON, setJSON, del } = require('./utils/store');
const { requireAuth } = require('./utils/auth');

exports.handler = async (event) => {
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  if (event.httpMethod === 'GET') {
    const store = dataStore();
    const { blobs } = await store.list({ prefix: 'override:' });
    const items = await Promise.all(
      blobs.map(async (b) => {
        const data = await getJSON(b.key, null);
        return { tgId: b.key.replace('override:', ''), ...data };
      })
    );
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items) };
  }

  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
    }
    if (!payload.tgId) return { statusCode: 400, body: JSON.stringify({ error: 'tgId is required' }) };
    const { tgId, ...rest } = payload;
    await setJSON(`override:${tgId}`, rest);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod === 'DELETE') {
    const tgId = (event.queryStringParameters || {}).tgId;
    if (!tgId) return { statusCode: 400, body: JSON.stringify({ error: 'tgId is required' }) };
    await del(`override:${tgId}`);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: 'Method not allowed' };
};
