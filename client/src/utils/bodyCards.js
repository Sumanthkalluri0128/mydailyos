// Turns GET /api/coach/body into the sections the "Body progress" screen shows, in the person's language.
// Pure and shared byte-for-byte with the phone app (tools/checkSharedFiles.mjs): both screens only draw what this returns.
// Section: { id, title, level: "good" | "warn" | "info", lines: string[], action?: { kind: "taper", label, key } }
const n1 = (x) => (Math.round(Number(x) * 10) / 10).toString();
const k = (x) => Math.round(Number(x) || 0).toLocaleString();
const signed = (x) => (Number(x) > 0 ? `+${n1(x)}` : n1(x));

export function bodySections(t, b) {
  if (!b || !b.success) return [];
  const out = [];
  const add = (s) => out.push({ level: "info", lines: [], ...s });

  const f = b.fatLean;
  if (f && f.ready) {
    const lines = [t(`coach.body.fat.v.${f.verdict}`)];
    lines.push(f.tapeOnly ? t("coach.body.fat.tape", { waist: signed(f.waistChangeCm) })
      : t("coach.body.fat.detail", { waist: signed(f.waistChangeCm), fat: signed(f.fat), fatLo: signed(f.fatRange[0]), fatHi: signed(f.fatRange[1]), lean: signed(f.lean), leanLo: signed(f.leanRange[0]), leanHi: signed(f.leanRange[1]) }));
    add({ id: "fat", title: t("coach.body.fat.title"), level: f.verdict === "muscle-loss" || f.verdict === "fat-gain" ? "warn" : f.verdict === "unclear" ? "info" : "good", lines });
  }
  if (b.recomp) add({ id: "recomp", title: t("coach.body.recomp.title"), level: "good", lines: [t("coach.body.recomp.detail", { waist: n1(Math.abs(b.recomp.waistChangeCm)) })] });
  if (b.ratios) {
    const r = b.ratios;
    add({ id: "ratio", title: t("coach.body.ratio.title"), level: r.band === "high" ? "warn" : r.band === "raised" ? "info" : "good",
      lines: [r.cmToHalfHeight > 0 ? t("coach.body.ratio.detail", { whtr: r.whtr, cm: n1(r.cmToHalfHeight) }) : t("coach.body.ratio.ok", { whtr: r.whtr })] });
  }
  const m = b.maintenance;
  if (m) {
    if (m.ready) add({ id: "maint", title: t("coach.body.maint.title"), lines: [t("coach.body.maint.detail", { est: k(m.estimate), lo: k(m.low), hi: k(m.high), exp: m.expected ? k(m.expected) : "-", conf: t(`coach.body.conf.${m.confidence}`) })] });
    else if (m.need) add({ id: "maint", title: t("coach.body.maint.title"), lines: [t("coach.body.maint.need", { w: m.need.weighIns, d: m.need.spanDays, l: m.need.loggedDays })] });
  }
  if (b.loggingGap) add({ id: "gap", title: t("coach.body.gap.title"), level: "warn", lines: [t("coach.body.gap.detail", { kcal: k(b.loggingGap.kcalPerDay) }), ...b.loggingGap.fixes.map((x) => `• ${t(`coach.body.gap.fix.${x}`)}`)] });
  if (b.activityDrop) add({ id: "drop", title: t("coach.body.drop.title"), level: "warn", lines: [t("coach.body.drop.detail", { pct: b.activityDrop.dropPct, before: k(b.activityDrop.before), now: k(b.activityDrop.now), floor: k(b.activityDrop.floor) })] });
  if (b.plateau) {
    const lines = [];
    for (const it of b.plateau.items) {
      const mark = it.status === "ok" ? "✓" : it.status === "fix" ? "!" : "?";
      const hint = it.status === "ok" ? "" : ` ${t(`coach.body.pc.${it.id}.${it.status}`, { ...it.vars, floor: k(it.vars.floor), kcal: k(it.vars.kcal) })}`;
      lines.push(`${mark} ${t(`coach.body.pc.${it.id}`)}.${hint}`);
    }
    if (b.plateau.next) lines.unshift(t("coach.body.pc.next", { step: t(`coach.body.pc.${b.plateau.next}`) }));
    add({ id: "plateau", title: t("coach.body.pc.title"), level: "warn", lines });
  }
  if (b.pace) add({ id: "pace", title: t("coach.body.pace.title"), level: b.pace.level === "fast" ? "warn" : "info", lines: [t(`coach.body.pace.${b.pace.level}`, { max: b.pace.maxKgPerWeek })] });
  if (b.taper) add({ id: "taper", title: t("coach.body.taper.title"), lines: [t("coach.body.taper.detail", { remaining: n1(b.taper.remainingKg), from: b.taper.fromPace, to: b.taper.pace, more: k(b.taper.kcalMore), weeks: b.taper.finishWeeks })], action: { kind: "taper", label: t("coach.apply.taper", { pace: b.taper.pace }), key: b.taper.key } });
  if (b.fatigue) {
    const lines = [];
    if (b.fatigue.reasons.length) lines.push(t("coach.body.fatigue.because", { reasons: b.fatigue.reasons.map((r) => t(`coach.body.fatigue.r.${r}`)).join(", ") }));
    if (b.fatigue.breakSuggested) lines.push(t("coach.body.fatigue.break"));
    add({ id: "fatigue", title: t("coach.body.fatigue.title", { band: t(`coach.body.fatigue.band.${b.fatigue.band}`) }), level: b.fatigue.band === "high" ? "warn" : "info", lines });
  }
  const r = b.realism;
  if (r) {
    const lines = [t(`coach.body.real.${r.verdict}`, { need: r.needWeeks, avail: r.availWeeks === null ? 0 : r.availWeeks })];
    lines.push(t("coach.body.ms.title") + ":");
    for (const s of r.milestones) lines.push(`• ${t(s.goal ? "coach.body.ms.goal" : "coach.body.ms.row", { kg: n1(s.kg), date: s.date })}`);
    lines.push(t("coach.body.ms.review", { date: r.nextReviewDate }));
    add({ id: "real", title: t("coach.body.real.title"), level: r.verdict === "ok" ? "good" : "warn", lines });
  }
  const mp = b.maintenancePhase;
  if (mp) {
    const lines = [t("coach.body.keep.detail", { low: n1(mp.band.low), high: n1(mp.band.high), kcal: k(mp.maintenanceKcal) })];
    if (mp.guard) lines.push(t(`coach.body.guard.${mp.guard.state}`, { over: n1(mp.guard.overKg) }));
    add({ id: "keep", title: t("coach.body.keep.title"), level: mp.guard && mp.guard.state === "act" ? "warn" : "good", lines });
  }
  const sc = b.scenarios;
  if (sc) {
    const lines = [t("coach.body.sc.base", { weeks: sc.baseline.weeks, date: sc.baseline.date })];
    for (const row of sc.rows) lines.push(`• ${t("coach.body.sc.row", { label: t(`coach.body.sc.${row.id}`), weeks: row.weeks, date: row.date, saved: row.weeksSaved })}${row.capped ? ` ${t("coach.body.sc.cap")}` : ""}`);
    add({ id: "sc", title: t("coach.body.sc.title"), lines });
  }
  if (b.leaks && b.leaks.length) add({ id: "leak", title: t("coach.body.leak.title"), level: "warn", lines: b.leaks.flatMap((l) => [t(`coach.body.leak.${l.id}`, l.vars), `  → ${t(`coach.body.leak.${l.id}.fix`)}`]) });
  if (b.nutrition && b.nutrition.length) add({ id: "nut", title: t("coach.body.nut.title"), lines: b.nutrition.map((x) => t(`coach.body.nut.${x.id}`, x.vars)) });
  if (b.learned) add({ id: "learned", title: t("coach.body.learned.title"), lines: [b.learned.best ? t(`coach.body.learned.best.${b.learned.best}`) : t("coach.body.learned.none")] });
  if (b.measure) add({ id: "measure", title: t("coach.body.measure.title"), lines: [t("coach.body.measure.detail", { parts: b.measure.missing.map((p) => t(`coach.body.part.${p}`)).join(", ") })] });
  return out;
}
