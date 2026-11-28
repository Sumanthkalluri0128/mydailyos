// Fails when a POST/PUT/PATCH route reads req.body without any validation (a schema `body(s.object(...))`, a `v.*` check, or a `clean*()` / `parse*()` /
// `normalize*()` helper). Run from the repo root (or web/). New routes must validate their input.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const dir = fs.existsSync(path.join(root, 'web/server/routes')) ? path.join(root, 'web/server/routes') : path.join(root, 'server/routes');
const TOKEN = /\bv\.\w+\(|\bclean\w*\(|\bbody\(s\.|\bnormali[sz]e\w*\(|\bparse\w*\(|\bsanitize\w*\(|\bvalidate\w*\(|HttpError\(400|\bcleanFlag\(|\.pick\(/;
let bad = 0; let checked = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const parts = src.split(/\n(?=router\.(?:post|put|patch|delete)\()/).slice(1);
  for (const part of parts) {
    const m = part.match(/^router\.(post|put|patch|delete)\('([^']*)'/); if (!m || m[1] === 'delete') continue;
    const block = part.split(/\nrouter\.(?:get|post|put|patch|delete|use)\(/)[0];
    if (!/req\.body|body\(/.test(block)) continue;
    checked += 1;
    if (!TOKEN.test(block)) { console.log(`NOT VALIDATED  ${f}  ${m[1].toUpperCase()} ${m[2]}`); bad += 1; }
  }
}
console.log(`${checked} write routes read a body; ${bad} without validation`);
process.exit(bad ? 1 : 0);
