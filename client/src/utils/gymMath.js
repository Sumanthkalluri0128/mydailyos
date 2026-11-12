// GENERATED from MyDailyOSMobile/src/utils/gymMath.ts (the typed source of truth). Edit that file, then re-run the generator; do not edit this copy.
// Pure maths for the Gym log (no React, no storage, no network), so it can be unit-tested and reused by the export.
// Everything is stored in kg and cm; screens convert to the person's unit at the edges (utils/units.ts).
// Nothing in here (or in gymStore / gymShare) calls the API. The only automatic upload is utils/gymSyncRunner.ts: each exercise's name, sets, minutes and kcal.
/** Tape-measure sites, in the order they are shown. `better` says which direction usually means progress (used for the colour of a change). */
export const SITES = [
    { key: 'neck', label: 'Neck', hint: 'Just below the larynx' },
    { key: 'shoulders', label: 'Shoulders', hint: 'Around the widest point, arms relaxed' },
    { key: 'chest', label: 'Chest', hint: 'Across the nipple line, after breathing out' },
    { key: 'waist', label: 'Waist', hint: 'At the navel, relaxed' },
    { key: 'hips', label: 'Hips', hint: 'Widest part of the buttocks' },
    { key: 'bicepL', label: 'Left bicep', hint: 'Flexed or relaxed – pick one and stick to it' },
    { key: 'bicepR', label: 'Right bicep', hint: 'Same as the left' },
    { key: 'forearm', label: 'Forearm', hint: 'Widest part' },
    { key: 'thighL', label: 'Left thigh', hint: 'Halfway between hip and knee' },
    { key: 'thighR', label: 'Right thigh', hint: 'Same as the left' },
    { key: 'calf', label: 'Calf', hint: 'Widest part' },
];
export const SITE_LABEL = Object.fromEntries(SITES.map((s) => [s.key, s.label]));
export const METRIC_LABEL = { weightKg: 'Body weight', bodyFat: 'Body fat', ...SITE_LABEL };
export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;
// ------------------------------------------------------------------------------------------------ dates
/** Whole days since 1970 for a YYYY-MM-DD date (timezone-proof: uses UTC). */
export function dayNum(date) {
    const [y, m, d] = date.split('-').map(Number);
    return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}
export function dateFromDayNum(n) {
    const d = new Date(n * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export const shiftDate = (date, days) => dateFromDayNum(dayNum(date) + days);
/** Monday of the week a date is in. */
export function weekStart(date) {
    const dow = (dayNum(date) + 3) % 7; // 1970-01-01 was a Thursday: Monday = 0
    return dateFromDayNum(dayNum(date) - dow);
}
// ------------------------------------------------------------------------------------------------ lifting
/** Estimated one-rep max (Epley), the same formula the Workout tab uses. Only meaningful for loaded, rep-based sets. */
export function e1rm(kg, reps) {
    if (!(kg > 0) || !(reps >= 1))
        return 0;
    const r = Math.min(reps, 30);
    return r === 1 ? round1(kg) : round1(kg * (1 + r / 30));
}
export const isTimed = (unit) => unit === 'sec' || unit === 'min';
export const validSets = (e) => e.sets.filter((s) => s.reps > 0);
export function entryVolume(e) {
    if (isTimed(e.unit))
        return 0;
    return Math.round(validSets(e).reduce((n, s) => n + (s.kg > 0 ? s.kg * s.reps : 0), 0));
}
export const entrySetCount = (e) => validSets(e).length;
export function entryTotalReps(e) { return validSets(e).reduce((n, s) => n + s.reps, 0); }
export function topSet(e) {
    const v = validSets(e);
    if (!v.length)
        return null;
    return v.reduce((best, s) => {
        if (isTimed(e.unit))
            return s.reps > best.reps ? s : best;
        const a = e1rm(s.kg, s.reps) || s.reps, b = e1rm(best.kg, best.reps) || best.reps; // bodyweight sets have no e1RM: rank them by reps
        return s.kg > 0 || best.kg > 0 ? (a > b ? s : best) : (s.reps > best.reps ? s : best);
    });
}
export const entryBestE1rm = (e) => (isTimed(e.unit) ? 0 : validSets(e).reduce((m, s) => Math.max(m, e1rm(s.kg, s.reps)), 0));
/** Compact "3 × 10 @ 40 kg" style line. `fmtKg` converts kg for display. */
export function setsLine(e, fmtKg = (k) => `${k} kg`) {
    const v = validSets(e);
    if (!v.length)
        return 'No sets';
    const u = e.unit === 'sec' ? 's' : e.unit === 'min' ? ' min' : '';
    const same = v.every((s) => s.kg === v[0].kg && s.reps === v[0].reps && s.pace === v[0].pace);
    const one = (s) => `${s.reps}${u}${s.kg > 0 && !isTimed(e.unit) ? ` @ ${fmtKg(s.kg)}` : ''}${e.unit === 'min' && s.pace ? ` @ ${fmtPace(s.pace)}/km` : ''}`;
    if (same && v.length > 1)
        return `${v.length} × ${one(v[0])}`;
    return v.map(one).join(', ');
}
const byTime = (a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1);
/** Most recent earlier entry for an exercise (used to prefill the form and to show "last time"). */
export function lastFor(entries, exId, beforeDate, excludeId) {
    const list = entries.filter((e) => e.exId === exId && e.id !== excludeId && (!beforeDate || e.date <= beforeDate)).sort(byTime);
    return list.length ? list[list.length - 1] : null;
}
/** Personal records set by `entry` compared with everything logged for that exercise before it. First time ever is not a PR (nothing to beat). */
export function detectPRs(entries, entry) {
    const before = entries.filter((e) => e.exId === entry.exId && e.id !== entry.id && (e.date < entry.date || (e.date === entry.date && e.at < entry.at)));
    if (!before.length)
        return [];
    const out = [];
    if (isTimed(entry.unit)) {
        const best = Math.max(...before.map((e) => Math.max(0, ...validSets(e).map((s) => s.reps))));
        const now = Math.max(0, ...validSets(entry).map((s) => s.reps));
        if (now > best)
            out.push({ kind: 'reps', value: now, prev: best });
        return out;
    }
    const maxKg = (e) => Math.max(0, ...validSets(e).map((s) => s.kg));
    const prevKg = Math.max(...before.map(maxKg)), nowKg = maxKg(entry);
    if (nowKg > 0 && nowKg > prevKg)
        out.push({ kind: 'weight', value: nowKg, prev: prevKg });
    const prevE = Math.max(...before.map(entryBestE1rm)), nowE = entryBestE1rm(entry);
    if (nowE > 0 && nowE > prevE && !(out.length && out[0].kind === 'weight'))
        out.push({ kind: 'e1rm', value: nowE, prev: prevE });
    if (nowKg === 0) {
        const prevR = Math.max(...before.map((e) => Math.max(0, ...validSets(e).map((s) => s.reps)))), nowR = Math.max(0, ...validSets(entry).map((s) => s.reps));
        if (nowR > prevR)
            out.push({ kind: 'reps', value: nowR, prev: prevR });
    }
    return out;
}
export function dayStats(entries, date) {
    const list = entries.filter((e) => e.date === date);
    return { exercises: list.length, sets: list.reduce((n, e) => n + entrySetCount(e), 0), volumeKg: list.reduce((n, e) => n + entryVolume(e), 0) };
}
export function rangeStats(entries, from, to) {
    const list = entries.filter((e) => e.date >= from && e.date <= to);
    return { days: new Set(list.map((e) => e.date)).size, exercises: list.length, sets: list.reduce((n, e) => n + entrySetCount(e), 0), volumeKg: list.reduce((n, e) => n + entryVolume(e), 0) };
}
/** Training days per week, oldest first, for the last `weeks` weeks (including the one `endDate` is in). */
export function weeklyDays(entries, endDate, weeks = 8) {
    const out = [];
    const last = weekStart(endDate);
    for (let i = weeks - 1; i >= 0; i--) {
        const start = shiftDate(last, -7 * i), end = shiftDate(start, 6);
        const r = rangeStats(entries, start, end);
        out.push({ start, days: r.days, volumeKg: r.volumeKg });
    }
    return out;
}
/** Consecutive days (ending today or yesterday) with at least one logged exercise. */
export function loggingStreak(entries, today) {
    const days = new Set(entries.map((e) => e.date));
    let d = days.has(today) ? today : shiftDate(today, -1), n = 0;
    while (days.has(d)) {
        n++;
        d = shiftDate(d, -1);
    }
    return n;
}
/** One point per training day for an exercise (best set of the day), oldest first. */
export function exerciseSeries(entries, exId) {
    const by = new Map();
    for (const e of entries.filter((x) => x.exId === exId).sort(byTime)) {
        const cur = by.get(e.date) || { date: e.date, e1rm: 0, topKg: 0, topReps: 0, volumeKg: 0 };
        for (const s of validSets(e)) {
            cur.topKg = Math.max(cur.topKg, s.kg);
            cur.topReps = Math.max(cur.topReps, s.reps);
        }
        cur.e1rm = Math.max(cur.e1rm, entryBestE1rm(e));
        cur.volumeKg += entryVolume(e);
        by.set(e.date, cur);
    }
    return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
/** Exercises the person has logged, most recently used first, with how many times. */
export function exercisesUsed(entries) {
    const m = new Map();
    for (const e of entries) {
        const c = m.get(e.exId);
        if (!c)
            m.set(e.exId, { exId: e.exId, name: e.name, cat: e.cat, unit: e.unit, count: 1, last: e.date });
        else {
            c.count++;
            if (e.date > c.last) {
                c.last = e.date;
                c.name = e.name;
            }
        }
    }
    return [...m.values()].sort((a, b) => (a.last === b.last ? b.count - a.count : a.last < b.last ? 1 : -1));
}
export function seriesOf(body, key) {
    const out = [];
    for (const b of [...body].sort((x, y) => (x.date === y.date ? x.at - y.at : x.date < y.date ? -1 : 1))) {
        const v = key === 'weightKg' ? b.weightKg : key === 'bodyFat' ? b.bodyFat : b.sites[key];
        if (typeof v === 'number' && v > 0)
            out.push({ date: b.date, value: v });
    }
    return out;
}
export const latestOf = (body, key) => { const s = seriesOf(body, key); return s.length ? s[s.length - 1] : null; };
/** Smoothed trend (exponential moving average by day gap) so one salty day doesn't look like fat gain. */
export function trendOf(points, halfLifeDays = 4) {
    const out = [];
    let prev = null, t = 0;
    for (const p of points) {
        if (!prev)
            t = p.value;
        else {
            const gap = Math.max(1, dayNum(p.date) - dayNum(prev.date));
            const a = 1 - Math.pow(0.5, gap / halfLifeDays);
            t = t + a * (p.value - t);
        }
        out.push({ date: p.date, value: round2(t) });
        prev = p;
    }
    return out;
}
/** Least-squares slope in units per week over the last `windowDays` days. null when there is not enough data (needs 2+ readings spanning 7+ days). */
export function ratePerWeek(points, today, windowDays = 28) {
    const from = dayNum(today) - windowDays;
    let p = points.filter((x) => dayNum(x.date) >= from);
    if (p.length < 2)
        p = points.slice(-3); // sparse data: fall back to the last few readings
    if (p.length < 2)
        return null;
    const xs = p.map((x) => dayNum(x.date)), span = Math.max(...xs) - Math.min(...xs);
    if (span < 7)
        return null;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = p.reduce((a, b) => a + b.value, 0) / p.length;
    let num = 0, den = 0;
    p.forEach((q, i) => { num += (xs[i] - mx) * (q.value - my); den += (xs[i] - mx) ** 2; });
    return den ? round2((num / den) * 7) : null;
}
/** How far along a goal is: start = first reading on/after the goal's start date (or the very first reading), current = latest. */
export function goalProgress(body, key, target, goal, today) {
    if (!(typeof target === 'number' && target > 0))
        return null;
    const all = seriesOf(body, key);
    if (!all.length)
        return null;
    const startPt = (goal && all.find((p) => p.date >= goal.startDate)) || all[0];
    const cur = all[all.length - 1];
    const start = startPt.value, current = cur.value;
    const dir = Math.sign(target - start); // +1 gain, -1 lose, 0 already there / maintain
    const reached = dir === 0 ? Math.abs(current - target) < 0.05 : dir > 0 ? current >= target : current <= target;
    let pct = dir === 0 ? (reached ? 100 : 0) : ((current - start) / (target - start)) * 100;
    pct = reached ? 100 : Math.max(0, Math.min(100, pct));
    const remaining = round1(target - current);
    const rate = ratePerWeek(all, today);
    let etaDate = null, etaWeeks = null;
    if (!reached && rate !== null && rate !== 0 && Math.sign(rate) === Math.sign(remaining)) {
        etaWeeks = Math.abs(remaining / rate);
        if (etaWeeks < 520)
            etaDate = shiftDate(today, Math.round(etaWeeks * 7));
        else
            etaWeeks = null;
    }
    let neededPerWeek = null, onTrack = null;
    if (goal?.targetDate && !reached) {
        const weeksLeft = (dayNum(goal.targetDate) - dayNum(today)) / 7;
        if (weeksLeft > 0) {
            neededPerWeek = round2(remaining / weeksLeft);
            onTrack = rate !== null && Math.sign(rate) === Math.sign(remaining) && Math.abs(rate) >= Math.abs(neededPerWeek) * 0.85;
        }
        else {
            onTrack = false;
        }
    }
    return { key, start, current, target, pct: Math.round(pct), remaining, reached, ratePerWeek: rate, etaDate, etaWeeks: etaWeeks === null ? null : round1(etaWeeks), neededPerWeek, onTrack };
}
/** Change between the first and last reading, and between the last two. */
export function changeOf(points) {
    if (points.length < 2)
        return { sinceStart: null, sinceLast: null };
    const last = points[points.length - 1].value;
    return { sinceStart: round1(last - points[0].value), sinceLast: round1(last - points[points.length - 2].value) };
}
// ------------------------------------------------------------------------------------------------ body composition (estimates)
export const bmi = (kg, cm) => (kg && cm && kg > 0 && cm > 0 ? round1(kg / ((cm / 100) ** 2)) : null);
export const waistToHeight = (waist, cm) => (waist && cm ? round2(waist / cm) : null);
export const waistToHip = (waist, hips) => (waist && hips ? round2(waist / hips) : null);
/** US Navy body-fat estimate from tape measurements (same formula as the server's lib/bodyFat.js). An estimate for tracking change, not a medical measurement. */
export function navyBodyFat(a) {
    const h = Number(a.heightCm), w = Number(a.waistCm), n = Number(a.neckCm), hip = Number(a.hipCm);
    if (!(h > 0 && w > 0 && n > 0))
        return null;
    let bf;
    if (a.sex === 'female') {
        if (!(hip > 0) || w + hip - n <= 0)
            return null;
        bf = 495 / (1.29579 - 0.35004 * Math.log10(w + hip - n) + 0.221 * Math.log10(h)) - 450;
    }
    else {
        if (a.sex !== 'male' || w - n <= 0)
            return null;
        bf = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450;
    }
    if (!Number.isFinite(bf))
        return null;
    return round1(Math.min(60, Math.max(3, bf)));
}
export const leanMassKg = (kg, fatPct) => (kg && fatPct && fatPct > 0 && fatPct < 100 ? round1(kg * (1 - fatPct / 100)) : null);
// ------------------------------------------------------------------------------------------------ input parsing
/** A number typed by the person ("72,5" works). null for blank / not a positive number / outside [min, max]. */
export function parseNum(text, min = 0, max = 100000) {
    if (text === undefined)
        return null;
    const t = String(text).trim().replace(',', '.');
    if (!t)
        return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 && n >= min && n <= max ? n : null;
}
// ------------------------------------------------------------------------------------------------ calories burned (estimate)
// Same formula as the rest of the app (utils/workoutEngine.estimateKcal): MET x 3.5 x body kg / 200 per minute.
// Time per set = reps x ~3 s of work + ~60 s rest (holds use their own seconds, cardio uses its minutes). It is an ESTIMATE:
// real burn depends on effort, rest and fitness, and lifting burns far less than most gym-machine numbers suggest.
export const DEFAULT_BODY_KG = 70;
export const REST_SEC = 60, TEMPO_SEC = 3;
const ISOLATION = /curl|extension|raise|fly|kickback|pushdown|shrug|crunch|twist|wrist|calf|abduction|adduction|pullover|face pull|pec deck|rear delt|woodchopper|pallof|toe touch|hydrant|donkey|svend|superman|bird dog|dead bug/i;
/** MET (energy intensity) for an exercise, by what it is. Compendium-style values, rounded. */
export function metFor(cat, name, unit) {
    const c = String(cat || '').toLowerCase(), n = String(name || '').toLowerCase();
    if (c === 'cardio' || unit === 'min') {
        if (/burpee|sprint|hiit|battle|boxing|bag|assault|jump rope|sled/.test(n))
            return 9;
        if (/run/.test(n))
            return 9;
        if (/stair/.test(n))
            return 8;
        if (/rowing|swim|stationary bike|bike|cycling/.test(n))
            return /outdoor/.test(n) ? 7.5 : 7;
        if (/incline.*walk/.test(n))
            return 5;
        if (/walk/.test(n))
            return 3.8;
        if (/elliptical/.test(n))
            return 5;
        if (/high knees/.test(n))
            return 8;
        if (/yoga/.test(n))
            return 2.5;
        if (/stretch/.test(n))
            return 2.3;
        return 6;
    }
    if (unit === 'sec')
        return /carry/.test(n) ? 5 : 3; // holds: planks, wall sits, carries
    if (/swing|thruster|clean|snatch|slam|wall ball|get-up|burpee|jump|box jump/.test(n))
        return 6;
    if (ISOLATION.test(n) || c === 'core')
        return 3.5;
    return 5; // compound lifts: squat, deadlift, presses, rows, pull-ups, dips
}
// ------------------------------------------------------------------------------------------------ treadmill pace
// For minute-timed cardio the person can add an average pace (min per km). Calories then come from the actual speed instead of a flat guess:
// ACSM metabolic equations on level ground, VO2 (ml/kg/min) = 0.1 x speed (m/min) + 3.5 walking, 0.2 x speed + 3.5 running; MET = VO2 / 3.5.
// Between 6 and 8 km/h the two are blended, so there is no jump when you go from a brisk walk to a jog. No pace = the old per-exercise MET.
export const PACE_MIN = 2, PACE_MAX = 30; // min per km that we accept (30 km/h .. 2 km/h)
export const speedKph = (pace) => (pace > 0 ? round1(60 / pace) : 0);
export function metForPace(pace) {
    const v = 60 / pace, m = (v * 1000) / 60; // km/h and m/min
    const walk = 1 + (0.1 * m) / 3.5, run = 1 + (0.2 * m) / 3.5;
    if (v <= 6)
        return walk;
    if (v >= 8)
        return run;
    return walk + ((run - walk) * (v - 6)) / 2;
}
/** A pace typed by the person: "6:30" (min:sec per km) or "6.5" / "6,5" (decimal minutes). null when blank or outside 2:00 - 30:00. */
export function parsePace(text) {
    if (text === undefined)
        return null;
    const t = String(text).trim().replace(',', '.');
    if (!t)
        return null;
    let p;
    const c = t.match(/^(\d{1,2}):(\d{1,2})$/);
    if (c) {
        const sec = Number(c[2]);
        if (sec >= 60)
            return null;
        p = Number(c[1]) + sec / 60;
    }
    else {
        p = Number(t);
        if (!Number.isFinite(p))
            return null;
    }
    return p >= PACE_MIN && p <= PACE_MAX ? Math.round(p * 1000) / 1000 : null;
}
/** 6.5 -> "6:30" */
export function fmtPace(pace) {
    let m = Math.floor(pace), s = Math.round((pace - m) * 60);
    if (s === 60) {
        m += 1;
        s = 0;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}
/** Distance covered by one minute-timed set with a pace, in km (0 when there is no pace). */
export const setKm = (e, s) => (e.unit === 'min' && s.pace && s.pace > 0 ? Math.round((s.reps / s.pace) * 100) / 100 : 0);
export const entryKm = (e) => Math.round(validSets(e).reduce((n, s) => n + setKm(e, s), 0) * 100) / 100;
/** MET for one set: from the pace when there is one, otherwise from what the exercise is. */
export const setMet = (e, s) => (e.unit === 'min' && s.pace && s.pace >= PACE_MIN ? metForPace(s.pace) : metFor(e.cat, e.name, e.unit));
export function setMinutes(unit, s) {
    if (unit === 'min')
        return Math.max(0, s.reps);
    if (unit === 'sec')
        return (Math.max(0, s.reps) + REST_SEC) / 60;
    return (Math.max(0, s.reps) * TEMPO_SEC + REST_SEC) / 60;
}
export function entryMinutes(e) { return validSets(e).reduce((n, s) => n + setMinutes(e.unit, s), 0); }
/** Estimated kcal for one logged exercise at a given body weight. */
export function entryKcal(e, bodyKg = DEFAULT_BODY_KG) {
    const kg = bodyKg > 0 ? bodyKg : DEFAULT_BODY_KG;
    return Math.round(validSets(e).reduce((n, s) => n + setMet(e, s) * 3.5 * kg / 200 * setMinutes(e.unit, s), 0));
}
/** Kcal for a single set (used in the CSV). Includes that set's share of rest. */
export function setKcal(e, s, bodyKg = DEFAULT_BODY_KG) {
    const kg = bodyKg > 0 ? bodyKg : DEFAULT_BODY_KG;
    return Math.round(setMet(e, s) * 3.5 * kg / 200 * setMinutes(e.unit, s) * 10) / 10;
}
/** The person's logged body weight for a date: the latest reading on or before it, else the earliest after it, else null. */
export function bodyKgOn(body, date) {
    const w = seriesOf(body, 'weightKg');
    if (!w.length)
        return null;
    let best = null;
    for (const p of w)
        if (p.date <= date)
            best = p;
    return (best || w[0]).value;
}
export function kcalIn(entries, body, from, to) {
    return entries.filter((e) => e.date >= from && e.date <= to).reduce((n, e) => n + entryKcal(e, bodyKgOn(body, e.date) || DEFAULT_BODY_KG), 0);
}
