// GENERATED from MyDailyOSMobile/src/utils/gymExport.ts (the typed source of truth). Edit that file, then re-run the generator; do not edit this copy.
// Builds the downloadable files for the Gym log (CSV for Excel / Google Sheets, JSON for a full backup).
// Pure text-in, text-out so it is unit-tested; utils/gymShare.ts writes the text to a file and opens the share sheet.
import { SITES, bodyKgOn, DEFAULT_BODY_KG, e1rm, isBodyweightSet, isTimed, navyBodyFat, round1, setKcal, setKm } from './gymMath';
const KG_PER_LB = 0.45359237;
/** One CSV cell. Quotes anything with a comma / quote / newline, and defuses spreadsheet formulas ("=1+1", "@SUM") in free text. */
export function csvCell(v) {
    if (v === null || v === undefined)
        return '';
    let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s))
        s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvRow = (cells) => cells.map(csvCell).join(',');
/** BOM first so Excel opens non-English exercise names / notes correctly. */
export const toCsv = (rows) => '\uFEFF' + rows.map(csvRow).join('\r\n') + '\r\n';
const lb = (kg) => round1(kg / KG_PER_LB);
const byDate = (a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1);
/** One row per SET, so it pivots nicely: date, exercise, set number, weight, reps, estimated 1RM, volume, estimated kcal (at your logged body weight, else 70 kg).
 * A set with no weight is a body weight set: weight_kg stays blank, weight_type says "bodyweight", and set_volume_kg = your body weight on that day x reps. */
export function workoutsCsv(entries, body = []) {
    const rows = [['date', 'exercise', 'category', 'set', 'weight_kg', 'weight_lb', 'count', 'count_unit', 'est_1rm_kg', 'set_volume_kg', 'est_kcal', 'rpe', 'pace_min_per_km', 'distance_km', 'note', 'weight_type']];
    for (const e of [...entries].sort(byDate)) {
        let n = 0;
        const bodyKg = bodyKgOn(body, e.date) || DEFAULT_BODY_KG;
        for (const s of e.sets) {
            if (!(s.reps > 0))
                continue;
            n++;
            const timed = isTimed(e.unit), loaded = s.kg > 0 && !timed, bw = isBodyweightSet(e, s);
            rows.push([e.date, e.name, e.cat, n, loaded ? s.kg : '', loaded ? lb(s.kg) : '', s.reps, e.unit === 'sec' ? 'seconds' : e.unit === 'min' ? 'minutes' : 'reps', loaded ? e1rm(s.kg, s.reps) : '', loaded ? Math.round(s.kg * s.reps) : bw ? Math.round(bodyKg * s.reps) : '', setKcal(e, s, bodyKg), s.rpe ?? '', e.unit === 'min' && s.pace ? s.pace : '', setKm(e, s) || '', n === 1 ? e.note || '' : '', bw ? 'bodyweight' : loaded ? 'weight' : '']);
        }
    }
    return toCsv(rows);
}
/** One row per day of body readings: weight, body fat, every tape site (cm), plus the tape-based body-fat estimate when height/sex are known. */
export function bodyCsv(body, profile) {
    const rows = [['date', 'weight_kg', 'weight_lb', 'body_fat_pct', 'est_body_fat_navy_pct', ...SITES.map((s) => `${s.key}_cm`), 'note']];
    for (const b of [...body].sort(byDate)) {
        const est = navyBodyFat({ sex: profile.sex, heightCm: profile.heightCm, waistCm: b.sites.waist, neckCm: b.sites.neck, hipCm: b.sites.hips });
        rows.push([b.date, b.weightKg ?? '', b.weightKg ? lb(b.weightKg) : '', b.bodyFat ?? '', est ?? '', ...SITES.map((s) => b.sites[s.key] ?? ''), b.note || '']);
    }
    return toCsv(rows);
}
/** Everything in one JSON file: the backup you can keep (and paste back into "Restore" on a new phone). */
export function backupJson(s, now = new Date()) {
    const b = { app: 'flexfit-gymlog', version: 1, exportedAt: now.toISOString(), profile: s.profile, goal: s.goal, entries: [...s.entries].sort(byDate), body: [...s.body].sort(byDate) };
    return JSON.stringify(b, null, 2);
}
/** Reads a backup (or a plain saved state). Returns null if it isn't one, so the screen can say "that doesn't look like a backup". */
export function parseBackup(text) {
    try {
        const o = JSON.parse(text.replace(/^\uFEFF/, ''));
        if (!o || typeof o !== 'object' || !Array.isArray(o.entries) || !Array.isArray(o.body))
            return null;
        if (o.app && o.app !== 'flexfit-gymlog')
            return null;
        return { profile: o.profile || { unit: 'kg' }, goal: o.goal || null, entries: o.entries, body: o.body };
    }
    catch {
        return null;
    }
}
