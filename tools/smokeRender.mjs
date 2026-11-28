// Renders the main screens with no profile, an empty profile and a full profile, and fails on any crash.
// A blank page after deploy ("Cannot read properties of null") is exactly what this catches.
//   cd client && node ../tools/smokeRender.mjs            (needs `npm install` in client/: it uses esbuild, react and react-dom from there)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const clientDir = path.resolve(process.argv[2] || process.cwd());
const require = createRequire(path.join(clientDir, 'package.json'));
const { build } = require('esbuild');
const React = require('react');
const { renderToString } = require('react-dom/server');
const SRC = path.join(clientDir, 'src');
const OUT = path.join(clientDir, 'node_modules', '.smoke');
fs.mkdirSync(OUT, { recursive: true });
const noop = () => {};
const FULL = { sex: 'male', age: 30, heightCm: 175, currentWeightKg: 88, activityLevel: 'moderate', name: 'Test User',
  plan: { active: true, startKg: 90, targetKg: 80, startDate: '2026-10-01', paceKg: 0.5 },
  goals: { bodyType: 'athletic', targetWeightKg: 80, weeklyPaceKg: 0.5, calorieMode: 'auto' },
  progress: { direction: 'lose', startKg: 90, currentKg: 86.4, targetKg: 80, totalKg: 10, doneKg: 3.6, remainingKg: 6.4, pct: 36, weeksLeft: 13, reached: false } };
const home = (profile) => ({ profile, summary: { calories: 900, protein: 50, meals: {} }, activity: {}, water: { totalMl: 500 }, waterTarget: 3000, latestWeight: 86.4, weightHistory: [], tasks: [], habits: [], habitLogs: [], setTasks: noop, setHabit: noop, goTo: noop, onAsk: noop, onChanged: noop });
const rings = (profile) => ({ summary: {}, water: {}, activity: {}, goals: {}, profile });
const cases = [];
for (const [label, profile] of [['no profile', null], ['empty profile', {}], ['full profile', FULL]]) {
  cases.push([`MacroCard (${label})`, 'components/MacroCard.jsx', { profile, summary: {} }]);
  cases.push([`HomeFocus (${label})`, 'components/HomeFocus.jsx', home(profile)]);
  cases.push([`HomeDashboard (${label})`, 'components/home/HomeDashboard.jsx', home(profile)]);
  cases.push([`GoalRings (${label})`, 'components/GoalRings.jsx', rings(profile)]);
}
cases.push(['WorkoutPlanPage', 'pages/WorkoutPlanPage.jsx', { profile: null }], ['AccountPage', 'pages/AccountPage.jsx', {}]);
let bad = 0;
for (const [name, file, props] of cases) {
  try {
    const out = path.join(OUT, name.replace(/\W+/g, '_') + '.mjs');
    await build({ entryPoints: [path.join(SRC, file)], bundle: true, format: 'esm', platform: 'node', outfile: out, jsx: 'automatic', external: ['react', 'react-dom'], logLevel: 'silent',
      loader: { '.js': 'jsx', '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.json': 'json' }, define: { 'import.meta.env': '{"VITE_API_URL":""}' } });
    const mod = await import(pathToFileURL(out).href);
    renderToString(React.createElement(mod.default, props));
    console.log('ok    ' + name);
  } catch (e) { bad += 1; console.log('FAIL  ' + name + ' -> ' + String(e.message).split('\n')[0]); }
}
process.exit(bad ? 1 : 0);
