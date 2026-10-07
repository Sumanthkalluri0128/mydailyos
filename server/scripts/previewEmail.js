// Writes a sample weekly email to docs/email-preview.html so you can open it in a browser: node scripts/previewEmail.js
const fs = require('fs'); const path = require('path');
const { renderWeeklyEmail } = require('../lib/emailTemplate');
const { weeklyNutrients } = require('../lib/nutrients');
const days = [['2026-09-28', 1720], ['2026-09-29', 1910], ['2026-09-30', 0], ['2026-10-01', 2280], ['2026-10-02', 1830], ['2026-10-03', 1650], ['2026-10-04', 1860]].map(([date, calories]) => ({ date, calories, waterMl: 2400, exerciseMinutes: 30, protein: calories ? 88 : 0, carbohydrates: calories ? 215 : 0, fat: calories ? 58 : 0, fiber: calories ? 17 : 0 }));
const summary = { from: '2026-09-28', to: '2026-10-04', activeDays: 6, trends: { calories: -4, waterMl: 12, exerciseMinutes: 0, tasksCompleted: null }, averages: { calories: 1875, protein: 88, waterMl: 2400, exerciseMinutes: 30 }, totals: { exerciseMinutes: 210 }, goalDays: { calories: 5, protein: 3, water: 6, exercise: 4 }, weight: { start: 71.2, end: 70.6, change: -0.6 }, bestDay: { date: '2026-10-02', highlights: ['Water goal', 'Protein goal', 'Calories on target'] }, days };
const m = renderWeeklyEmail({ name: 'Asha Rao', summary, nutrients: weeklyNutrients(days, { protein: 112, carbs: 230, fat: 62, fiber: 28 }), plateau: { status: 'plateau', message: 'Your weight has been flat for about 3 weeks. First check logging accuracy (oil, portions, weekends).' }, target: 1900, scoreKeys: ['calories', 'protein', 'water', 'exercise'], appUrl: 'https://flexfit.example', unsubscribeUrl: 'https://api.example/api/email/unsubscribe?token=demo' });
const out = path.join(__dirname, '..', '..', 'docs', 'email-preview.html');
fs.writeFileSync(out, m.html); console.log(`Wrote ${out}\nSubject: ${m.subject}`);
