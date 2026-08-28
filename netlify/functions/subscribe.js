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

  // We can only auto-subscribe someone the bot has already exchanged at
  // least one message with -- that's the only way we have a valid chat_id
  // to send future notifications to. known_chats is filled by the webhook
  // on every incoming message, regardless of its text.
  const known = await getJSON('known_chats', {});
  if (!known[tgId]) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, reason: 'not_started' }),
    };
  }

  const subscribers = await getJSON('subscribers', {});
  subscribers[tgId] = {
    username: known[tgId].username || '',
    subscribedAt: new Date().toISOString(),
    via: 'web',
  };
  await setJSON('subscribers', subscribers);

  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  const extra = {};
  if (siteUrl) {
    const unsubUrl = `${siteUrl}/?tg_id=${encodeURIComponent(tgId)}&unsub=1`;
    extra.reply_markup = { inline_keyboard: [[{ text: 'Отписаться', url: unsubUrl }]] };
  }

  await sendMessage(
    tgId,
    '✅ Вы подписаны на уведомления о том, когда я свободен. Как только освобожусь — напишу сюда.',
    extra
  );

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};
