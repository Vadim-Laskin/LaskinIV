// Netlify runs this automatically on the cron schedule set in netlify.toml
// -- no manual trigger needed. It compares the current free/busy status to
// the last known status; only on a busy -> free transition does it notify
// subscribers, so people aren't pinged again every 5 minutes while you
// stay free.

const { getJSON, setJSON } = require('./utils/store');
const { computeWindows } = require('./utils/compute');
const { isFreeNow, DEFAULT_ZONE } = require('./utils/schedule');
const { broadcastToSubscribers } = require('./utils/broadcast');

exports.handler = async () => {
  try {
    const settings = await getJSON('settings', {
      timezone: DEFAULT_ZONE,
      weeklyTemplate: [],
      icsUrl: '',
      autoNotify: true,
      autoNotifyText: '🟢 Я сейчас свободен и на связи!',
    });

    const { windows, now } = await computeWindows(settings, settings.weeklyTemplate || []);
    const freeNow = isFreeNow(windows, now);

    const state = await getJSON('broadcast_state', { lastFreeNow: null });

    // First run ever: just record the current status as the baseline so we
    // don't blast every existing subscriber the moment this feature ships.
    if (state.lastFreeNow === null) {
      await setJSON('broadcast_state', { lastFreeNow: freeNow, checkedAt: now.toISOString() });
      return { statusCode: 200, body: 'baseline set' };
    }

    let result = null;
    if (freeNow && !state.lastFreeNow && settings.autoNotify !== false) {
      const text = settings.autoNotifyText || '🟢 Я сейчас свободен и на связи!';
      result = await broadcastToSubscribers(text);
    }

    await setJSON('broadcast_state', { lastFreeNow: freeNow, checkedAt: now.toISOString() });

    return { statusCode: 200, body: JSON.stringify({ freeNow, notified: Boolean(result), result }) };
  } catch (err) {
    console.error('check-status error:', err);
    return { statusCode: 500, body: String(err && err.message || err) };
  }
};
