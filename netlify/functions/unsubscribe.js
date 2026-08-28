const { getJSON, setJSON } = require('./utils/store');
const { sendMessage } = require('./utils/telegram');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  const tgId = String(payload.tgId || '').trim();
  if (!tgId) return { statusCode: 400, body: JSON.stringify({ error: 'tgId is required' }) };

  const subscribers = await getJSON('subscribers', {});
  const wasSubscribed = Boolean(subscribers[tgId]);
  delete subscribers[tgId];
  await setJSON('subscribers', subscribers);

  if (wasSubscribed) {
    await sendMessage(tgId, 'Вы отписались от уведомлений. Захотите вернуться — нажмите «Подписаться» на сайте ещё раз.');
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, wasSubscribed }),
  };
};
