// Photo logging: a picture of a plate -> a short meal description ("2 idli, 1 katori sambar") that the normal
// "type what you ate" flow then matches to foods and quantities. Nothing is stored; the person reviews before anything is logged.
// Needs ANTHROPIC_API_KEY on the server (each photo is one small API request).
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap, HttpError } = require('../lib/http');

const router = express.Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 6, keyFn: (req) => String(req.user?.id || req.ip), message: 'Too many photos — wait a minute and try again.' }));

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROMPT = 'List the foods visible on this plate or table as ONE short comma-separated meal description with household quantities, ' +
  'using common Indian food names where they apply, for example: "2 idli, 1 katori sambar, 1 tbsp coconut chutney". ' +
  'Estimate quantities conservatively. Output only that list. If there is no food in the picture, output exactly NONE.';

router.post('/', wrap(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(501, 'Photo logging is not set up on the server (add ANTHROPIC_API_KEY).');
  const mediaType = String(req.body?.mediaType || 'image/jpeg');
  const image = String(req.body?.image || '').replace(/^data:[^,]+,/, '');
  if (!TYPES.has(mediaType)) throw new HttpError(400, 'Use a JPEG, PNG or WebP photo');
  if (image.length < 200) throw new HttpError(400, 'No photo received');
  if (image.length > 5_500_000) throw new HttpError(413, 'That photo is too large — try a smaller one');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.PHOTO_MODEL || 'claude-sonnet-4-6', max_tokens: 160,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: image } }, { type: 'text', text: PROMPT }] }],
      }),
    });
  } catch (e) {
    throw new HttpError(504, 'The photo took too long to read. Try again.');
  } finally { clearTimeout(timer); }
  if (!r.ok) throw new HttpError(502, 'Could not read that photo right now.');
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim().replace(/^["']|["']$/g, '').slice(0, 400);
  if (!text || /^none\.?$/i.test(text)) return res.json({ success: true, text: '', message: 'No food found in that photo.' });
  res.json({ success: true, text });
}));

module.exports = router;
