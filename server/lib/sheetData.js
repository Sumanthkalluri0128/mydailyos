// Turns a user's FlexFit data into spreadsheet tabs (arrays of rows). Pure — no DB, no network — so it is unit-tested.
// Row 1 of every tab is a header. Numbers stay numbers so the person can chart them straight away in Sheets.

const TAB_NAMES = ['Daily summary', 'Food', 'Water', 'Weight', 'Exercise', 'Tasks', 'Habits', 'Health', 'Fasting', 'Profile'];
const MAX_ROWS = 20000;

const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const byDate = (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || ''));
const iso = (d) => (d ? new Date(d).toISOString() : '');
const cap = (rows) => rows.slice(-MAX_ROWS);

function dailySummary({ foodLogs = [], waterLogs = [], weightLogs = [], activityLogs = [], healthLogs = [], tasks = [] }) {
  const days = new Map();
  const day = (d) => { if (!days.has(d)) days.set(d, { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0, burned: 0, minutes: 0, steps: 0, weight: '', tasksDone: 0, tasksTotal: 0 }); return days.get(d); };
  for (const f of foodLogs) { const x = day(f.date); const n = f.nutritionTotal || {}; x.calories += n.calories || 0; x.protein += n.protein || 0; x.carbs += n.carbohydrates || 0; x.fat += n.fat || 0; }
  for (const w of waterLogs) day(w.date).water += w.amountMl || 0;
  for (const a of activityLogs) { const x = day(a.date); x.burned += a.caloriesBurned || 0; x.minutes += a.durationMinutes || 0; }
  for (const h of healthLogs) if (h.type === 'steps') day(h.date).steps = Math.max(day(h.date).steps, h.value || 0);
  for (const w of [...weightLogs].sort(byDate)) day(w.date).weight = r1(w.weightKg);
  for (const t of tasks) { const x = day(t.date); x.tasksTotal += 1; if (t.completed) x.tasksDone += 1; }
  const header = ['Date', 'Calories eaten', 'Protein g', 'Carbs g', 'Fat g', 'Water ml', 'Workout kcal burned', 'Exercise min', 'Steps', 'Weight kg', 'Tasks done', 'Tasks total'];
  const rows = [...days.keys()].sort().map((d) => { const x = days.get(d); return [d, Math.round(x.calories), r1(x.protein), r1(x.carbs), r1(x.fat), Math.round(x.water), Math.round(x.burned), Math.round(x.minutes), Math.round(x.steps), x.weight, x.tasksDone, x.tasksTotal]; });
  return [header, ...cap(rows)];
}

function buildTabs(d) {
  const meal = (m) => (m ? m[0].toUpperCase() + m.slice(1) : '');
  const food = [['Date', 'Meal', 'Food', 'Quantity', 'Unit', 'Servings', 'Calories', 'Protein g', 'Carbs g', 'Fat g']]
    .concat(cap([...(d.foodLogs || [])].sort(byDate).map((f) => [f.date, meal(f.mealType), f.foodName, r1(f.consumedQuantity), f.servingUnit, r1(f.servings), Math.round(f.nutritionTotal?.calories || 0), r1(f.nutritionTotal?.protein), r1(f.nutritionTotal?.carbohydrates), r1(f.nutritionTotal?.fat)])));
  const water = [['Date', 'Amount ml', 'Logged at']].concat(cap([...(d.waterLogs || [])].sort(byDate).map((w) => [w.date, w.amountMl, iso(w.createdAt)])));
  const weight = [['Date', 'Weight kg', 'Notes']].concat(cap([...(d.weightLogs || [])].sort(byDate).map((w) => [w.date, r1(w.weightKg), w.notes || ''])));
  const exercise = [['Date', 'Activity', 'Category', 'Minutes', 'Calories burned', 'Calories source', 'Sets (reps x kg)']]
    .concat(cap([...(d.activityLogs || [])].sort(byDate).map((a) => [a.date, a.activityName, a.category, Math.round(a.durationMinutes || 0), Math.round(a.caloriesBurned || 0), a.caloriesSource || '', (a.sets || []).map((s) => `${s.reps}x${s.weightKg || 0}`).join('; ')])));
  const tasks = [['Date', 'Time', 'Task', 'Priority', 'Category', 'Done', 'Repeats', 'Notes']]
    .concat(cap([...(d.tasks || [])].sort(byDate).map((t) => [t.date, t.time || '', t.title, t.priority, t.category, t.completed ? 'Yes' : 'No', t.recurrence || 'none', t.notes || ''])));
  const habits = [['Date', 'Habit', 'Done', 'Target', 'Unit', 'Completed']]
    .concat(cap([...(d.habitLogs || [])].sort(byDate).map((h) => [h.date, h.habitName, h.completedValue, h.target, h.unit, h.completed ? 'Yes' : 'No'])));
  const health = [['Date', 'Type', 'Value', 'Value 2', 'Source']]
    .concat(cap([...(d.healthLogs || [])].sort(byDate).map((h) => [h.date, h.type, h.value, h.value2 ?? '', h.source || ''])));
  const fasting = [['Started', 'Ended', 'Target hours', 'Hours fasted']]
    .concat(cap([...(d.fasts || [])].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt)).map((f) => [iso(f.startedAt), iso(f.endedAt), f.targetHours, f.endedAt ? r1((new Date(f.endedAt) - new Date(f.startedAt)) / 3.6e6) : ''])));
  const p = d.profile || {}; const g = p.goals || {};
  const profile = [
    ['Field', 'Value'],
    ['Name', d.user?.name || p.name || ''], ['Email', d.user?.email || ''],
    ['Age', p.age ?? ''], ['Sex', p.sex || ''], ['Height cm', p.heightCm ?? ''], ['Current weight kg', p.currentWeightKg ?? ''],
    ['Activity level', p.activityLevel || ''], ['Calorie target', g.calorieTarget ?? ''], ['Protein target g', g.proteinTarget ?? ''],
    ['Water target ml', g.waterTargetMl ?? ''], ['Steps target', g.stepsTarget ?? ''], ['Goal weight kg', g.targetWeightKg ?? ''],
    ['Last synced (UTC)', new Date(d.now || Date.now()).toISOString()],
    ['Note', 'This sheet is a live copy written by FlexFit. Edits you make here are overwritten on the next sync — copy data to another tab/file to keep your own analysis.'],
  ];
  return { 'Daily summary': dailySummary(d), Food: food, Water: water, Weight: weight, Exercise: exercise, Tasks: tasks, Habits: habits, Health: health, Fasting: fasting, Profile: profile };
}

module.exports = { buildTabs, dailySummary, TAB_NAMES, MAX_ROWS };
