// Keeps web, phone and server in step: every /api/... path the web or phone app calls must be a route the server really has.
//   node tools/checkApiParity.mjs            (run from the folder that holds web/ and mobile/)
// Exit code 1 when a call has no matching route, so it can run in CI. Dynamic bits (${id}, :id, query strings) are treated as wildcards.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const WEB = path.join(root, 'web'), MOB = path.join(root, 'mobile', 'MyDailyOSMobile');
const walk = (d, ok, out = []) => {
  if (!fs.existsSync(d)) return out;
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git', 'test', 'tests', '__tests__', 'e2e', 'android'].includes(n.name)) continue;
    const p = path.join(d, n.name);
    if (n.isDirectory()) walk(p, ok, out); else if (ok(n.name)) out.push(p);
  }
  return out;
};

// ---- server: mount points + router.METHOD('/path')
const app = fs.readFileSync(path.join(WEB, 'server/app.js'), 'utf8');
const mounts = {};
for (const m of app.matchAll(/app\.use\(\s*['"`](\/api\/[^'"`]+)['"`]\s*,\s*(?:[\w.()]+\s*,\s*)*(\w+)\s*\)/g)) (mounts[m[2]] ||= []).push(m[1]);
const imports = {};
for (const m of app.matchAll(/(?:const|import)\s+(\w+)\s*(?:=\s*require\(|from\s*)['"]\.\/routes\/(\w+)/g)) imports[m[1]] = m[2];
const toRe = (p) => new RegExp('^' + p.replace(/\/+$/, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:\w+/g, '[^/]+').replace(/\*/g, '.*') + '/?$');
const routes = []; // { method, re, text }
for (const [name, bases] of Object.entries(mounts)) {
  const file = imports[name] || name;
  const f = path.join(WEB, 'server/routes', file + '.js');
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const base of bases) {
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]*)['"`]/g)) {
      const full = (base + (m[2] === '/' ? '' : m[2])).replace(/\/+$/, '');
      routes.push({ method: m[1].toUpperCase(), re: toRe(full), text: `${m[1].toUpperCase()} ${full}` });
    }
  }
}
// mounted directly in app.js (health, version, ...)
for (const m of app.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"`](\/api\/[^'"`]*)['"`]/g)) routes.push({ method: m[1].toUpperCase(), re: toRe(m[2]), text: `${m[1].toUpperCase()} ${m[2]}` });

// ---- clients: string literals that start with /api/
const calls = [];
const scan = (files, who) => {
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(['"`])(\/api\/[A-Za-z0-9_\-\/${}.:]*)/g)) {
      let p = m[2].split('?')[0].replace(/\$\{[^}]*\}/g, ':x').replace(/\$\{[^}]*$/, ':x'); // ${id} -> :x; an unfinished ${a ? b : c} too
      p = p.replace(/([A-Za-z0-9_-]):x$/, '$1');                                              // "/api/meal-plans${qs}" is just /api/meal-plans
      if (/\/$/.test(p) && p.length > 5) p = p.slice(0, -1);
      calls.push({ who, file: path.relative(root, f), line: src.slice(0, m.index).split('\n').length, p });
    }
  }
};
scan(walk(path.join(WEB, 'client/src'), (n) => /\.(jsx?|mjs)$/.test(n) && !/\.test\./.test(n)), 'web');
scan(walk(path.join(MOB, 'src'), (n) => /\.(tsx?|js)$/.test(n) && !/\.test\./.test(n)), 'phone');

const seen = new Set(), bad = [];
for (const c of calls) {
  const key = c.who + c.p; if (seen.has(key)) continue; seen.add(key);
  // a call can be a prefix that a method is appended to (`/api/foo/${id}`), so match on path only, any method
  // "/api/import/:x" = the last segment is chosen at run time (preview / commit): fine when ANY route lives under that prefix
  const prefix = c.p.endsWith('/:x') ? c.p.slice(0, -3) : null;
  const preRe = prefix ? new RegExp('^' + prefix.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:x/g, '[^/]+') + '/') : null;
  const dynamicTail = preRe && routes.some((r) => preRe.test(r.text.split(' ')[1].replace(/:\w+/g, ':x')));
  if (!dynamicTail && !routes.some((r) => r.re.test(c.p) || r.re.test(c.p + '/x'))) bad.push(c);
}
console.log(`server routes found: ${routes.length}; distinct client paths checked: ${seen.size}`);
const onlyPhone = [...new Set(calls.filter((c) => c.who === 'phone').map((c) => c.p))].filter((p) => !calls.some((c) => c.who === 'web' && c.p === p));
const onlyWeb = [...new Set(calls.filter((c) => c.who === 'web').map((c) => c.p))].filter((p) => !calls.some((c) => c.who === 'phone' && c.p === p));
if (bad.length) { console.log('\nNO MATCHING SERVER ROUTE:'); for (const b of bad) console.log(`  [${b.who}] ${b.p}   (${b.file}:${b.line})`); }
else console.log('\nEvery client path has a server route.');
console.log(`\nused only by the phone (${onlyPhone.length}): ${onlyPhone.join(', ')}`);
console.log(`\nused only by the web (${onlyWeb.length}): ${onlyWeb.join(', ')}`);
process.exit(bad.length ? 1 : 0);
