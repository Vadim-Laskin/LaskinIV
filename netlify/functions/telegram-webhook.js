const { getJSON, setJSON } = require('./utils/store');
const { sendMessage } = require('./utils/telegram');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  // Optional shared-secret check: set TELEGRAM_WEBHOOK_SECRET and pass the
  // same value as `secret_token` when calling setWebhook, so randoms on the
  // internet can't post fake updates to this endpoint.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = event.headers['x-telegram-bot-api-secret-token'];
    if (got !== expectedSecret) return { statusCode: 401, body: 'Unauthorized' };
  }

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 200, body: 'ok' };
  }

  const msg = update.message;
  if (!msg || !msg.chat) return { statusCode: 200, body: 'ok' };

  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();

  // Remember every chat that has ever messaged the bot -- this is what
  // lets the website auto-subscribe someone by tg_id without them having
  // to send /start manually, as long as they've said *anything* to the
  // bot at least once before.
  const known = await getJSON('known_chats', {});
  known[chatId] = {
    username: msg.from?.username || msg.from?.first_name || '',
    lastSeen: new Date().toISOString(),
  };
  await setJSON('known_chats', known);

  const subscribers = await getJSON('subscribers', {});

  if (text.startsWith('/start')) {
    subscribers[chatId] = {
      username: msg.from?.username || msg.from?.first_name || '',
      subscribedAt: new Date().toISOString(),
    };
    await setJSON('subscribers', subscribers);
    await sendMessage(
      chatId,
      '✅ Готово, вы подписаны на уведомления о том, когда я свободен.\n\nЧтобы отписаться в любой момент — отправьте /stop.'
    );
  } else if (text.startsWith('/stop')) {
    delete subscribers[chatId];
    await setJSON('subscribers', subscribers);
    await sendMessage(chatId, 'Вы отписались от уведомлений. Чтобы вернуться — отправьте /start.');
  } else {
    await sendMessage(chatId, 'Отправьте /start, чтобы получать уведомления о том, когда я свободен, или /stop, чтобы отписаться.');
  }

  return { statusCode: 200, body: 'ok' };
};
