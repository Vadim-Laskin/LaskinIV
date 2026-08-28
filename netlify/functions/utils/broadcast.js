const { getJSON, setJSON } = require('./store');
const { sendMessage, isPermanentFailure } = require('./telegram');

async function broadcastToSubscribers(text) {
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
    if (isPermanentFailure(result.error)) {
      delete subscribers[chatId];
      removed++;
    }
  }

  if (removed > 0) await setJSON('subscribers', subscribers);

  return { sent, removed, total: chatIds.length, failures };
}

module.exports = { broadcastToSubscribers };
