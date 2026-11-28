// The Coach hub: ONE screen for the diet coach and the gym coach. It shows a single next action, the 10-second readiness check-in,
// today's eating plan (lifting day vs rest day), this week's decision with the reason, the goal-date forecast, advice that needs both
// coaches, and a changelog of what the coach changed (with one-tap undo). All answers come from GET /api/coach/hub.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Switch, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { del, patch, post, put, today } from '../config/api';
import { read, write, useRefreshOnSync } from '../utils/offline';
import { useT } from '../i18n';
import { bodySections } from '../utils/bodyCards';
import { advisoryText, applyLabel, bandNote, nextText, offerTexts, refreshNote, tr, weeklyHeadline, weeklyMessages } from '../utils/coachText';
import { refreshProfile } from '../hooks/useProfile';
import { scheduleCoachNudge } from '../utils/coachNudge';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';

type Hub = {
  nextAction: { kind: string; title: string; detail: string };
  readiness: { today: any; adjust: { band: string | null; score: number | null; note: string }; week: { low: boolean; avg: number | null; note: string } };
  dayPlan: { kind: string; kcal: number; proteinG: number; carbsG: number; fatG: number; note: string; pre?: string; post?: string; warn?: string; recovery?: string } | null;
  restOfDay: { message: string; plan: { slot: string; kcal: number; proteinG: number; idea: string }[] } | null;
  prompts: { id: string; title: string; detail: string; page: string }[];
  weekly: { id?: string; refreshReason?: string; metrics?: any; composition?: { note: string } | null; action: string; headline: string; messages: string[]; applied?: boolean; auto?: boolean; apply: { type: string; stepsTarget?: number; calorieTarget?: number; days?: number } | null; outliers?: number } | null;
  forecast: { message: string } | null;
  advisories: { id: string; level: 'info' | 'tip' | 'warn'; title: string; detail: string }[];
  gym: { phase: { name: string; why: string }; todayPlan: { text: string } } | null;
  changelog: { date: string; headline: string; change: string; auto: boolean; undone?: boolean; after?: { text: string } }[];
  undo: { date: string; change: string; auto: boolean } | null;
  auto: 'off' | 'safe';
  offer: any | null;
  taper: any | null;
  cycle: any;
  showCycle: boolean;
};

const SLEEP: [string, number][] = [['<5 h', 4.5], ['5-6', 5.5], ['6-7', 6.5], ['7-8', 7.5], ['8+', 8.5]];
const ONE_TO_FIVE = [1, 2, 3, 4, 5];
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString();
/** The calendar date n days before today, as YYYY-MM-DD (noon avoids daylight-saving edges). */
const daysAgo = (n: number) => { const d = new Date(`${today()}T12:00:00`); d.setDate(d.getDate() - n); const p2 = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };


export function useCoachHub() {
  const [hub, setHub] = useState<Hub | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { read<any>(`/api/coach/hub?today=${today()}&hour=${new Date().getHours()}`).then((j) => { setHub(j && j.success ? j : null); setFailed(!j || !j.success); }).catch(() => setFailed(true)); }, []);
  useEffect(() => { load(); }, [load]);
  return { hub, failed, reload: load };
}

/** Home's ONE coach card: today's next step with the pending Apply on it (the separate weekly card is gone). Uses the light endpoint. */
export function CoachNextActionCard() {
  const { colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const { t } = useT();
  const [n, setN] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { read<any>(`/api/coach/next?today=${today()}`).then((j) => setN(j && j.success ? j : null)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnSync(load);
  useEffect(() => { if (n && n.nextAction) scheduleCoachNudge({ now: new Date(), nextKind: n.nextAction.kind, headline: n.headline || undefined, recoveryLow: !!n.recoveryLow }); }, [n]);
  if (!n || !n.nextAction) return null;
  const nx = nextText(t, n.nextAction, n.band);
  const title = n.nextAction.kind === 'decision' && n.apply ? weeklyHeadline(t, { action: n.apply.action, headline: n.nextAction.title, apply: n.apply.apply, metrics: {} }) : nx.title;
  const apply = async () => {
    setBusy(true);
    try {
      const r = await write('POST', '/api/coach/weekly/apply', { today: today(), decisionId: n.apply.decisionId }, 'Coach change');   // offline: queued, and only applied if it is still the same suggestion
      await refreshProfile(); success('Done', r.queued ? t('coach.apply.queuedTap') : t('coach.apply.done')); load();
    } catch (e: any) { error('Could not apply it', e?.message || 'Please try again.'); } finally { setBusy(false); }
  };
  return (
    <View style={{ marginBottom: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Coach: ${title}. Open the Coach`} onPress={() => router.push('/coach' as any)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 22 }}>🧭</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{title}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }} numberOfLines={2}>{nx.detail}</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
      </TouchableOpacity>
      {n.apply && (
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={apply} style={{ marginTop: 10, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{applyLabel(t, n.apply.apply)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function CoachHub() {
  const { colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const { t } = useT();
  const { hub, failed, reload } = useCoachHub();
  useRefreshOnSync(reload);
  const [busy, setBusy] = useState(false);
  const [sleep, setSleep] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [sore, setSore] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [body, setBody] = useState<any>(null);
  const [bodyFailed, setBodyFailed] = useState(false);
  // The daily decision (today's targets from the trend weight). Re-read whenever the hub reloads, e.g. after an apply or a new weigh-in.
  const [daily, setDaily] = useState<any>(null);
  useEffect(() => { read<any>(`/api/coach/daily?today=${today()}`).then((j) => setDaily(j && j.success ? j.decision : null)).catch(() => {}); }, [hub]);
  // Body progress is read only when opened, so it costs nothing until someone looks at it.
  useEffect(() => { if (bodyOpen && !body) read<any>(`/api/coach/body?today=${today()}`).then((j) => { setBody(j); setBodyFailed(false); }).catch(() => setBodyFailed(true)); }, [bodyOpen, body]);

  if (failed) return <Text style={{ color: colors.muted, padding: 16 }}>{t('coach.failed')}</Text>;
  if (!hub) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  const card = { marginBottom: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card } as const;
  const h = { fontWeight: '800', color: colors.ink, fontSize: 15 } as const;
  const p = { color: colors.ink, fontSize: 13.5, lineHeight: 19, marginTop: 4 } as const;
  const muted = { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4 } as const;
  const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }}>
      <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
  const Btn = ({ label, onPress, primary = true }: { label: string; onPress: () => void; primary?: boolean }) => (
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onPress}
      style={{ marginTop: 10, alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, backgroundColor: primary ? colors.primary : 'transparent', borderWidth: primary ? 0 : 1.5, borderColor: colors.border, opacity: busy ? 0.6 : 1 }}>
      <Text style={{ color: primary ? '#fff' : colors.ink, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
  // fn answers { queued } when the phone is offline: the change is saved for later and the screen says so
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { const r = await fn(); await refreshProfile(); success('Done', r && r.queued ? t('coach.queued') : ok); reload(); } catch (e: any) { error('Could not do that', e?.message || 'Please try again.'); } finally { setBusy(false); } };

  const saveCheckin = () => {
    const answered = [sleep, energy, sore, stress].filter((x) => x !== null).length;
    if (answered < 2) return error('Answer two questions', t('coach.checkin.need2'));
    run(() => write('POST', '/api/coach/readiness', { today: today(), sleepHours: sleep ?? undefined, energy: energy ?? undefined, soreness: sore ?? undefined, stress: stress ?? undefined }, 'Coach check-in'), t('coach.checkin.saved'));
  };
  const w = hub.weekly;
  const checked = hub.readiness && hub.readiness.today && hub.readiness.adjust.band;
  const bandColor = hub.readiness.adjust.band === 'green' ? '#2aa876' : hub.readiness.adjust.band === 'amber' ? '#e0a100' : '#e5484d';
  const nx = nextText(t, hub.nextAction, hub.readiness.adjust.band);
  const refreshed = refreshNote(t, w);
  const offer = offerTexts(t, hub.offer);
  const cycle = hub.cycle || { enabled: false };
  const chooseOffer = (choice: 'date' | 'pace', key: string) => run(() => post('/api/coach/offer/apply', { choice, key, today: today() }), t('coach.offer.applied'));

  return (
    <View>
      <View style={{ ...card, borderColor: colors.primary }} testID="coach-next">
        <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '800' }}>{t('coach.next.label')}</Text>
        <Text style={{ ...h, fontSize: 17, marginTop: 2 }}>{hub.nextAction.kind === 'decision' && w ? weeklyHeadline(t, w) : nx.title}</Text>
        <Text style={p}>{nx.detail}</Text>
      </View>

      <View style={card} testID="coach-checkin">
        <Text style={h}>{checked ? t('coach.checkin.recovery', { score: hub.readiness.adjust.score }) : t('coach.checkin.title')}</Text>
        {checked ? <Text style={{ ...p, color: bandColor, fontWeight: '700' }}>{bandNote(t, hub.readiness.adjust.band, hub.readiness.adjust.note)}</Text> : <Text style={muted}>{t('coach.checkin.hint')}</Text>}
        <Text style={{ ...muted, marginTop: 10 }}>{t('coach.checkin.sleep')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>{SLEEP.map(([l, v]) => <Chip key={l} label={l} on={sleep === v} onPress={() => setSleep(v)} />)}</View>
        <Text style={{ ...muted, marginTop: 10 }}>{t('coach.checkin.energy')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>{ONE_TO_FIVE.map((v) => <Chip key={v} label={String(v)} on={energy === v} onPress={() => setEnergy(v)} />)}</View>
        <Text style={{ ...muted, marginTop: 10 }}>{t('coach.checkin.soreness')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>{ONE_TO_FIVE.map((v) => <Chip key={v} label={String(v)} on={sore === v} onPress={() => setSore(v)} />)}</View>
        <Text style={{ ...muted, marginTop: 10 }}>{t('coach.checkin.stress')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>{ONE_TO_FIVE.map((v) => <Chip key={v} label={String(v)} on={stress === v} onPress={() => setStress(v)} />)}</View>
        <Btn label={checked ? t('coach.checkin.update') : t('coach.checkin.save')} onPress={saveCheckin} />
        {hub.readiness.week && hub.readiness.week.low && <Text style={{ ...muted, color: '#e5484d' }}>{hub.readiness.week.note}</Text>}
      </View>

      {hub.dayPlan && (
        <View style={card} testID="coach-dayplan">
          <Text style={h}>{hub.dayPlan.kind === 'training' ? t('coach.day.training') : t('coach.day.rest')} · {fmt(hub.dayPlan.kcal)} kcal</Text>
          <Text style={p}>{t('coach.day.macros', { p: hub.dayPlan.proteinG, c: hub.dayPlan.carbsG, f: hub.dayPlan.fatG })}</Text>
          <Text style={muted}>{hub.dayPlan.note}</Text>
          {!!hub.dayPlan.pre && <Text style={p}>{t('coach.day.before', { text: hub.dayPlan.pre })}</Text>}
          {!!hub.dayPlan.post && <Text style={p}>{t('coach.day.after', { text: hub.dayPlan.post })}</Text>}
          {!!hub.dayPlan.warn && <Text style={muted}>{hub.dayPlan.warn}</Text>}
          {!!hub.dayPlan.recovery && <Text style={muted}>{hub.dayPlan.recovery}</Text>}
        </View>
      )}

      {hub.restOfDay && (
        <View style={card} testID="coach-restofday">
          <Text style={h}>{t('coach.rest.title')}</Text>
          <Text style={p}>{hub.restOfDay.message}</Text>
          {hub.restOfDay.plan.map((m) => <Text key={m.slot} style={muted}>{m.slot}: about {fmt(m.kcal)} kcal{m.proteinG ? `, ${m.proteinG} g protein` : ''}. {m.idea}</Text>)}
        </View>
      )}

      {(hub.prompts || []).map((pr) => (
        <TouchableOpacity key={pr.id} accessibilityRole="button" accessibilityLabel={pr.title} onPress={() => router.push(`/${pr.page}` as any)} style={card}>
          <Text style={h}>{pr.title}</Text><Text style={muted}>{pr.detail}</Text>
        </TouchableOpacity>
      ))}

      {w && (
        <View style={card} testID="coach-weekly">
          <Text style={h}>{t('coach.weekly.title', { headline: weeklyHeadline(t, w) })}</Text>
          {!!refreshed && <Text style={muted}>{refreshed}</Text>}
          {weeklyMessages(t, w).map((m, i) => <Text key={i} style={p}>• {m}</Text>)}
          {w.applied && <Text style={muted}>{w.auto ? t('coach.weekly.appliedAuto') : t('coach.weekly.applied')}</Text>}
          {w.apply && !w.applied && <Btn label={applyLabel(t, w.apply)} onPress={() => run(() => write('POST', '/api/coach/weekly/apply', { today: today(), decisionId: w.id }, 'Coach change'), t('coach.apply.done'))} />}
          {!!(w.composition && w.composition.note) && <Text style={muted}>{w.composition.note}</Text>}
          {!!w.outliers && <Text style={muted}>{t('coach.weekly.outliers', { n: w.outliers })}</Text>}
        </View>
      )}

      {daily && daily.targets && (
        <View style={card} testID="coach-daily">
          <Text style={h}>Today: {daily.headline}</Text>
          {(daily.messages || []).map((m: string, i: number) => <Text key={i} style={p}>• {m}</Text>)}
          <Text style={muted}>{Math.round(daily.targets.calories).toLocaleString()} kcal · protein {daily.targets.protein.min}–{daily.targets.protein.max} g{daily.targets.protein.aim !== daily.targets.protein.goal ? ` (aim ${daily.targets.protein.aim} g today)` : ''} · carbs {daily.targets.carbs.min}–{daily.targets.carbs.max} g · fat {daily.targets.fat.min}–{daily.targets.fat.max} g{daily.targets.waterMl ? ` · water ${(daily.targets.waterMl / 1000).toFixed(1)} L` : ''}</Text>
        </View>
      )}

      {offer && (
        <View style={card} testID="coach-offer">
          <Text style={h}>{offer.title}</Text>
          <Text style={p}>{offer.body}</Text>
          {offer.date && <View style={{ marginTop: 10 }}><Text style={{ ...p, fontWeight: '700' }}>{offer.date.title}</Text><Text style={muted}>{offer.date.detail}</Text><Btn label={applyLabel(t, hub.offer.date.apply)} onPress={() => chooseOffer('date', hub.offer.date.key)} /></View>}
          {offer.pace && <View style={{ marginTop: 10 }}><Text style={{ ...p, fontWeight: '700' }}>{offer.pace.title}</Text><Text style={muted}>{offer.pace.detail}</Text><Btn label={applyLabel(t, hub.offer.pace.apply)} onPress={() => chooseOffer('pace', hub.offer.pace.key)} /></View>}
          {!!offer.noPace && <Text style={muted}>{offer.noPace}</Text>}
          <Btn primary={false} label={t('coach.offer.snooze')} onPress={() => run(() => post('/api/coach/offer/snooze', { today: today() }), t('coach.offer.snoozed'))} />
        </View>
      )}

      {hub.taper && (
        <View style={card} testID="coach-taper">
          <Text style={h}>{t('coach.body.taper.title')}</Text>
          <Text style={p}>{t('coach.body.taper.detail', { remaining: Math.round(hub.taper.remainingKg * 10) / 10, from: hub.taper.fromPace, to: hub.taper.pace, more: fmt(hub.taper.kcalMore), weeks: hub.taper.finishWeeks })}</Text>
          <Btn label={t('coach.apply.taper', { pace: hub.taper.pace })} onPress={() => run(() => post('/api/coach/offer/apply', { choice: 'taper', key: hub.taper.key, today: today() }), t('coach.offer.applied'))} />
          <Btn primary={false} label={t('coach.offer.snooze')} onPress={() => run(() => post('/api/coach/offer/snooze', { today: today() }), t('coach.offer.snoozed'))} />
        </View>
      )}

      <View style={card} testID="coach-body">
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: bodyOpen }} onPress={() => setBodyOpen(!bodyOpen)}>
          <Text style={h}>{t('coach.body.title')}</Text>
          <Text style={muted}>{bodyOpen ? t('coach.body.hide') : t('coach.body.show')}</Text>
        </TouchableOpacity>
        {bodyOpen && !body && !bodyFailed && <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} />}
        {bodyOpen && bodyFailed && <Text style={muted}>{t('coach.failed')}</Text>}
        {bodyOpen && body && bodySections(t, body).length === 0 && <Text style={muted}>{t('coach.body.empty')}</Text>}
        {bodyOpen && body && bodySections(t, body).map((x: any) => (
          <View key={x.id} style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ ...p, fontWeight: '800', color: x.level === 'warn' ? '#e5484d' : colors.ink }}>{x.title}</Text>
            {x.lines.map((l: string, i: number) => <Text key={i} style={muted}>{l}</Text>)}
            {x.action && <Btn label={x.action.label} onPress={() => run(async () => { const r = await post('/api/coach/offer/apply', { choice: 'taper', key: x.action.key, today: today() }); setBody(null); return r; }, t('coach.offer.applied'))} />}
          </View>
        ))}
      </View>

      {hub.forecast && <View style={card} testID="coach-forecast"><Text style={h}>{t('coach.forecast.title')}</Text><Text style={p}>{hub.forecast.message}</Text>{!!(hub.forecast as any).range && <Text style={muted}>{t('coach.forecast.range', { from: (hub.forecast as any).range.earliest.date, to: (hub.forecast as any).range.latest.date })}</Text>}</View>}

      {hub.gym && (
        <View style={card} testID="coach-gym">
          <Text style={h}>{t('coach.training.title', { phase: hub.gym.phase.name })}</Text>
          <Text style={p}>{hub.gym.phase.why}</Text>
          <Text style={muted}>{hub.gym.todayPlan && hub.gym.todayPlan.text}</Text>
        </View>
      )}

      {hub.advisories.map((a) => {
        const x = advisoryText(t, a);
        return (
          <View key={a.id} style={{ ...card, borderColor: a.level === 'warn' ? '#e5484d88' : colors.border, backgroundColor: a.level === 'warn' ? '#e5484d14' : colors.card }}>
            <Text style={h}>{x.title}</Text><Text style={p}>{x.detail}</Text>
          </View>
        );
      })}

      {hub.showCycle && (
        <View style={card} testID="coach-cycle">
          <Text style={h}>{t('coach.cycle.title')}</Text>
          <Text style={muted}>{t('coach.cycle.intro')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Text style={{ ...p, flex: 1, marginTop: 0, fontWeight: '700' }}>{t('coach.cycle.use')}</Text>
            <Switch value={!!cycle.enabled} disabled={busy} onValueChange={(on) => run(() => put('/api/coach/cycle', { enabled: on, today: today() }), on ? t('coach.cycle.saved') : t('coach.cycle.erased'))} />
          </View>
          {cycle.enabled && (
            <View>
              {cycle.known && !cycle.stale && <Text style={p}>{t('coach.cycle.day', { day: cycle.day, length: cycle.length })}{cycle.phase ? ` · ${t(`coach.cycle.phase.${cycle.phase}`)}` : ''}</Text>}
              {!!cycle.waterWindow && <Text style={muted}>{t('coach.cycle.water')}</Text>}
              {!!cycle.nextStart && <Text style={muted}>{t('coach.cycle.next', { date: cycle.nextStart })}</Text>}
              {!!cycle.stale && <Text style={muted}>{t('coach.cycle.stale')}</Text>}
              <Text style={{ ...muted, marginTop: 10 }}>{t('coach.cycle.logDate')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {[0, 1, 2, 3, 7].map((n) => (
                  <Chip key={n} on={false} label={n === 0 ? t('coach.cycle.today') : n === 1 ? t('coach.cycle.yesterday') : t('coach.cycle.daysAgo', { n })}
                    onPress={() => run(() => post('/api/coach/cycle/start', { date: daysAgo(n), today: today() }), t('coach.cycle.saved'))} />
                ))}
              </View>
              {Array.isArray(cycle.starts) && cycle.starts.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={muted}>{t('coach.cycle.history')}</Text>
                  {cycle.starts.slice().reverse().map((d: string) => (
                    <View key={d} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ color: colors.ink, fontSize: 13.5 }}>{d}</Text>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('coach.cycle.remove', { date: d })} disabled={busy} onPress={() => run(() => del(`/api/coach/cycle/start?date=${d}&today=${today()}`), t('coach.cycle.removed'))}>
                        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{t('coach.cycle.remove', { date: d })}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <Btn primary={false} label={t('coach.cycle.erase')} onPress={() => run(() => del('/api/coach/cycle'), t('coach.cycle.erased'))} />
            </View>
          )}
        </View>
      )}

      <View style={card} testID="coach-auto">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={h}>{t('coach.auto.title')}</Text>
            <Text style={muted}>{t('coach.auto.detail')}</Text>
          </View>
          <Switch value={hub.auto === 'safe'} disabled={busy} onValueChange={(on) => run(() => patch('/api/profile', { goals: { coachAuto: on ? 'safe' : 'off' }, today: today() }), on ? t('coach.auto.on') : t('coach.auto.off'))} />
        </View>
      </View>

      {hub.undo && (
        <View style={card} testID="coach-undo">
          <Text style={h}>{t('coach.undo.title')}</Text>
          <Text style={p}>{t('coach.undo.line', { change: hub.undo.change || 'Plan change', how: hub.undo.auto ? t('coach.undo.auto') : t('coach.undo.manual'), date: hub.undo.date })}</Text>
          <Btn primary={false} label={t('coach.undo.button')} onPress={() => run(() => post('/api/coach/weekly/undo', { today: today() }), t('coach.undo.done'))} />
        </View>
      )}

      {hub.changelog.length > 0 && (
        <View style={card} testID="coach-log">
          <Text style={h}>{t('coach.log.title')}</Text>
          {hub.changelog.slice(0, 6).map((e: any, i) => (
            <View key={i} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>{e.date} · {tr(t, `coach.w.${e.action}.head`, { to: '', kcal: 100 }, e.headline)}{e.undone ? ` ${t('coach.log.undone')}` : ''}</Text>
              <Text style={muted}>{e.change}{e.auto ? ` · ${t('coach.log.auto')}` : ''}</Text>
              {!!e.after && <Text style={muted}>{e.after.text}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
