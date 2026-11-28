// Workout tab: your 7-day beginner plan in one place.
//   Today    = what to do now, the week at a glance, resume a workout in progress
//   Plan     = the whole week, every day opens its exercise list
//   Library  = every exercise and alternative with how-to, search and favourites
//   History  = finished workouts (week / month / all time), totals and personal bests
// Works with no signal: everything is stored on the phone. Finished workouts are also added to the day's exercise log when online.
import { useEffect, useMemo, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '../../components/UI';
import { useNotifications } from '../../components/Notifications';
import { useProfile } from '../../hooks/useProfile';
import { post, today } from '../../config/api';
import { newClientId, useOffline, write } from '../../utils/offline';
import { clearProfileCache } from '../../hooks/useProfile';
import { AdaptCard } from '../../components/TrainingSections';
import { SKIP_REASONS, Way, skipPayload, variantDay, wayList } from '../../utils/smartPlan';
import { addDays, parseDate } from '../../utils/dates';
import { tapHaptic } from '../../utils/haptics';
import { weightValue } from '../../utils/units';
import { activeDays, isSmartActive, EXERCISES, MOBILITY_OPTIONS, PLAN_META, exerciseList, dayForDate, dayByNumber, Cat } from '../../data/workoutPlan';
import * as W from '../../utils/workoutEngine';
import { commitSession, deleteSessionEverywhere, retrySession, saveActive, setWorkout, toggleFav, undoSessionDelete, useWorkoutStore } from '../../utils/workoutStore';
import { flushSessionDeletes, retryUnsynced } from '../../utils/workoutSync';
import { ExerciseRow } from '../../components/workout/WorkoutParts';
import { useSmartPlan, setPlanSource, setSmartPlan, refreshSmartPlan, PlanSource } from '../../utils/smartPlanStore';
import { Bar, Btn, Card, Check, ExerciseThumb, Header, Pill, Seg, SectionTitle, Tile, minutesText, useNow, useWK } from '../../components/workout/WorkoutKit';

type Tab = 'today' | 'plan' | 'library' | 'history';
const nowMs = () => Date.now();
const WEEKDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function WorkoutTab() {
  const k = useWK();
  const store = useWorkoutStore();
  const { profile } = useProfile();
  const { confirm, error } = useNotifications();
  const [tab, setTab] = useState<Tab>('today');
  const sp = useSmartPlan();                 // ONE plan: the server's Smart program when it is ready for this week, otherwise (or by choice) Classic
  const date = today();
  const streak = W.streakDays(store.sessions, date);

  const { syncVersion } = useOffline();   // changes whenever the offline queue has sent something: a good moment to try again
  useEffect(() => {
    if (!store.ready) return;
    flushSessionDeletes();
    if (store.syncLog) retryUnsynced().then((n) => { if (n) error(n === 1 ? 'A workout could not be saved' : `${n} workouts could not be saved`, 'See History to try again.'); });
  }, [store.ready, store.syncLog, syncVersion, error]);   // deletes waiting for the server go first, whatever the log switch says

  const startDay = async (n: number, way: Way = 'gym') => {
    const act = store.active;
    if (act && act.dayN === n) { router.push('/workout-session'); return; }
    if (act) {
      const ok = await confirm({ title: 'Replace the workout in progress?', message: `You have an unfinished ${dayByNumber(act.dayN).short} workout. Starting a new one discards it.`, confirmText: 'Start new', destructive: true });
      if (!ok) return;
      saveActive(null);
    }
    router.push({ pathname: '/workout-session', params: { dayN: String(n), ...(way !== 'gym' ? { way } : {}) } });
  };

  return (
    <Screen tab>
      <Header title="Workout" subtitle={isSmartActive() ? `Smart program${sp.offline ? ' · offline copy' : ''}` : PLAN_META.name}
        right={streak > 0 ? <Pill text={`${streak} day${streak > 1 ? 's' : ''}`} tone="accent" icon="flame" /> : undefined} />
      {sp.usable && <Seg<PlanSource> value={sp.source} onChange={(v) => { setPlanSource(v); }} options={[{ k: 'smart', label: 'Smart · built for you' }, { k: 'classic', label: 'Classic 7-day' }]} />}
      {!sp.usable && !!sp.data && !!sp.data.plan && !sp.data.plan.ready && <Text style={{ color: k.c.muted, fontSize: 12.5, marginBottom: 8 }}>Pick a body goal in the Body tab to unlock a plan built for you.</Text>}
      <Card onPress={() => router.push('/workout-planner')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="calendar" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 15 }}>Workout planner</Text>
            <Text style={{ color: k.c.muted, fontSize: 12.5 }}>Plan workouts by week or month. Move or skip a day. Same plan on the web app.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={k.c.muted} />
        </View>
      </Card>
      <Card onPress={() => router.push('/gym-log')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="journal" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 15 }}>Gym log &amp; body tracker</Text>
            <Text style={{ color: k.c.muted, fontSize: 12.5 }}>Log sets and reps, weight and measurements. Private, on this phone, downloadable.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={k.c.muted} />
        </View>
      </Card>
      <Seg<Tab> value={tab} onChange={setTab} options={[{ k: 'today', label: 'Today' }, { k: 'plan', label: 'Plan' }, { k: 'library', label: 'Library' }, { k: 'history', label: 'History' }]} />
      {!store.ready ? <Text style={{ color: k.c.muted }}>Loading…</Text>
        : tab === 'today' ? <TodayTab date={date} startDay={startDay} bodyKg={profile?.currentWeightKg || W.DEFAULT_BODY_KG} sp={sp} />
        : tab === 'plan' ? <PlanTab date={date} />
        : tab === 'library' ? <LibraryTab />
        : <HistoryTab date={date} />}
    </Screen>
  );
}

// ================================================================================================ TODAY
function TodayTab({ date, startDay, bodyKg, sp }: { date: string; startDay: (n: number, way?: Way) => void; bodyKg: number; sp: ReturnType<typeof useSmartPlan> }) {
  const k = useWK();
  const { success, error } = useNotifications();
  const [way, setWay] = useState<Way>('gym');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const store = useWorkoutStore();
  const day = dayForDate(date);
  const tomorrow = dayForDate(addDays(date, 1));
  const week = W.weekStates(store.sessions, date);
  const doneToday = W.doneForDay(store.sessions, date, day.n);   // this plan day's workouts today (a catch-up of another day does not count; two of the same day both do)
  const doneTotals = W.dayTotals(doneToday);
  const act = store.active;
  const now = useNow(1000);
  const planned = activeDays().filter((d) => d.kind !== 'rest').length;
  const weekSessions = W.sessionsIn(store.sessions, 'week', date);
  const weekStats = W.statsOf(weekSessions);
  const weekDone = new Set(weekSessions.map((s) => s.date)).size;
  const smartOn = !!sp.usable && sp.source === 'smart';
  const adapt = smartOn ? sp.data?.plan?.adapt : null;
  const homeOnly = sp.data?.plan?.training?.program?.place === 'home';
  const ways = smartOn ? wayList(day, homeOnly) : [];
  const useWay: Way = ways.some((w) => w.k === way) ? way : 'gym';
  const shown = smartOn ? variantDay(day, useWay) : day;
  const mins = useWay !== 'gym' && shown !== day ? shown.minutes[0] : W.plannedMinutes(day, store.swaps);
  const canSkip = smartOn && !!day.smart && day.kind === 'strength' && doneToday.length === 0 && !act;
  // "Not today": the Smart plan slides this session to your next free day (queued offline, safe to repeat).
  const skipWith = async (reason: string) => {
    setBusy(true);
    try {
      const r: any = await write('POST', '/api/body-plan/session', skipPayload(day, reason, date, adapt?.phase?.key || ''), 'Skipped workout');
      if (r && !r.queued && r.data && r.data.plan) setSmartPlan(r.data.plan);
      setAsking(false);
      success('Noted', r && r.queued ? 'Saved on this phone. Your week adjusts when you are back online.' : 'Your week has been adjusted.');
    } catch (e: any) { error('Could not save', e?.message || 'Try again.'); } finally { setBusy(false); }
  };
  // One-tap suggestions on the "This week" card (more days, drop moves that hurt, level up) change the saved setup, then the plan is worked out again.
  const applySuggestion = async (change: any) => {
    const plan = sp.data?.plan; const sv = plan?.training?.prefs || {};
    const next = { place: sv.place, level: sv.level, days: sv.days, minutes: sv.minutes, equipment: sv.equipment, limits: sv.limits, focus: sv.focus, weekdays: sv.weekdays || [], ...(change.prefs || {}) };
    setBusy(true);
    try { await post('/api/body-plan/apply', { type: sp.data?.chosen, training: next, date, clientId: newClientId('bp') }); clearProfileCache(); await refreshSmartPlan(); success('Plan updated', 'Your training now follows this change.'); }
    catch (e: any) { error('Could not update', e?.network ? 'Changing the plan needs a connection.' : e?.message || 'Try again.'); } finally { setBusy(false); }
  };

  return (
    <View>
      {act && (
        <Card tint="accent">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="timer-outline" size={24} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 16 }}>Workout in progress</Text>
              <Text style={{ color: k.c.muted, fontSize: 12.5 }}>Day {act.dayN} – {dayByNumber(act.dayN).short} · {W.setsDoneCount(act.exercises)}/{W.setsTotal(act.exercises)} sets · {W.clock(W.elapsedSec(act, now))}</Text>
            </View>
          </View>
          <View style={{ height: 12 }} />
          <Btn label="Resume workout" icon="play" onPress={() => router.push('/workout-session')} />
        </Card>
      )}

      {!!adapt && <AdaptCard adapt={adapt} onApply={applySuggestion} busy={busy} />}
      <WeekStrip week={week} />

      {day.kind === 'rest' || (day.smart && day.items.length === 0) ? <RestCard bodyKg={bodyKg} date={date} doneToday={store.sessions.some((x) => x.date === date)} />   /* the mobility entry is always logged as day 7, so a rest day that is not Sunday must not look for its own number */ : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ backgroundColor: k.accent, padding: 16 }}>
            <Text style={{ color: '#FFE3D0', fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>{"TODAY'S WORKOUT"}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Ionicons name={day.kind === 'strength' ? 'barbell' : day.kind === 'conditioning' ? 'flash' : 'walk'} size={30} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, letterSpacing: -0.4 }}>Day {day.n} – {day.short}</Text>
                <Text style={{ color: '#FFE3D0', fontSize: 13 }} numberOfLines={2}>{day.focus}</Text>
              </View>
            </View>
          </View>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <Tile icon="time-outline" value={`~${mins} min`} label="Duration" />
              <Tile icon="flame" value={`~${useWay !== 'gym' && shown !== day ? W.plannedKcal(shown, bodyKg) : W.plannedKcal(day, bodyKg)}`} label="kcal (est.)" />
              <Tile icon="barbell" value={`${shown.items.length}`} label="Exercises" />
            </View>
            {ways.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Seg<Way> value={useWay} onChange={(w) => setWay(w)} options={ways} />
                {useWay !== 'gym' && !!day.ways?.[useWay]?.note && <Text style={{ color: k.c.muted, fontSize: 12.5, marginTop: 4 }}>{day.ways[useWay]!.note}</Text>}
              </View>
            )}
            {shown.items.slice(0, 4).map((it) => {
              const ex = EXERCISES[W.chosenId(day.n, it, store.swaps)];
              return (
                <View key={it.ex} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <ExerciseThumb ex={ex} size={40} radiusPx={10} />
                  <Text style={{ flex: 1, color: k.c.ink, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{ex.name}</Text>
                  <Text style={{ color: k.c.muted, fontSize: 12.5 }}>{it.sets} × {it.reps}{ex.unit === 'sec' ? ' s' : ex.unit === 'min' ? ' min' : ''}</Text>
                </View>
              );
            })}
            {shown.items.length > 4 && <Text style={{ color: k.c.muted, fontSize: 12.5, marginBottom: 8 }}>+ {shown.items.length - 4} more</Text>}
            <View style={{ height: 6 }} />
            {doneToday.length > 0 && !act ? (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: k.c.successSoft, borderRadius: 14, padding: 12, marginBottom: 10 }}>
                  <Check checked size={26} />
                  <Text style={{ flex: 1, color: k.c.successInk, fontWeight: '800' }}>Done today · {doneTotals.count > 1 ? `${doneTotals.count} workouts · ` : ''}{minutesText(doneTotals.minutes)} · {doneTotals.kcal} kcal</Text>
                </View>
                <Btn kind="ghost" label="Train again" icon="refresh" onPress={() => startDay(day.n, useWay)} />
              </View>
            ) : <Btn label={act && act.dayN === day.n ? 'Resume workout' : 'Start workout'} icon="arrow-forward" onPress={() => startDay(day.n, useWay)} />}
            <View style={{ height: 8 }} />
            <Btn kind="soft" label="View exercises & alternatives" onPress={() => router.push({ pathname: '/workout-day', params: { n: String(day.n) } })} />
            {canSkip && !asking && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Not today" onPress={() => setAsking(true)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                <Text style={{ color: k.c.muted, fontWeight: '800' }}>Not today</Text>
              </TouchableOpacity>
            )}
            {canSkip && asking && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: k.c.muted, fontSize: 13, marginBottom: 6 }}>That is fine. Pick a reason so the plan adjusts your week:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SKIP_REASONS.map(([id, label]) => (
                    <TouchableOpacity key={id} accessibilityRole="button" accessibilityLabel={`Not today: ${label}`} disabled={busy} onPress={() => skipWith(id)}
                      style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, backgroundColor: k.c.card, borderWidth: 1, borderColor: k.c.border, opacity: busy ? 0.6 : 1 }}>
                      <Text style={{ color: k.c.ink, fontWeight: '700', fontSize: 13 }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => setAsking(false)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}><Text style={{ color: k.c.muted, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 16 }}>{adapt ? 'Your week so far' : 'This week'}</Text>
          <Text style={{ color: k.c.muted, fontWeight: '700' }}>{Math.min(weekDone, planned)}/{planned} days</Text>
        </View>
        <View style={{ marginVertical: 10 }}><Bar pct={(Math.min(weekDone, planned) / planned) * 100} /></View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="checkmark-done" value={`${weekStats.workouts}`} label="Workouts" />
          <Tile icon="time-outline" value={minutesText(weekStats.minutes)} label="Total time" />
          <Tile icon="flame" value={weekStats.kcal.toLocaleString()} label="Calories" />
        </View>
      </Card>

      {tomorrow.kind !== 'rest' || day.kind !== 'rest' ? (
        <Card onPress={() => router.push({ pathname: '/workout-day', params: { n: String(tomorrow.n) } })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: k.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="calendar-outline" size={22} color={k.accentText} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: k.c.muted, fontSize: 12, fontWeight: '700' }}>UP NEXT · TOMORROW</Text>
              <Text style={{ color: k.c.ink, fontWeight: '900', fontSize: 16 }}>Day {tomorrow.n} – {tomorrow.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={k.c.muted} />
          </View>
        </Card>
      ) : null}

      <SectionTitle>Settings</SectionTitle>
      <Card>
        <SettingRow label="Start the rest timer when I tick a set" on={store.autoRest} onChange={(v) => setWorkout({ autoRest: v })} />
        <View style={{ height: 1, backgroundColor: k.c.border, marginVertical: 8 }} />
        <SettingRow label="Add finished workouts to my daily exercise log" hint="Counts toward exercise minutes and calories burned on Home." on={store.syncLog} onChange={(v) => setWorkout({ syncLog: v })} />
      </Card>
      <Text style={{ color: k.c.muted, fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: 6 }}>Calories are estimates from the type of session, your weight and time. Stop if you feel sharp pain. This is a training guide, not medical advice.</Text>
    </View>
  );
}

function SettingRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  const k = useWK();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: k.c.ink, fontWeight: '700', fontSize: 14 }}>{label}</Text>
        {!!hint && <Text style={{ color: k.c.muted, fontSize: 12, marginTop: 2 }}>{hint}</Text>}
      </View>
      <Switch accessibilityLabel={label} value={on} onValueChange={(v) => { tapHaptic(); onChange(v); }} trackColor={{ true: k.accent, false: k.c.border }} thumbColor="#fff" />
    </View>
  );
}

function WeekStrip({ week }: { week: ReturnType<typeof W.weekStates> }) {
  const k = useWK();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }} accessibilityRole="list">
      {week.map((d, i) => {
        const done = d.state === 'done' || d.state === 'rest-done';
        const bg = d.today ? k.accent : done ? k.c.successSoft : k.c.card;
        const fg = d.today ? '#fff' : k.c.ink;
        return (
          <TouchableOpacity key={d.date} accessibilityRole="button" accessibilityLabel={`${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}: ${d.day.title}, ${done ? 'done' : d.state === 'missed' ? 'missed' : d.today ? 'today' : d.day.kind === 'rest' ? 'rest day' : 'planned'}`}
            onPress={() => { tapHaptic(); router.push({ pathname: '/workout-day', params: { n: String(d.n) } }); }}
            style={{ flex: 1, minHeight: 74, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: d.today ? 0 : 1, borderColor: done ? k.c.success : k.c.border, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: d.today ? '#FFE3D0' : k.c.muted }}>{WEEKDAY[i]}</Text>
            <Text style={{ fontSize: 15, fontWeight: '900', color: fg, marginVertical: 3 }}>{parseDate(d.date)?.getDate()}</Text>
            {done ? <Ionicons name="checkmark-circle" size={18} color={d.today ? '#fff' : k.c.success} />
              : d.state === 'missed' ? <Ionicons name="ellipse-outline" size={16} color={k.c.muted} />
              : d.day.kind === 'rest' ? <Ionicons name="moon" size={15} color={d.today ? '#fff' : k.c.muted} />
              : <Ionicons name="ellipse" size={8} color={d.today ? '#fff' : k.accentText} style={{ marginVertical: 5 }} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RestCard({ bodyKg, date, doneToday }: { bodyKg: number; date: string; doneToday: boolean }) {
  const k = useWK();
  const store = useWorkoutStore();
  const { success } = useNotifications();
  const opt = MOBILITY_OPTIONS.find((o) => o.id === store.mobilityPick) || MOBILITY_OPTIONS[0];
  const log = async () => {
    const t = nowMs();
    await commitSession({ id: W.newId('mob'), date, dayN: 7, title: 'Gentle mobility', short: 'Mobility', kind: 'rest', startedAt: t - 600000, endedAt: t, durationSec: 600, kcal: W.estimateKcal(2.5, bodyKg, 10), volumeKg: 0, setsDone: 0, exercises: [], feel: 'easy', note: opt.name, warmDone: 0, coolDone: 0, synced: true });
    success('Mobility logged', 'Nice. Recovery counts.');
  };
  return (
    <Card tint="good">
      <Text style={{ fontSize: 12, fontWeight: '800', color: k.c.successInk, letterSpacing: 1 }}>REST DAY</Text>
      <Text style={{ fontSize: 22, fontWeight: '900', color: k.c.ink, marginTop: 2 }}>Rest & recover 🌙</Text>
      <Text style={{ color: k.c.muted, marginTop: 6, lineHeight: 20 }}>{dayByNumber(7).intro} Sleep well, drink water and eat enough protein.</Text>
      <Text style={{ fontWeight: '800', color: k.c.ink, marginTop: 14, marginBottom: 8 }}>Optional: 10 min gentle mobility</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {MOBILITY_OPTIONS.map((o) => {
          const on = o.id === opt.id;
          return <TouchableOpacity key={o.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { tapHaptic(); setWorkout({ mobilityPick: o.id }); }} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? k.accent : k.c.card, borderWidth: on ? 0 : 1, borderColor: k.c.border }}><Text style={{ fontWeight: '800', fontSize: 12.5, color: on ? '#fff' : k.c.ink }}>{o.name}</Text></TouchableOpacity>;
        })}
      </View>
      {opt.steps.map((s, i) => <Text key={s} style={{ color: k.c.ink, fontSize: 14, marginBottom: 4 }}>{i + 1}. {s} <Text style={{ color: k.c.muted }}>· about 2 min</Text></Text>)}
      <View style={{ height: 10 }} />
      {doneToday ? <Pill text="Mobility done today" tone="good" icon="checkmark-circle" /> : <Btn kind="soft" label="Mark mobility done" icon="checkmark" onPress={log} />}
    </Card>
  );
}

// ================================================================================================ PLAN
function PlanTab({ date }: { date: string }) {
  const k = useWK();
  const store = useWorkoutStore();
  const [tips, setTips] = useState(false);
  const week = W.weekStates(store.sessions, date);
  return (
    <View>
      {isSmartActive() ? (
      <Card tint="accent" style={{ padding: 18 }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: k.c.ink, letterSpacing: -0.5 }}>Smart program</Text>
        <Text style={{ color: k.c.muted, marginTop: 4, lineHeight: 19 }}>Built from your body, goal and logged sessions. It changes as you train: a missed session slides to your next free day, so nothing is lost.</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <Pill text={`${activeDays().filter((d) => d.kind === 'strength').length} lifting days a week`} icon="calendar-outline" />
          <Pill text="Current plan" tone="good" icon="checkmark-circle" />
        </View>
      </Card>
      ) : (
      <Card tint="accent" style={{ padding: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: k.c.ink, letterSpacing: -0.5 }}>{PLAN_META.name}</Text>
            <Text style={{ color: k.c.muted, marginTop: 4, lineHeight: 19 }}>{PLAN_META.blurb}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <Pill text={PLAN_META.level} tone="accent" />
          <Pill text={PLAN_META.perWeek} icon="calendar-outline" />
          <Pill text="Current plan" tone="good" icon="checkmark-circle" />
        </View>
        <View style={{ marginTop: 12, gap: 6 }}>
          {PLAN_META.goals.map((g) => <View key={g} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="checkmark-circle" size={18} color={k.c.success} /><Text style={{ color: k.c.ink, fontWeight: '600' }}>{g}</Text></View>)}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {PLAN_META.rules.map((r) => (
            <View key={r.k} style={{ flex: 1, backgroundColor: k.c.card, borderRadius: 12, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: k.c.border }}>
              <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 13 }}>{r.v}</Text>
              <Text style={{ color: k.c.muted, fontSize: 11 }}>{r.k}</Text>
            </View>
          ))}
        </View>
      </Card>
      )}

      <SectionTitle>Your week</SectionTitle>
      {activeDays().map((d, i) => {
        const st = week[i];
        const done = st.state === 'done' || st.state === 'rest-done';
        const mins = W.plannedMinutes(d, store.swaps);
        const swaps = Object.keys(store.swaps[String(d.n)] || {}).length;
        return (
          <TouchableOpacity key={d.n} accessibilityRole="button" accessibilityLabel={`Day ${d.n}, ${d.title}`} activeOpacity={0.85} onPress={() => { tapHaptic(); router.push({ pathname: '/workout-day', params: { n: String(d.n) } }); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: k.c.card, borderRadius: 18, padding: 12, marginBottom: 8, borderWidth: st.today ? 2 : 1, borderColor: st.today ? k.accent : done ? k.c.success : k.c.border }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: st.today ? k.accent : k.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: st.today ? '#FFE3D0' : k.accentText }}>DAY</Text>
              <Text style={{ fontSize: 18, fontWeight: '900', color: st.today ? '#fff' : k.accentText, marginTop: -2 }}>{d.n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 16 }}>{d.title}</Text>
              <Text style={{ color: k.c.muted, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>{d.missed ? d.focus : d.kind === 'rest' ? 'Rest · optional mobility' : d.smart && d.items.length === 0 ? `${d.title} · ~${d.minutes[0]} min` : `${d.items.length} exercises · ~${mins} min`}{swaps ? ` · ${swaps} swapped` : ''}</Text>
            </View>
            {done ? <Check checked size={26} /> : st.today ? <Pill text="Today" tone="accent" /> : <Ionicons name="chevron-forward" size={20} color={k.c.muted} />}
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: tips }} onPress={() => { tapHaptic(); setTips(!tips); }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 16 }}>Safety & progress tips</Text>
        <Ionicons name={tips ? 'chevron-up' : 'chevron-down'} size={20} color={k.c.muted} />
      </TouchableOpacity>
      {tips && <Card>{PLAN_META.safety.map((t) => <View key={t} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}><Ionicons name="shield-checkmark" size={18} color={k.c.success} /><Text style={{ flex: 1, color: k.c.ink, lineHeight: 19 }}>{t}</Text></View>)}</Card>}
    </View>
  );
}

// ================================================================================================ LIBRARY
function LibraryTab() {
  const k = useWK();
  const store = useWorkoutStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat | 'All' | 'Saved'>('All');
  const [limit, setLimit] = useState(30);
  const cats: (Cat | 'All' | 'Saved')[] = ['All', 'Saved', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Cardio'];
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return exerciseList()
      .filter((e) => (cat === 'All' ? true : cat === 'Saved' ? store.favs.includes(e.id) : e.cat === cat))
      .filter((e) => !t || e.name.toLowerCase().includes(t) || e.muscles.some((m) => m.toLowerCase().includes(t)) || e.gear.toLowerCase().includes(t))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, cat, store.favs]);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: k.c.card, borderRadius: 16, borderWidth: 1.5, borderColor: k.c.border, paddingHorizontal: 12, marginBottom: 10 }}>
        <Ionicons name="search" size={18} color={k.c.muted} />
        <TextInput accessibilityLabel="Search exercises" value={q} onChangeText={(t) => { setQ(t); setLimit(30); }} placeholder="Search exercise, muscle or equipment" placeholderTextColor={k.c.muted} style={{ flex: 1, minHeight: 48, color: k.c.ink, fontSize: 15 }} returnKeyType="search" />
        {!!q && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQ('')} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close-circle" size={20} color={k.c.muted} /></TouchableOpacity>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        {cats.map((c) => {
          const on = cat === c;
          return (
            <TouchableOpacity key={c} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { tapHaptic(); setCat(c); setLimit(30); }}
              style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, marginRight: 7, marginBottom: 7, backgroundColor: on ? k.accent : k.c.chipBg, borderWidth: on ? 0 : 1, borderColor: k.c.border }}>
              <Text style={{ fontWeight: '800', fontSize: 13, color: on ? '#fff' : k.c.ink }}>{c === 'Saved' ? '♥ Saved' : c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ color: k.c.muted, fontSize: 12.5, marginBottom: 8 }}>{list.length} exercise{list.length === 1 ? '' : 's'}</Text>
      {list.length === 0 && <Card><Text style={{ color: k.c.muted, textAlign: 'center' }}>{cat === 'Saved' ? 'Tap the heart on an exercise to save it here.' : 'Nothing matches. Try a different word.'}</Text></Card>}
      {list.slice(0, limit).map((e) => {
        const fav = store.favs.includes(e.id);
        return (
          <ExerciseRow key={e.id} ex={e} line={`${e.cat} · ${e.gear}`} sub={e.muscles.slice(0, 2).join(', ')} onPress={() => router.push({ pathname: '/workout-exercise', params: { id: e.id } })}
            right={<TouchableOpacity accessibilityRole="button" accessibilityLabel={fav ? `Remove ${e.name} from saved` : `Save ${e.name}`} accessibilityState={{ selected: fav }} onPress={() => { tapHaptic(); toggleFav(e.id); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? '#E8476F' : k.c.muted} /></TouchableOpacity>} />
        );
      })}
      {list.length > limit && <Btn kind="ghost" label={`Show ${Math.min(30, list.length - limit)} more`} onPress={() => setLimit(limit + 30)} />}
    </View>
  );
}

// ================================================================================================ HISTORY
function HistoryTab({ date }: { date: string }) {
  const k = useWK();
  const store = useWorkoutStore();
  const { units } = useProfile();
  const unit = units?.weight || 'kg';
  const { undoableDelete } = useNotifications();
  const [mode, setMode] = useState<W.RangeMode>('week');
  const [anchor, setAnchor] = useState(date);
  const [open, setOpen] = useState<string | null>(null);
  const list = W.sessionsIn(store.sessions, mode, anchor);
  const st = W.statsOf(list);
  const b = W.rangeBounds(mode, anchor);
  const label = mode === 'all' ? 'All time' : mode === 'week' ? (W.mondayOf(anchor) === W.mondayOf(date) ? 'This week' : `${fmtD(b!.from)} – ${fmtD(b!.to)}`) : monthName(anchor);
  const canNext = mode !== 'all' && W.rangeBounds(mode, W.shiftAnchor(mode, anchor, 1))!.from <= date;

  // minutes per weekday for the week view
  const perDay = mode === 'week' ? W.weekDates(anchor).map((d) => list.filter((s) => s.date === d).reduce((m, s) => m + Math.round(s.durationSec / 60), 0)) : [];
  const maxMin = Math.max(30, ...perDay);

  const bests = useMemo(() => {
    const ids = Array.from(new Set(store.sessions.flatMap((s) => s.exercises.map((e) => e.exId))));
    return ids.map((id) => ({ id, best: W.bestFor(store.sessions, id) })).filter((x) => x.best && x.best.kg > 0 && EXERCISES[x.id]).sort((a, c) => (c.best!.e1rm - a.best!.e1rm)).slice(0, 5);
  }, [store.sessions]);

  return (
    <View>
      <Seg<W.RangeMode> value={mode} onChange={(m) => { setMode(m); setAnchor(date); }} options={[{ k: 'week', label: 'Weekly' }, { k: 'month', label: 'Monthly' }, { k: 'all', label: 'All time' }]} />
      {mode !== 'all' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous" onPress={() => { tapHaptic(); setAnchor(W.shiftAnchor(mode, anchor, -1)); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={22} color={k.c.ink} /></TouchableOpacity>
          <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 16 }}>{label}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next" disabled={!canNext} onPress={() => { tapHaptic(); setAnchor(W.shiftAnchor(mode, anchor, 1)); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canNext ? 1 : 0.3 }}><Ionicons name="chevron-forward" size={22} color={k.c.ink} /></TouchableOpacity>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <Tile icon="checkmark-done" value={`${st.workouts}`} label="Workouts" />
        <Tile icon="time-outline" value={st.minutes >= 60 ? `${Math.floor(st.minutes / 60)}h ${st.minutes % 60}m` : `${st.minutes} min`} label="Total time" />
        <Tile icon="flame" value={`~${st.kcal.toLocaleString()}`} label="Calories" />
      </View>

      {mode === 'week' && (
        <Card>
          <Text style={{ fontWeight: '800', color: k.c.ink, marginBottom: 10 }}>Minutes per day</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 8 }}>
            {perDay.map((m, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}: ${m} minutes`}>
                <View style={{ width: '100%', height: Math.max(4, (m / maxMin) * 70), borderRadius: 6, backgroundColor: m ? k.accent : k.c.chipBg }} />
                <Text style={{ fontSize: 11, color: k.c.muted, marginTop: 4, fontWeight: '700' }}>{WEEKDAY[i]}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <SectionTitle>Workouts</SectionTitle>
      {list.length === 0 && <Card><Text style={{ color: k.c.muted, textAlign: 'center', lineHeight: 20 }}>No workouts here yet. Finish one and it shows up with every set you did.</Text></Card>}
      {list.map((s) => {
        const isOpen = open === s.id;
        const d = parseDate(s.date);
        return (
          <View key={s.id} style={{ backgroundColor: k.c.card, borderRadius: 18, marginBottom: 8, borderWidth: 1, borderColor: k.c.border, overflow: 'hidden' }}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: isOpen }} activeOpacity={0.85} onPress={() => { tapHaptic(); setOpen(isOpen ? null : s.id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              <Check checked size={28} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 15 }}>{d ? d.toLocaleDateString('en-IN', { weekday: 'short' }) : ''} – {s.short}</Text>
                <Text style={{ color: k.c.muted, fontSize: 12.5, marginTop: 2 }}>{d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : s.date} · {Math.round(s.durationSec / 60)} min · {s.kcal} kcal{s.setsDone ? ` · ${s.setsDone} sets` : ''}</Text>
              </View>
              {s.prs && s.prs.length > 0 && <Pill text={`${s.prs.length} PB`} tone="accent" icon="trophy" />}
              <Text style={{ fontSize: 20 }}>{W.FEEL_EMOJI[s.feel]}</Text>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={k.c.muted} />
            </TouchableOpacity>
            {!!s.syncFailed && (
              <View accessibilityRole="alert" style={{ marginHorizontal: 14, marginBottom: 10, padding: 10, borderRadius: 12, backgroundColor: k.c.danger + '1F', flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, color: k.c.ink, fontSize: 12.5, lineHeight: 18 }}>⚠ Not in your Exercise log yet: {s.syncFailed.reason}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Try sending this workout again" onPress={() => { retrySession(s.id); void retryUnsynced(); }} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 10 }}>
                  <Text style={{ color: k.c.danger, fontWeight: '800' }}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}
            {isOpen && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                {s.exercises.map((e) => (
                  <View key={e.exId + e.baseId} style={{ marginBottom: 8 }}>
                    <Text style={{ color: k.c.ink, fontWeight: '800', fontSize: 13.5 }}>{EXERCISES[e.exId]?.name || e.exId}</Text>
                    <Text style={{ color: k.c.muted, fontSize: 12.5, lineHeight: 18 }}>{e.sets.map((x) => (W.isLoaded(EXERCISES[e.exId]) && x.kg > 0 ? `${x.reps} × ${weightValue(x.kg, unit)} ${unit}` : `${x.reps}${e.unit === 'sec' ? ' s' : e.unit === 'min' ? ' min' : ''}`)).join('  ·  ')}</Text>
                  </View>
                ))}
                {!!s.note && <Text style={{ color: k.c.muted, fontStyle: 'italic', fontSize: 13, marginBottom: 8 }}>“{s.note}”</Text>}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete this workout" onPress={() => { deleteSessionEverywhere(s); undoableDelete('Workout deleted', () => { setTimeout(() => { void flushSessionDeletes(); }, 400); }, () => undoSessionDelete(s)); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ color: k.c.danger, fontWeight: '800' }}>Delete workout</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      {bests.length > 0 && (
        <>
          <SectionTitle>Personal bests</SectionTitle>
          <Card>
            {bests.map((x, i) => (
              <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.border }}>
                <ExerciseThumb ex={EXERCISES[x.id]} size={40} radiusPx={10} />
                <View style={{ flex: 1 }}><Text style={{ color: k.c.ink, fontWeight: '800', fontSize: 14 }}>{EXERCISES[x.id].name}</Text><Text style={{ color: k.c.muted, fontSize: 12 }}>{x.best!.reps} × {weightValue(x.best!.kg, unit)} {unit}</Text></View>
                <Text style={{ color: k.accentText, fontWeight: '900' }}>~{weightValue(x.best!.e1rm, unit)} {unit}</Text>
              </View>
            ))}
            <Text style={{ color: k.c.muted, fontSize: 11.5, marginTop: 8 }}>Right-hand number is the estimated one-rep max (Epley), from your own logged sets.</Text>
          </Card>
        </>
      )}
    </View>
  );
}

const fmtD = (v: string) => parseDate(v)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || v;
const monthName = (v: string) => parseDate(v)?.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) || v;

// A crash in this tab shows a friendly retry screen (and is reported to Sentry) instead of closing the app.
export { ScreenError as ErrorBoundary } from '../../components/ScreenError';
