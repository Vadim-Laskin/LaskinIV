const { getStore } = require('@netlify/blobs');

function dataStore() {
  // On some sites/deploys, Netlify Functions don't automatically receive
  // the Blobs configuration (a known platform quirk -- shows up as
  // "MissingBlobsEnvironmentError"). If BLOBS_SITE_ID/BLOBS_TOKEN are set,
  // we configure the store explicitly instead of relying on auto-detection.
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'site-data', siteID, token });
  }
  return getStore('site-data');
}

async function getJSON(key, fallback) {
  const store = dataStore();
  const val = await store.get(key, { type: 'json' });
  return val === null || val === undefined ? fallback : val;
}

async function setJSON(key, value) {
  const store = dataStore();
  await store.setJSON(key, value);
}

async function del(key) {
  const store = dataStore();
  await store.delete(key);
}

module.exports = { dataStore, getJSON, setJSON, del };
