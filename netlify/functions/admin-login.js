const { sign } = require('./utils/auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const secret = process.env.ADMIN_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!secret || !adminPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing ADMIN_SECRET/ADMIN_PASSWORD env vars' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  if (payload.password !== adminPassword) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Неверный пароль' }) };
  }

  const token = sign({ role: 'admin' }, secret);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) };
};
