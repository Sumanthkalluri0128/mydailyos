// ONE version number for web, server and phone. The number lives in version.json (next to web/ and mobile/).
//   node tools/syncVersion.mjs          writes it into every package.json and the phone's app.json
//   node tools/syncVersion.mjs --check  exits 1 when something is out of step (used by CI)
// The Sentry release name is `mydailyos@<version>` everywhere (web build, server, phone).
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error(`version.json: "${version}" is not x.y.z`); process.exit(1); }
const check = process.argv.includes('--check');
const targets = [
  ['web/package.json', (j) => { j.version = version; }, (j) => j.version],
  ['web/client/package.json', (j) => { j.version = version; }, (j) => j.version],
  ['web/server/package.json', (j) => { j.version = version; }, (j) => j.version],
  ['mobile/MyDailyOSMobile/package.json', (j) => { j.version = version; }, (j) => j.version],
  ['mobile/MyDailyOSMobile/app.json', (j) => { j.expo.version = version; }, (j) => j.expo.version],
];
let bad = 0;
for (const [file, set, get] of targets) {
  const p = path.join(root, file);
  const raw = fs.readFileSync(p, 'utf8');
  const json = JSON.parse(raw);
  if (get(json) === version) { console.log(`ok    ${file}`); continue; }
  if (check) { console.log(`DIFF  ${file} is ${get(json)}, version.json says ${version}`); bad++; continue; }
  set(json);
  fs.writeFileSync(p, JSON.stringify(json, null, raw.includes('\n  "') ? 2 : 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`set   ${file} -> ${version}`);
}
process.exit(bad ? 1 : 0);
