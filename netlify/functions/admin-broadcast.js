const { getJSON, setJSON } = require('./utils/store');
const { requireAuth } = require('./utils/auth');
const { sendMessage, isPermanentFailure } = require('./utils/telegram');

exports.handler = async (event) => {
  if (!requireAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    payload = {};
  }
  const text = payload.text || '🟢 Я сейчас свободен и на связи!';

  const subscribers = await getJSON('subscribers', {});
  const chatIds = Object.keys(subscribers);

  let sent = 0;
  let removed = 0;
  const failures = [];

  for (const chatId of chatIds) {
    const result = await sendMessage(chatId, text);
    if (result.ok) {
      sent++;
      continue;
    }
    failures.push({ chatId, error: result.error });
    // The bot could not deliver the message (blocked, chat gone, etc.) --
    // automatically unsubscribe this user so future broadcasts don't keep
    // failing on a dead chat.
    if (isPermanentFailure(result.error)) {
      delete subscribers[chatId];
      removed++;
    }
  }

  if (removed > 0) await setJSON('subscribers', subscribers);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sent, removed, total: chatIds.length, failures }),
  };
};
