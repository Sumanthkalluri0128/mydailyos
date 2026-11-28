// The workout you are doing right now. Warm-up -> one exercise at a time (tick sets, rest timer runs) -> cool-down -> summary.
// Saved on the phone after every tap, so closing the app mid-workout loses nothing: reopen the Workout tab and tap Resume.
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Confetti } from '../motion/Confetti';
import { useNotifications } from '../components/Notifications';
import { useProfile } from '../hooks/useProfile';
import { today } from '../config/api';
import { successHaptic, tapHaptic, warningHaptic } from '../utils/haptics';
import { lbToKg, weightValue } from '../utils/units';
import { COOLDOWN, EXERCISES, Routine, WARMUP, dayByNumber } from '../data/workoutPlan';
import { PAIN_CHIPS, variantDay } from '../utils/smartPlan';
import * as W from '../utils/workoutEngine';

// Effort of the heaviest set (RPE). The coach makes the next jump bigger after an easy one and holds the weight after a grinding one.
const RPE_CHOICES: [number, string][] = [[6, 'Easy'], [7, 'Comfortable'], [8, 'Hard'], [9, 'Very hard'], [10, 'All out']];
import { commitSession, pickRoutine, saveActive, setSwap, useWorkoutStore } from '../utils/workoutStore';
import { syncAndRecord } from '../utils/workoutSync';
import { AlternativesSheet, RestBar, RoutineList } from '../components/workout/WorkoutParts';
import { Bar, Btn, Card, Check, ExerciseThumb, IconBtn, Pill, Stepper, Tile, minutesText, useNow, useWK } from '../components/workout/WorkoutKit';

type Rest = { endsAt: number; total: number };

export default function WorkoutSession() {
  const k = useWK();
  const { c } = k;
  const { dayN, way } = useLocalSearchParams<{ dayN?: string; way?: string }>();
  const store = useWorkoutStore();
  const { error, success, confirm } = useNotifications();
  const { profile, units } = useProfile();
  const unit = units?.weight || 'kg';
  const now = useNow(1000);
  const [rest, setRest] = useState<Rest | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [feel, setFeel] = useState<W.Feel>('good');
  const [note, setNote] = useState('');
  const [pain, setPain] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [boom, setBoom] = useState(0);
  const started = useRef(false);

  const fmtKg = (kg: number) => `${weightValue(kg, unit)} ${unit}`;
  const a = store.active;
  const baseDay = a ? dayByNumber(a.dayN) : dayByNumber(Number(dayN) || 1);
  const day = a && a.snap && a.snap.way && a.snap.way !== 'gym' ? variantDay(baseDay, a.snap.way) : baseDay; // Home match / Quick 20 lists, so swaps find their exercise
  const planRows = (list: string[] | undefined, id: string): Routine[] | null => (list && list.length ? list.map((t, i) => ({ id: `${id}${i}`, name: t, detail: '', alts: [] })) : null);

  // Start a new workout when asked to, once the saved data has been read. Never replaces one already in progress.
  useEffect(() => {
    if (!store.ready || started.current) return;
    started.current = true;
    if (store.active) return;
    const n = Number(dayN);
    if (!n) { router.replace('/(tabs)/workout'); return; }
    saveActive(W.buildSession(dayByNumber(n), store.swaps, store.sessions, today(), Date.now(), fmtKg, way === 'home' || way === 'quick' ? way : 'gym'));
  }, [store.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (fn: (s: W.ActiveSession) => W.ActiveSession) => { const cur = store.active; if (cur) saveActive(fn(cur)); };
  const left = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
  const buzzed = useRef(0);
  useEffect(() => {
    if (rest && left === 0 && buzzed.current !== rest.endsAt) { buzzed.current = rest.endsAt; Vibration.vibrate([0, 300, 120, 300]); successHaptic(); }
  }, [left, rest]);

  const elapsed = a ? W.elapsedSec(a, now) : 0;
  const total = a ? W.setsTotal(a.exercises) : 0;
  const done = a ? W.setsDoneCount(a.exercises) : 0;
  const bodyKg = profile?.currentWeightKg || W.DEFAULT_BODY_KG;
  const preview = useMemo(() => (a && finishing ? W.finishSession(a, { now, bodyKg, feel, note, history: store.sessions }) : null), [finishing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.muted }}>Getting your workout ready…</Text></SafeAreaView>;

  const paused = a.pausedAt !== null;
  const togglePause = () => upd((s) => (s.pausedAt === null ? { ...s, pausedAt: Date.now() } : { ...s, pausedMs: s.pausedMs + (Date.now() - (s.pausedAt as number)), pausedAt: null }));
  const leave = () => router.back();
  const discard = async () => {
    const ok = await confirm({ title: 'Discard this workout?', message: 'Everything you logged in it will be lost.', confirmText: 'Discard', destructive: true });
    if (ok) { saveActive(null); setRest(null); router.replace('/(tabs)/workout'); }
  };

  const goPhase = (phase: W.ActiveSession['phase']) => upd((s) => ({ ...s, phase }));
  const toFinish = () => {
    if (done === 0) { warningHaptic(); error('Nothing logged yet', 'Tick at least one set to save this workout.'); return; }
    setRest(null);
    if (day.kind === 'strength' && a.phase !== 'cooldown') goPhase('cooldown'); else setFinishing(true);
  };

  // --------------------------------------------------------------------------------------------- summary + save
  if (finishing && preview) {
    const prs = preview.prs || [];
    const save = async () => {
      if (saving) return;
      setSaving(true);
      try {
        const session = W.finishSession(a, { now: Date.now(), bodyKg, feel, note, history: store.sessions, pain });
        await commitSession(session);
        successHaptic(); setBoom((n) => n + 1);
        if (store.syncLog) await syncAndRecord(session);   // sent, or (if the server refuses it) flagged in History with the reason
        success('Workout saved', `${session.setsDone} sets · ${minutesText(Math.round(session.durationSec / 60))}`);
        router.replace('/(tabs)/workout');
      } catch (e: any) { error('Could not save', e?.message || 'Try again.'); setSaving(false); }
    };
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 16 }}>
              <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: k.accentSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: k.accentLine }}>
                <Text style={{ fontSize: 40 }}>🏆</Text>
                <Confetti fire={boom} />
              </View>
              <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '900', color: c.ink, marginTop: 12, letterSpacing: -0.5 }}>Workout complete!</Text>
              <Text style={{ color: c.muted, marginTop: 4 }}>{day.title} · Day {day.n}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <Tile icon="time-outline" value={`${Math.max(1, Math.round(preview.durationSec / 60))} min`} label="Duration" />
              <Tile icon="flame" value={`${preview.kcal}`} label="kcal (est.)" />
              <Tile icon="barbell" value={`${W.exercisesTouched(a.exercises)}/${a.exercises.length}`} label="Exercises" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <Tile icon="layers-outline" value={`${preview.setsDone}`} label="Sets" />
              <Tile icon="stats-chart" value={preview.volumeKg ? `${Math.round(weightValue(preview.volumeKg, unit)).toLocaleString()} ${unit}` : '—'} label="Volume lifted" />
            </View>
            {prs.length > 0 && (
              <Card tint="accent">
                <Text style={{ fontWeight: '900', color: c.ink, fontSize: 15, marginBottom: 6 }}>🎉 New personal best{prs.length > 1 ? 's' : ''}</Text>
                {prs.map((p) => <Text key={p.exId} style={{ color: c.ink, fontSize: 13.5, marginTop: 2 }}>• {p.name}: {p.kind === 'weight' ? `estimated max ${fmtKg(p.value)} (was ${fmtKg(p.prev)})` : `${p.value} reps (was ${p.prev})`}</Text>)}
              </Card>
            )}
            <Text style={{ fontWeight: '900', color: c.ink, fontSize: 16, marginTop: 6, marginBottom: 10 }}>How was it?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {(['easy', 'good', 'challenging', 'hard'] as W.Feel[]).map((f) => {
                const on = feel === f;
                return (
                  <TouchableOpacity key={f} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={W.FEEL_LABEL[f]} onPress={() => { tapHaptic(); setFeel(f); }}
                    style={{ flex: 1, minHeight: 74, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? k.accentSoft : c.card, borderWidth: on ? 2 : 1, borderColor: on ? k.accent : c.border }}>
                    <Text style={{ fontSize: 26 }}>{W.FEEL_EMOJI[f]}</Text>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: c.ink, marginTop: 2 }}>{W.FEEL_LABEL[f]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {feel === 'hard' && <Text style={{ color: c.warnInk, backgroundColor: c.warnSoft, padding: 10, borderRadius: 12, fontSize: 12.5, marginBottom: 12 }}>Hard sessions need easier days after. Next time, pick lighter weights or an easier alternative.</Text>}
            {a.snap && a.snap.smart && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontWeight: '800', color: c.muted, fontSize: 13, marginBottom: 6 }}>Anything sore or odd? (optional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="none">
                  {PAIN_CHIPS.map(([id, label]) => {
                    const on = pain.includes(id);
                    return (
                      <TouchableOpacity key={id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${label} pain`} onPress={() => { tapHaptic(); setPain((x) => (on ? x.filter((y) => y !== id) : [...x, id])); }}
                        style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, backgroundColor: on ? k.accentSoft : c.card, borderWidth: on ? 2 : 1, borderColor: on ? k.accent : c.border }}>
                        <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {pain.includes('dizzy') && <Text style={{ color: c.warnInk, backgroundColor: c.warnSoft, padding: 10, borderRadius: 12, fontSize: 12.5, marginTop: 8 }}>Dizziness or chest pressure: stop training and see a doctor before the next session.</Text>}
              </View>
            )}
            <Text style={{ fontWeight: '800', color: c.muted, fontSize: 13, marginBottom: 6 }}>Notes (optional)</Text>
            <TextInput accessibilityLabel="Workout notes" value={note} onChangeText={setNote} placeholder="Felt good, better form today!" placeholderTextColor={c.muted} multiline maxLength={400}
              style={{ minHeight: 84, textAlignVertical: 'top', borderWidth: 1.5, borderColor: c.border, backgroundColor: c.card, borderRadius: 14, padding: 12, fontSize: 15, color: c.ink, marginBottom: 16 }} />
            <Btn label={saving ? 'Saving…' : 'Save & Finish'} icon="checkmark-circle" onPress={save} disabled={saving} />
            <View style={{ height: 8 }} />
            <Btn label="Back to workout" kind="ghost" onPress={() => { setFinishing(false); upd((s) => ({ ...s, phase: 'main' })); }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --------------------------------------------------------------------------------------------- shared header
  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBtn icon="chevron-back" label="Leave workout (progress is saved)" onPress={leave} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: c.ink }} numberOfLines={1}>Day {day.n} – {day.short}</Text>
          <Text style={{ fontSize: 12.5, color: c.muted }}>{done}/{total} sets · {a.phase === 'warmup' ? 'Warm-up' : a.phase === 'cooldown' ? 'Cool-down' : `Exercise ${a.idx + 1} of ${a.exercises.length}`}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={paused ? 'Resume timer' : 'Pause timer'} onPress={() => { tapHaptic(); togglePause(); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: paused ? k.accent : k.accentSoft, borderWidth: 1, borderColor: k.accentLine }}>
          <Text style={{ fontWeight: '900', fontSize: 16, color: paused ? '#fff' : k.accentText, fontVariant: ['tabular-nums'] }}>{W.clock(elapsed)}</Text>
          <Ionicons name={paused ? 'play' : 'pause'} size={16} color={paused ? '#fff' : k.accentText} />
        </TouchableOpacity>
      </View>
      <View style={{ marginTop: 10 }}><Bar pct={total ? (done / total) * 100 : 0} /></View>
    </View>
  );

  // --------------------------------------------------------------------------------------------- warm-up / cool-down
  if (a.phase === 'warmup' || a.phase === 'cooldown') {
    const isWarm = a.phase === 'warmup';
    const rows = (isWarm ? planRows(a.snap && a.snap.warmup, 'pw') : planRows(a.snap && a.snap.cooldown, 'pc')) || (isWarm ? WARMUP : COOLDOWN); // the plan's own lists when it has them
    const ticked = isWarm ? a.warmDone : a.coolDone;
    const toggle = (id: string) => upd((s) => {
      const key = isWarm ? 'warmDone' : 'coolDone';
      const cur = s[key];
      return { ...s, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
          <Card tint="accent">
            <Text style={{ fontSize: 18, fontWeight: '900', color: c.ink }}>{isWarm ? '🔥 Warm-up · 5–8 min' : '❄️ Cool-down · 5–8 min'}</Text>
            <Text style={{ color: c.muted, marginTop: 4, lineHeight: 19, fontSize: 13.5 }}>{isWarm ? 'Easy and dynamic. It should raise your heart rate and loosen your joints, not tire you out. Tick what you do. Tap a row to swap it.' : 'Slow down and stretch. Hold each stretch 20–30 seconds. It should feel comfortable, never painful.'}</Text>
          </Card>
          <RoutineList rows={rows} picks={store.routinePicks} done={ticked} onToggle={toggle} onPick={pickRoutine} />
          <View style={{ height: 6 }} />
          {isWarm
            ? <><Btn label="Start exercises" icon="play" onPress={() => goPhase('main')} /><View style={{ height: 8 }} /><Btn label="Skip warm-up" kind="ghost" onPress={() => goPhase('main')} /></>
            : <><Btn label="Finish workout" icon="flag" onPress={() => setFinishing(true)} /><View style={{ height: 8 }} /><Btn label="Skip cool-down" kind="ghost" onPress={() => setFinishing(true)} /></>}
          <View style={{ height: 8 }} />
          <TouchableOpacity accessibilityRole="button" onPress={discard} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.danger, fontWeight: '800' }}>Discard workout</Text></TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --------------------------------------------------------------------------------------------- one exercise
  const idx = Math.max(0, Math.min(a.exercises.length - 1, a.idx));
  const cur = a.exercises[idx];
  const ex = EXERCISES[cur.exId];
  const item = day.items.find((i) => i.ex === cur.baseId) || null;
  const loaded = W.isLoaded(ex);
  const curSetIdx = cur.sets.findIndex((s) => !s.done);
  const activeSet = curSetIdx === -1 ? cur.sets.length - 1 : curSetIdx;
  const repLabel = cur.unit === 'sec' ? 'Seconds' : cur.unit === 'min' ? 'Minutes' : 'Reps';
  const repStep = cur.unit === 'sec' ? 5 : 1;
  const wStep = unit === 'lb' ? 5 : W.stepKgFor(ex);
  const isLast = idx === a.exercises.length - 1;

  const setExercise = (fn: (e: W.SessionExercise) => W.SessionExercise) => upd((s) => ({ ...s, exercises: s.exercises.map((e, i) => (i === idx ? fn(e) : e)) }));
  const toggleSet = (i: number) => {
    const wasDone = cur.sets[i].done;
    setExercise((e) => ({ ...e, skipped: false, sets: e.sets.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) }));
    if (!wasDone) {
      successHaptic();
      const lastOfAll = isLast && cur.sets.every((x, j) => j === i || x.done);
      if (store.autoRest && cur.restSec > 0 && !lastOfAll && cur.unit !== 'min') setRest({ endsAt: Date.now() + cur.restSec * 1000, total: cur.restSec });
    } else setRest(null);
  };
  // Changing a value also updates the sets after it that still hold the old value (most people lift the same all the way through).
  const editField = (i: number, field: 'kg' | 'reps', value: number) => setExercise((e) => {
    const old = e.sets[i][field];
    return { ...e, sets: e.sets.map((x, j) => (j === i ? { ...x, [field]: value } : j > i && !x.done && x[field] === old ? { ...x, [field]: value } : x)) };
  });
  const addSet = () => setExercise((e) => ({ ...e, sets: [...e.sets, { ...e.sets[e.sets.length - 1], done: false }] }));
  const removeSet = () => setExercise((e) => (e.sets.length > 1 && !e.sets[e.sets.length - 1].done ? { ...e, sets: e.sets.slice(0, -1) } : e));
  const go = (n: number) => { setRest(null); upd((s) => ({ ...s, idx: Math.max(0, Math.min(s.exercises.length - 1, n)) })); };
  const next = () => { if (isLast) toFinish(); else go(idx + 1); };
  const skip = () => { setExercise((e) => ({ ...e, skipped: true })); next(); };
  const pickAlt = (id: string) => {
    setSwapOpen(false);
    if (!item || id === cur.exId) return;
    upd((s) => W.swapInSession(s, idx, id, day, store.sessions, fmtKg));
    setSwap(day.n, item.ex, id); // remembered for next time
    tapHaptic();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
          {a.exercises.map((e, i) => {
            const d = W.exerciseDone(e), on = i === idx;
            return (
              <TouchableOpacity key={e.baseId} accessibilityRole="button" accessibilityLabel={`Exercise ${i + 1}: ${EXERCISES[e.exId]?.name}${d ? ', done' : ''}`} onPress={() => { tapHaptic(); go(i); }}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: d ? c.success : on ? k.accent : c.chipBg, borderWidth: on || d ? 0 : 1, borderColor: c.border, opacity: e.skipped ? 0.45 : 1 }}>
                {d ? <Ionicons name="checkmark" size={20} color={k.isDark ? '#06140D' : '#fff'} /> : <Text style={{ fontWeight: '900', color: on ? '#fff' : c.ink }}>{i + 1}</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`How to do ${ex?.name}`} onPress={() => router.push({ pathname: '/workout-exercise', params: { id: cur.exId, dayN: String(day.n) } })}><ExerciseThumb ex={ex} size={84} radiusPx={18} /></TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontWeight: '900', color: c.ink, letterSpacing: -0.3 }}>{ex?.name}</Text>
              <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{ex?.muscles.slice(0, 2).join(' · ')}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Pill text={`Set ${Math.min(activeSet + 1, cur.sets.length)} of ${cur.sets.length}`} tone="accent" />
                <Pill text={`${cur.targetReps} ${cur.unit === 'reps' ? 'reps' : cur.unit}`} />
                {cur.restSec > 0 && <Pill text={`Rest ${cur.restSec}s`} icon="time-outline" />}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Btn small kind="soft" label="How to" icon="information-circle-outline" onPress={() => router.push({ pathname: '/workout-exercise', params: { id: cur.exId, dayN: String(day.n) } })} style={{ flex: 1 }} />
            {item && item.alts.length > 0 && <Btn small kind="soft" label="Swap" icon="swap-horizontal" onPress={() => setSwapOpen(true)} style={{ flex: 1 }} />}
          </View>
          {!!cur.hint && <Text style={{ color: c.muted, fontSize: 12.5, marginTop: 10, lineHeight: 18 }}>💡 {cur.hint}</Text>}
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ width: 40, fontWeight: '800', color: c.muted, fontSize: 12 }}>SET</Text>
            <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: c.muted, fontSize: 12 }}>{loaded ? `WEIGHT (${unit.toUpperCase()})` : 'BODYWEIGHT'}</Text>
            <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: c.muted, fontSize: 12 }}>{repLabel.toUpperCase()}</Text>
            <View style={{ width: 44 }} />
          </View>
          {cur.sets.map((s, i) => {
            const isActive = i === activeSet && !W.exerciseDone(cur);
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: s.done ? c.successSoft : 'transparent', borderRadius: 14, paddingVertical: 2 }}>
                <Text style={{ width: 40, fontSize: 17, fontWeight: '900', color: s.done ? c.successInk : c.ink, textAlign: 'center' }}>{i + 1}</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  {loaded
                    ? <Stepper label={`Set ${i + 1} weight`} value={weightValue(s.kg, unit)} step={wStep} decimals={1} width={132} highlight={isActive} onChange={(n) => editField(i, 'kg', unit === 'lb' ? lbToKg(n) : n)} />
                    : <Text style={{ color: c.muted, fontWeight: '700', fontSize: 13 }}>—</Text>}
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Stepper label={`Set ${i + 1} ${repLabel.toLowerCase()}`} value={s.reps} step={repStep} min={0} max={cur.unit === 'reps' ? 100 : 600} width={loaded ? 118 : 150} highlight={isActive} onChange={(n) => editField(i, 'reps', n)} />
                </View>
                <Check checked={s.done} onPress={() => toggleSet(i)} size={32} label={`Set ${i + 1} done`} />
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Btn small kind="ghost" label="Add set" icon="add" onPress={addSet} style={{ flex: 1 }} />
            <Btn small kind="ghost" label="Remove set" icon="remove" onPress={removeSet} disabled={cur.sets.length <= 1 || cur.sets[cur.sets.length - 1].done} style={{ flex: 1 }} />
          </View>
        </Card>

        {loaded && cur.sets.some((s) => s.done) && (
          <Card>
            <Text style={{ fontWeight: '800', color: c.ink, fontSize: 13.5 }}>How hard was your heaviest set?</Text>
            <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>Optional. Your coach uses it to choose the next weight.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {RPE_CHOICES.map(([v, label]) => {
                const on = cur.sets.some((s) => s.rpe === v);
                return (
                  <TouchableOpacity key={v} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Effort ${label}`}
                    onPress={() => setExercise((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, rpe: on ? undefined : v })) }))}
                    style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? c.successInk : c.muted, backgroundColor: on ? c.successSoft : 'transparent' }}>
                    <Text style={{ color: on ? c.successInk : c.ink, fontWeight: '700', fontSize: 12.5 }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        )}

        {rest && left > 0 && <RestBar left={left} total={rest.total} onSkip={() => setRest(null)} onAdd={(s) => setRest({ endsAt: rest.endsAt + s * 1000, total: rest.total + s })} />}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
          <TouchableOpacity accessibilityRole="button" onPress={skip} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.muted, fontWeight: '800' }}>Skip this exercise</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={discard} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.danger, fontWeight: '800' }}>Discard workout</Text></TouchableOpacity>
        </View>
        <Text style={{ color: c.muted, fontSize: 11.5, textAlign: 'center', marginTop: 8 }}>Stop if you feel sharp pain. This is a training guide, not medical advice.</Text>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 24, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.border }}>
        <Btn kind="ghost" label="Previous" icon="arrow-back" onPress={() => go(idx - 1)} disabled={idx === 0} style={{ flex: 1 }} />
        <Btn label={isLast ? 'Finish' : 'Next'} icon={isLast ? 'flag' : 'arrow-forward'} onPress={next} style={{ flex: 1.3 }} />
      </View>

      <AlternativesSheet visible={swapOpen} onClose={() => setSwapOpen(false)} item={item} currentId={cur.exId} onPick={pickAlt}
        onInfo={(id) => { setSwapOpen(false); router.push({ pathname: '/workout-exercise', params: { id, dayN: String(day.n) } }); }} />
    </SafeAreaView>
  );
}
