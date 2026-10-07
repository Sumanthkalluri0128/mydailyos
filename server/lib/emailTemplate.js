// Weekly summary email: responsive, table-based HTML with inline styles (what Gmail, Outlook and Apple Mail actually render),
// plus a plain-text alternative. Pure functions: everything comes in as data, nothing is read from the database here.

const C = {
  brand: '#5b5bd6', brandDark: '#3f3fb0', ink: '#1f2340', muted: '#6b7090', line: '#e7e9f5', bg: '#f3f4fb', card: '#ffffff',
  good: '#1fa971', warn: '#e0a43a', bad: '#d6577a', soft: '#f6f7fd',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLetter = (iso) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** 0–100: how many of the weekly goals (calories, protein, water, exercise — only those the person has) were hit across 7 days. */
function weekScore(goalDays, available) {
  const keys = available && available.length ? available : Object.keys(goalDays || {});
  if (!keys.length) return null;
  const hit = keys.reduce((s, k) => s + (Number(goalDays[k]) || 0), 0);
  return Math.round((hit / (keys.length * 7)) * 100);
}

function headline(score, activeDays) {
  if (!activeDays) return { emoji: '👋', title: 'We missed you this week', sub: 'No logs this week — even one meal or glass of water gets the streak going again.' };
  if (score === null) return { emoji: '📊', title: 'Your week in review', sub: `You were active on ${activeDays} of 7 days.` };
  if (score >= 80) return { emoji: '🏆', title: 'Outstanding week', sub: `You hit most of your goals — active ${activeDays} of 7 days.` };
  if (score >= 60) return { emoji: '💪', title: 'Solid week', sub: `Active ${activeDays} of 7 days and plenty of goals met.` };
  if (score >= 35) return { emoji: '📈', title: 'Building momentum', sub: `Active ${activeDays} of 7 days — a few more goal days and you're flying.` };
  return { emoji: '🌱', title: 'A fresh start', sub: `Active ${activeDays} of 7 days. Small steps count — pick one goal to nail this week.` };
}

function trendChip(pct, { upIsGood = true } = {}) {
  if (pct === null || pct === undefined) return '';
  if (pct === 0) return `<span style="color:${C.muted};font-size:12px;">— same as last week</span>`;
  const good = upIsGood ? pct > 0 : pct < 0;
  return `<span style="color:${good ? C.good : C.warn};font-size:12px;font-weight:700;">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last week</span>`;
}

const tile = (icon, label, value, sub) => `
  <td width="50%" valign="top" style="padding:6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="tile" style="background:${C.soft};border-radius:14px;">
      <tr><td style="padding:14px 16px;font-family:${FONT};">
        <div style="font-size:12px;color:${C.muted};font-weight:700;letter-spacing:.3px;">${icon} ${esc(label)}</div>
        <div class="ink" style="font-size:24px;line-height:30px;color:${C.ink};font-weight:800;margin-top:4px;">${value}</div>
        <div style="margin-top:2px;min-height:16px;">${sub || '&nbsp;'}</div>
      </td></tr>
    </table>
  </td>`;

function progressBar(pct, color) {
  const w = clamp(Math.round(pct), 0, 100);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;background:${C.line};"><tr>
    ${w > 0 ? `<td width="${w}%" height="10" bgcolor="${color}" style="background:${color};font-size:0;line-height:0;">&nbsp;</td>` : ''}
    ${w < 100 ? `<td height="10" style="font-size:0;line-height:0;">&nbsp;</td>` : ''}
  </tr></table>`;
}

function goalDots(hit, total = 7, color = C.good) {
  const cells = Array.from({ length: total }, (_, i) => `<td width="${Math.floor(100 / total)}%" style="padding:0 2px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="8" bgcolor="${i < hit ? color : C.line}" style="background:${i < hit ? color : C.line};border-radius:4px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

function calorieChart(days, target) {
  const max = Math.max(target || 0, ...days.map((d) => d.calories), 1) * 1.05;
  const H = 70;
  const cols = days.map((d) => {
    const h = d.calories > 0 ? Math.max(4, Math.round((d.calories / max) * H)) : 2;
    const over = target && d.calories > target * 1.1;
    const color = d.calories === 0 ? C.line : over ? C.warn : C.brand;
    return `<td align="center" valign="bottom" width="14%" style="padding:0 3px;font-family:${FONT};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="${H - h}" style="font-size:0;line-height:0;">&nbsp;</td></tr><tr><td height="${h}" bgcolor="${color}" style="background:${color};border-radius:5px 5px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr></table>
      <div style="font-size:11px;color:${C.muted};margin-top:4px;font-weight:700;">${dayLetter(d.date)}</div>
    </td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cols}</tr></table>`;
}

const section = (title, body, { sub } = {}) => `
  <tr><td style="padding:8px 24px 0 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="background:${C.card};border:1px solid ${C.line};border-radius:16px;">
      <tr><td style="padding:18px 20px;font-family:${FONT};">
        <div class="ink" style="font-size:16px;font-weight:800;color:${C.ink};">${title}</div>
        ${sub ? `<div style="font-size:12px;color:${C.muted};margin-top:2px;">${sub}</div>` : ''}
        <div style="margin-top:12px;">${body}</div>
      </td></tr>
    </table>
  </td></tr>`;

/**
 * @param d {
 *   name, summary, nutrients, plateau, target (kcal), scoreKeys?, appUrl?, unsubscribeUrl?
 * }
 * @returns { subject, html, text }
 */
function renderWeeklyEmail(d) {
  const s = d.summary, n = d.nutrients || { loggedDays: 0, rows: [], tip: null };
  const score = weekScore(s.goalDays, d.scoreKeys);
  const h = headline(score, s.activeDays);
  const first = esc((d.name || '').split(' ')[0] || 'there');
  const range = `${shortDate(s.from)} – ${shortDate(s.to)}`;
  const row = (k) => n.rows.find((r) => r.key === k);
  const prot = row('protein'), fib = row('fiber');

  const subject = score === null ? `Your FlexFit week · ${range}` : `Your FlexFit week · ${score}/100 · ${range}`;
  const preheader = `${h.title}: avg ${fmtInt(s.averages.calories)} kcal, ${s.activeDays}/7 active days${score !== null ? `, score ${score}/100` : ''}.`;

  const tiles = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${tile('🔥', 'Avg calories', `${fmtInt(s.averages.calories)}<span style="font-size:13px;color:${C.muted};font-weight:600;"> kcal</span>`, d.target ? `<span style="font-size:12px;color:${C.muted};">target ${fmtInt(d.target)} · </span>${trendChip(s.trends.calories, { upIsGood: false })}` : trendChip(s.trends.calories, { upIsGood: false }))}
      ${tile('🥚', 'Avg protein', `${prot ? prot.average : s.averages.protein}<span style="font-size:13px;color:${C.muted};font-weight:600;"> g</span>`, prot ? `<span style="font-size:12px;color:${C.muted};">target ${prot.target} g (${prot.percentOfTarget}%)</span>` : '')}</tr>
      <tr>${tile('🌾', 'Avg fibre', fib ? `${fib.average}<span style="font-size:13px;color:${C.muted};font-weight:600;"> g</span>` : '—', fib ? `<span style="font-size:12px;color:${C.muted};">target ${fib.target} g (${fib.percentOfTarget}%)</span>` : '')}
      ${tile('💧', 'Avg water', `${(s.averages.waterMl / 1000).toFixed(1)}<span style="font-size:13px;color:${C.muted};font-weight:600;"> L/day</span>`, trendChip(s.trends.waterMl))}</tr>
    </table>`;

  const goalRows = [['Calories on budget', 'calories', C.good], ['Protein goal', 'protein', C.brand], ['Water goal', 'water', '#2e90fa'], ['Exercise goal', 'exercise', '#f08c3c']]
    .filter(([, k]) => !d.scoreKeys || d.scoreKeys.includes(k))
    .map(([label, k, color]) => `<tr><td style="padding:5px 0;font-size:13px;color:${C.ink};font-family:${FONT};" class="ink" width="38%">${label}</td><td width="48%" style="padding:5px 8px;">${goalDots(s.goalDays[k] || 0, 7, color)}</td><td align="right" width="14%" style="font-size:13px;font-weight:800;color:${C.ink};font-family:${FONT};" class="ink">${s.goalDays[k] || 0}/7</td></tr>`).join('');

  const nutrientRows = n.rows.map((r) => {
    const color = r.status === 'low' ? C.bad : r.status === 'near' || r.status === 'high' ? C.warn : C.good;
    return `<tr><td style="padding:7px 0;font-family:${FONT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="ink" style="font-size:13px;font-weight:700;color:${C.ink};">${esc(r.label)}</td>
      <td align="right" style="font-size:12px;color:${C.muted};">${r.average} / ${r.target} g · ${r.percentOfTarget}%</td></tr></table>
      <div style="margin-top:5px;">${progressBar(r.percentOfTarget || 0, color)}</div></td></tr>`;
  }).join('');

  const limitRows = (n.limits || []).map((r) => {
    const color = r.status === 'high' ? C.bad : r.status === 'near' ? C.warn : C.good;
    return `<tr><td style="padding:7px 0;font-family:${FONT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="ink" style="font-size:13px;font-weight:700;color:${C.ink};">${esc(r.label)} <span style="font-weight:400;color:${C.muted};">(keep under)</span></td>
      <td align="right" style="font-size:12px;color:${C.muted};">${fmtInt(r.average)} / ${fmtInt(r.limit)} ${r.unit} · ${r.percentOfLimit}%</td></tr></table>
      <div style="margin-top:5px;">${progressBar(r.percentOfLimit || 0, color)}</div></td></tr>`;
  }).join('');

  const weightBlock = s.weight ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="ink" style="font-size:22px;font-weight:800;color:${C.ink};font-family:${FONT};">${s.weight.start} → ${s.weight.end} <span style="font-size:13px;color:${C.muted};font-weight:600;">kg</span></td>
      <td align="right" style="font-size:15px;font-weight:800;font-family:${FONT};color:${s.weight.change === 0 ? C.muted : C.brand};">${s.weight.change > 0 ? '+' : ''}${s.weight.change} kg</td></tr></table>` : '';
  const plateauNote = d.plateau && ['plateau', 'wrong_direction', 'drifting'].includes(d.plateau.status)
    ? `<div style="margin-top:10px;padding:12px 14px;border-radius:12px;background:#fff7e6;border-left:4px solid ${C.warn};font-size:13px;line-height:19px;color:#6b4a00;font-family:${FONT};">${esc(d.plateau.message)}</div>` : '';

  const best = s.bestDay ? `<div style="font-size:14px;color:${C.ink};line-height:21px;font-family:${FONT};" class="ink">🌟 <strong>${shortDate(s.bestDay.date)}</strong> — ${esc(s.bestDay.highlights.join(' · '))}</div>` : '';
  const tip = n.tip ? `<div style="font-size:14px;line-height:21px;color:${C.ink};font-family:${FONT};" class="ink">💡 ${esc(n.tip)}</div>` : '';

  const sections = [
    section('Calories each day', calorieChart(s.days, d.target), { sub: d.target ? `Purple bars are logged days. Amber means more than 10% over your ${fmtInt(d.target)} kcal target.` : undefined }),
    section('Goals you hit', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${goalRows}</table>`),
    n.loggedDays > 0 ? section('Nutrients — daily average', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${nutrientRows}${limitRows}</table><div style="font-size:11px;color:${C.muted};margin-top:6px;font-family:${FONT};">Based on ${n.loggedDays} day${n.loggedDays === 1 ? '' : 's'} with food logged.</div>`) : '',
    s.weight ? section('Weight', weightBlock + plateauNote) : (plateauNote ? section('Weight trend', plateauNote.replace('margin-top:10px;', '')) : ''),
    best ? section('Best day', best) : '',
    tip ? section('One thing to try', tip) : '',
  ].join('');

  const scoreBadge = score === null ? '' : `
    <td align="right" valign="middle" width="96" style="padding-left:12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.18);border-radius:16px;"><tr><td align="center" style="padding:10px 16px;font-family:${FONT};">
        <div style="font-size:30px;line-height:32px;font-weight:800;color:#ffffff;">${score}</div>
        <div style="font-size:10px;letter-spacing:.8px;color:#e4e4ff;font-weight:700;">WEEK SCORE</div>
      </td></tr></table>
    </td>`;

  const cta = d.appUrl ? `
    <tr><td align="center" style="padding:22px 24px 6px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.brand}" style="background:${C.brand};border-radius:12px;"><a href="${esc(d.appUrl)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">Open FlexFit</a></td></tr></table>
    </td></tr>` : '';

  const footer = `
    <tr><td align="center" style="padding:18px 28px 28px 28px;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
      You're getting this because weekly summaries are turned on in FlexFit.<br>
      Turn them off any time in <strong>Profile → Reports &amp; emails</strong>${d.unsubscribeUrl ? ` or <a href="${esc(d.unsubscribeUrl)}" style="color:${C.brand};">unsubscribe with one click</a>` : ''}.<br>
      <span style="color:#9aa0c3;">Nutrition values are estimates based on what you logged. Not medical advice.</span>
    </td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;}
  @media only screen and (max-width:520px){ .wrap{width:100%!important;} .tile td{padding:12px!important;} }
  @media (prefers-color-scheme: dark){
    body,.page{background:#10121f!important;} .card,.tile{background:#1a1d33!important;border-color:#2a2e4d!important;} .ink{color:#f1f2ff!important;}
  }
</style></head>
<body class="page" style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}${'&nbsp;&zwnj;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};" class="page"><tr><td align="center" style="padding:20px 10px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="wrap" style="width:600px;max-width:100%;">
    <tr><td style="background:${C.brand};background-image:linear-gradient(135deg,${C.brand} 0%,${C.brandDark} 100%);border-radius:20px 20px 0 0;padding:26px 24px 24px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle" style="font-family:${FONT};">
          <div style="font-size:13px;font-weight:800;letter-spacing:1px;color:#d8d8ff;">✦ FLEXFIT · ${esc(range.toUpperCase())}</div>
          <div style="font-size:26px;line-height:32px;font-weight:800;color:#ffffff;margin-top:8px;">${h.emoji} ${esc(h.title)}</div>
          <div style="font-size:14px;line-height:20px;color:#e4e4ff;margin-top:6px;">Hi ${first}, ${esc(h.sub.charAt(0).toLowerCase() + h.sub.slice(1))}</div>
        </td>${scoreBadge}
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};padding:14px 18px 6px 18px;" class="card">${tiles}</td></tr>
    <tr><td style="background:${C.bg};height:6px;line-height:6px;font-size:0;" class="page">&nbsp;</td></tr>
    ${sections}
    ${cta}
    ${footer}
  </table>
</td></tr></table>
</body></html>`;

  const lines = [
    `${h.emoji} ${h.title} — ${range}`, `Hi ${(d.name || '').split(' ')[0] || 'there'}, ${h.sub}`, '',
    score === null ? '' : `Week score: ${score}/100`,
    `Active days: ${s.activeDays}/7`,
    `Average intake: ${fmtInt(s.averages.calories)} kcal/day${d.target ? ` (target ${fmtInt(d.target)})` : ''}`,
    `Water: ${(s.averages.waterMl / 1000).toFixed(1)} L/day · Exercise: ${s.totals.exerciseMinutes} min this week`,
    '', 'Goals hit (out of 7 days):',
    ...[['Calories on budget', 'calories'], ['Protein', 'protein'], ['Water', 'water'], ['Exercise', 'exercise']].filter(([, k]) => !d.scoreKeys || d.scoreKeys.includes(k)).map(([l, k]) => `  - ${l}: ${s.goalDays[k] || 0}/7`),
  ];
  if (n.loggedDays) { lines.push('', 'Nutrients (daily average vs target):'); n.rows.forEach((r) => lines.push(`  - ${r.label}: ${r.average} / ${r.target} g (${r.percentOfTarget}%)`)); (n.limits || []).forEach((r) => lines.push(`  - ${r.label} (keep under): ${r.average} / ${r.limit} ${r.unit} (${r.percentOfLimit}%)`)); }
  if (s.weight) lines.push('', `Weight: ${s.weight.start} -> ${s.weight.end} kg (${s.weight.change > 0 ? '+' : ''}${s.weight.change})`);
  if (d.plateau && ['plateau', 'wrong_direction', 'drifting'].includes(d.plateau.status)) lines.push(`  ${d.plateau.message}`);
  if (s.bestDay) lines.push('', `Best day: ${shortDate(s.bestDay.date)} - ${s.bestDay.highlights.join(', ')}`);
  if (n.tip) lines.push('', `Tip: ${n.tip}`);
  if (d.appUrl) lines.push('', `Open FlexFit: ${d.appUrl}`);
  lines.push('', 'Turn weekly emails off in Profile > Reports & emails.' + (d.unsubscribeUrl ? `\nUnsubscribe: ${d.unsubscribeUrl}` : ''));
  return { subject, html, text: lines.filter((l) => l !== undefined).join('\n') };
}

module.exports = { renderWeeklyEmail, weekScore, esc };
