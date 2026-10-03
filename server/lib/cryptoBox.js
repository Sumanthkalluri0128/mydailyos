// Small AES-256-GCM helper used to keep Google refresh tokens encrypted at rest in MongoDB.
// Key comes from GOOGLE_TOKEN_KEY (preferred) or falls back to JWT_SECRET.
const crypto = require('crypto');

const keyFrom = (env = process.env) => {
  const secret = env.GOOGLE_TOKEN_KEY || env.JWT_SECRET;
  if (!secret) throw new Error('No GOOGLE_TOKEN_KEY or JWT_SECRET configured');
  return crypto.createHash('sha256').update(`flexfit-token-box|${secret}`).digest();
};

function encrypt(plain, env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(env), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}

function decrypt(box, env) {
  const [iv, tag, ct] = String(box || '').split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !ct) throw new Error('Malformed encrypted value');
  const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(env), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
