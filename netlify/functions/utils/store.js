const { getStore } = require('@netlify/blobs');

function dataStore() {
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
