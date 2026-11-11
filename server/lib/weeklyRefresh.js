// WHEN may the cached weekly decision be re-checked before its 7 days are up?
// The weekly decision is cached for a week so Home stays quiet and the coach never flip-flops. But a few things genuinely change what it
// should say: the trend turning unsafely fast (the daily engine's early warning), a new low-recovery pattern, the first waist reading (or enough readings to compare), enough weigh-ins / food days to stop
// saying "not enough data", or a strength trend that flipped after new sessions and effort (RPE) taps. Everything else waits for the review.
//
// Safe by design (pure, no database):
//   * a decision that was already APPLIED is never re-checked (the coach waits for its effect);
//   * at most ONE re-check per calendar day, so a flapping signal can never make the advice jump around;
//   * the re-check starts from the ladder state as it was BEFORE this review (see weeklyView), so it can never count a slow week twice.
const { diffDays } = require('./dates');

const SESSION_REFRESH = { minWeighIns: 6, minFoodDays: 8, compositionSpanDays: 14 };

/**
 * The few facts that can change the decision. Cheap to compute (small queries), stored next to the decision, compared next time.
 * @param o.recoveryLow bool   o.waistDates ['YYYY-MM-DD'] waist readings in the last ~36 days   o.weighIns14 n   o.foodDays14 n
 * @param o.sessionStamp string  e.g. "4:2026-11-03" (sessions in 14 days : latest change)   o.strengthStatus 'up'|'flat'|'down'|null
 */
function signalsOf({ recoveryLow = false, waistDates = [], weighIns14 = 0, foodDays14 = 0, sessionStamp = '', strengthStatus = null, trendFast = false } = {}) {
  const dates = [...new Set((waistDates || []).filter(Boolean))].sort();
  return {
    recoveryLow: !!recoveryLow,
    waistCount: dates.length,
    compositionReady: dates.length >= 2 && diffDays(dates[0], dates[dates.length - 1]) >= SESSION_REFRESH.compositionSpanDays,
    weighInsOk: Number(weighIns14) >= SESSION_REFRESH.minWeighIns,
    foodDaysOk: Number(foodDays14) >= SESSION_REFRESH.minFoodDays,
    sessionStamp: String(sessionStamp || ''),
    strengthStatus: strengthStatus || null,
    trendFast: !!trendFast,                       // the daily engine's early warning (lib/dailyDecision.js fastTrend): same test as the weekly 'too fast' rule
  };
}

/**
 * @param o.prev signals stored with the cached decision (null for decisions made before this feature: they are adopted, not refreshed)
 * @param o.next signals now   o.decision the cached decision view   o.refreshedOn date of the last re-check | ''   o.today
 * @returns {refresh:boolean, reason:string, adopt:boolean}  reason is a stable id the apps translate
 */
function shouldRefresh({ prev, next, decision, refreshedOn = '', today } = {}) {
  if (!next || !decision || decision.action === 'NEED_PROFILE') return { refresh: false, reason: '', adopt: false };
  if (!prev) return { refresh: false, reason: '', adopt: true };
  if (decision.applied) return { refresh: false, reason: '', adopt: false };
  if (refreshedOn && diffDays(refreshedOn, today) <= 0) return { refresh: false, reason: '', adopt: false };
  if (!prev.trendFast && next.trendFast) return { refresh: true, reason: 'trend-fast', adopt: false };      // a safety limit must not wait for the next weekly review
  if (!prev.recoveryLow && next.recoveryLow) return { refresh: true, reason: 'recovery-low', adopt: false };
  if (prev.recoveryLow && !next.recoveryLow) return { refresh: true, reason: 'recovery-back', adopt: false };
  if (prev.strengthStatus && next.strengthStatus && prev.strengthStatus !== next.strengthStatus) return { refresh: true, reason: 'strength', adopt: false };
  if ((prev.waistCount === 0 && next.waistCount >= 1) || (!prev.compositionReady && next.compositionReady)) return { refresh: true, reason: 'measurement', adopt: false };
  if ((!prev.weighInsOk && next.weighInsOk) || (!prev.foodDaysOk && next.foodDaysOk)) return { refresh: true, reason: 'data', adopt: false };
  return { refresh: false, reason: '', adopt: false };
}

/** Do the new sessions / effort taps need the (heavier) strength check? Only when the cheap stamp moved. */
const sessionsMoved = (prev, next) => !!(prev && next && prev.sessionStamp !== next.sessionStamp);

/** A stable id for a decision, so a queued "Apply" tap can only ever apply the SAME suggestion the person saw. */
function decisionId(d) {
  if (!d) return '';
  const crypto = require('node:crypto');
  const h = crypto.createHash('sha1').update(JSON.stringify(d.apply || null)).digest('hex').slice(0, 8);
  return `${d.action}:${h}`;
}

module.exports = { signalsOf, shouldRefresh, sessionsMoved, decisionId };
