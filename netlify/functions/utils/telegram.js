async function sendMessage(chatId, text, extra = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description || 'unknown Telegram error' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Telegram error codes/descriptions that mean "this chat can never receive
// messages again" -- these are the cases where we should auto-unsubscribe,
// as opposed to a transient network error where we should just log it.
function isPermanentFailure(errorText = '') {
  const t = errorText.toLowerCase();
  return (
    t.includes('bot was blocked') ||
    t.includes('user is deactivated') ||
    t.includes('chat not found') ||
    t.includes('bot was kicked') ||
    t.includes('peer_id_invalid')
  );
}

module.exports = { sendMessage, isPermanentFailure };
