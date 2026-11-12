// GENERATED from MyDailyOSMobile/src/utils/gymClean.ts (the typed source of truth). Edit that file, then re-run the generator; do not edit this copy.
const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined);
const str = (x, d = '') => (typeof x === 'string' ? x : d);
const isDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
export function cleanSet(s) {
    if (!s || typeof s !== 'object')
        return null;
    const reps = Number(s.reps), kg = Number(s.kg) || 0;
    if (!(reps > 0) || kg < 0)
        return null;
    const out = { kg, reps };
    if (Number(s.rpe) >= 1 && Number(s.rpe) <= 10)
        out.rpe = Number(s.rpe);
    return out;
}
export function cleanEntry(e) {
    if (!e || typeof e.id !== 'string' || !isDate(e.date) || typeof e.exId !== 'string' || !Array.isArray(e.sets))
        return null;
    const sets = e.sets.map(cleanSet).filter(Boolean);
    if (!sets.length)
        return null;
    const unit = e.unit === 'sec' || e.unit === 'min' ? e.unit : 'reps';
    return { id: e.id, date: e.date, exId: e.exId, name: str(e.name, e.exId), cat: str(e.cat, 'Other'), unit, sets, note: str(e.note) || undefined, at: Number(e.at) || 0 };
}
export function cleanBody(b) {
    if (!b || typeof b.id !== 'string' || !isDate(b.date))
        return null;
    const sites = {};
    if (b.sites && typeof b.sites === 'object')
        for (const k of Object.keys(b.sites)) {
            const v = num(b.sites[k]);
            if (v)
                sites[k] = v;
        }
    const out = { id: b.id, date: b.date, sites, at: Number(b.at) || 0 };
    const w = num(b.weightKg), f = num(b.bodyFat);
    if (w)
        out.weightKg = w;
    if (f)
        out.bodyFat = f;
    if (str(b.note))
        out.note = str(b.note);
    if (!out.weightKg && !out.bodyFat && !Object.keys(sites).length)
        return null;
    return out;
}
export function sane(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const g = o.goal && typeof o.goal === 'object' && isDate(o.goal.startDate) ? o.goal : null;
    const goal = g ? { startDate: g.startDate, targetDate: isDate(g.targetDate) ? g.targetDate : undefined, weightKg: num(g.weightKg), bodyFat: num(g.bodyFat), sites: Object.fromEntries(Object.entries(g.sites || {}).filter(([, v]) => num(v))) } : null;
    const p = o.profile && typeof o.profile === 'object' ? o.profile : {};
    return {
        v: 1,
        entries: (Array.isArray(o.entries) ? o.entries : []).map(cleanEntry).filter(Boolean),
        body: (Array.isArray(o.body) ? o.body : []).map(cleanBody).filter(Boolean),
        goal,
        profile: { unit: p.unit === 'lb' ? 'lb' : 'kg', heightCm: num(p.heightCm), sex: p.sex === 'male' || p.sex === 'female' ? p.sex : undefined },
    };
}
