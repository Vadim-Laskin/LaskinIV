const crypto = require('crypto');

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload, secret, ttlSeconds = 12 * 3600) {
  const data = { ...payload, exp: Date.now() + ttlSeconds * 1000 };
  const json = b64url(JSON.stringify(data));
  const sig = crypto.createHmac('sha256', secret).update(json).digest('base64url');
  return `${json}.${sig}`;
}

function verify(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [json, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(json).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(json, 'base64url').toString());
  } catch {
    return null;
  }
  if (!data.exp || data.exp < Date.now()) return null;
  return data;
}

// Returns the decoded token payload if the request carries a valid admin
// session, otherwise null. Callers should respond 401 when this is null.
function requireAuth(event) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return verify(token, secret);
}

module.exports = { sign, verify, requireAuth };
