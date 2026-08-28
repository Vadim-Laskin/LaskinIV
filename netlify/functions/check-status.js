// Detects busy -> free transitions and auto-broadcasts to subscribers.
//
// This can be triggered two ways:
//  1) Netlify's own Scheduled Functions (see the `schedule` entry in
//     netlify.toml) -- convenient, but Netlify's scheduler has had
//     reported reliability issues (registered but not firing).
//  2) A direct HTTP GET from an external free cron service (recommended,
//     see README section 3) -- e.g. https://cron-job.org hitting
//     /api/check-status?secret=... every 5 minutes. This does not depend
//     on Netlify's internal scheduler at all.
//
// Both paths run the exact same logic below, so it's safe to set up
// external cron even if the Netlify-native schedule also happens to work.

const { getJSON, setJSON } = require('./utils/store');
const { computeWindows } = require('./utils/compute');
const { isFreeNow, DEFAULT_ZONE } = require('./utils/schedule');
const { broadcastToSubscribers } = require('./utils/broadcast');

exports.handler = async (event) => {
  // If CHECK_STATUS_SECRET is set, require it on direct HTTP calls so
  // randoms on the internet can't spam-trigger this endpoint. Netlify's
  // own scheduled invocations don't carry query params, so this only
  // gates the external-cron path.
  const expected = process.env.CHECK_STATUS_SECRET;
  if (expected) {
    const got = (event?.queryStringParameters || {}).secret;
    if (got !== expected) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freeNow, notified: Boolean(result), result }),
    };
  } catch (err) {
    console.error('check-status error:', err);
    return { statusCode: 500, body: String(err && err.message || err) };
  }
};
