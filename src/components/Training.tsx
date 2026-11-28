// Strength and training hub: today's suggestion, workout mode, progress and power level, plate calculator,
// beginner "training arcs", and guided meditate / stretch. The rules live on the server; plate maths and the breathing
// pattern live in utils/training.js so they work offline.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, ScrollView, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { get, post, del, today, newClientId } from '../config/api';
import Buddy, { BuddyEmpty } from '../motion/Buddy';
import { TimerRing } from '../motion/Press';
import { Button, useThemedStyles } from './UI';
import { Chip } from './Chip';
import { useNotifications } from './Notifications';
import { successHaptic, tapHaptic, warningHaptic } from '../utils/haptics';
import { FORMULAS, SAFETY_NOTE, checkJump, plateCalc, breathPhase, cueAt, clock, planSets, toResults, DEFAULT_PLATES, DEFAULT_BAR } from '../utils/training';

type Item = { name: string; sets: number; reps: number | string; weightKg?: number | null; restSec?: number; type?: string };
export type WorkoutPlan = { title: string; who?: string; scene?: any; exercises: Item[]; intro?: string; template?: { _id: string }; program?: { week: number; day: number } };
type SetRow = { reps: string; kg: string; done: boolean };
// (Item.sets is the planned NUMBER of sets; while training it becomes the list of set rows, so the number is left out.)
type ExState = Omit<Item, 'sets'> & { sets: SetRow[]; hint: string | null; recentBestKg: number };

/** Rest timer (the same one used by the quick log): pick a duration, it counts down and buzzes. Auto-starts after a set when `autoSec` is given. */
function Rest({ autoSec, tick }: { autoSec?: number; tick: number }) {
  const { S, colors: c } = useThemedStyles();
  const [left, setLeft] = useState(0);
  const [total, setTotal] = useState(0);
  const end = useRef(0);
  const start = useCallback((s: number) => { end.current = Date.now() + s * 1000; setTotal(s); setLeft(s); }, []);
  useEffect(() => { if (tick && autoSec) start(autoSec); }, [tick]);
  useEffect(() => {
    if (!left) return;
    const id = setInterval(() => { const r = Math.max(0, Math.ceil((end.current - Date.now()) / 1000)); setLeft(r); if (r === 0) Vibration.vibrate([0, 400, 150, 400]); }, 250);
    return () => clearInterval(id);
  }, [left > 0]);
  return (
    <View style={{ backgroundColor: c.chipBg, borderRadius: 16, padding: 12, marginVertical: 10 }}>
      <View style={S.between}>
        <Text style={{ fontWeight: '800', color: c.ink }}>⏱ Rest timer</Text>
        <TimerRing totalSec={total} remainingSec={left} running={left > 0} size={60} stroke={5} color={c.primary} track={c.border}>
          <Text style={{ fontWeight: '800', color: left ? c.primary : c.muted }}>{clock(left)}</Text>
        </TimerRing>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {[30, 60, 90, 120].map((s) => <Chip key={s} small label={s < 90 ? `${s}s` : s === 90 ? '1:30' : '2 min'} onPress={() => start(s)} />)}
        {left > 0 && <Chip small label="Stop" onPress={() => { setLeft(0); setTotal(0); }} />}
      </View>
    </View>
  );
}

const Num = ({ label, value, onChange, width = 70 }: { label: string; value: string; onChange: (s: string) => void; width?: number }) => {
  const { colors: c } = useThemedStyles();
  return (
    <View style={{ width }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: c.muted }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" accessibilityLabel={label}
        style={{ minHeight: 44, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 8, color: c.ink, backgroundColor: c.card }} />
    </View>
  );
};

/** Workout mode: step through exercises, tick each set (prefilled from last time), keep the rest timer, save as one workout. */
export function WorkoutMode({ plan, onClose, onSaved }: { plan: WorkoutPlan | null; onClose: () => void; onSaved?: () => void }) {
  const { S, colors: c } = useThemedStyles();
  const { error, warning, success } = useNotifications();
  const [state, setState] = useState<ExState[]>([]);
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [sure, setSure] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!plan) return;
    setIdx(0); setDone(null); setSure({}); startedAt.current = Date.now();
    setState(plan.exercises.map((e) => ({ ...e, sets: planSets(e, null), hint: null, recentBestKg: 0 })));
    let live = true;
    get<any>(`/api/training/last-sets?date=${today()}&names=${encodeURIComponent(plan.exercises.map((e) => e.name).join('|'))}`).then((j) => {
      if (!live) return;
      setState((cur) => cur.map((e, i) => { const last = j.lastSets?.[e.name]; return { ...e, sets: planSets(plan.exercises[i], last), hint: last?.beat?.text || null, recentBestKg: last?.recentBestKg || 0 }; }));
    }).catch(() => {});
    return () => { live = false; };
  }, [plan]);

  if (!plan) return null;
  const ex = state[idx];
  const edit = (si: number, patch: Partial<SetRow>) => setState((cur) => cur.map((e, i) => (i === idx ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e)));
  const toggle = (si: number) => { const s = ex.sets[si]; edit(si, { done: !s.done }); if (!s.done) { tapHaptic(); setTick((n) => n + 1); } };
  const addSet = () => setState((cur) => cur.map((e, i) => (i === idx ? { ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] || { reps: '', kg: '0' }), done: false }] } : e)));

  const finish = async () => {
    const results = toResults(state);
    if (!results.length) return warning('Nothing ticked yet', 'Tick at least one set to save the workout.');
    setBusy(true);
    try {
      const date = today();
      const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
      const res: any = plan.template
        ? await post(`/api/templates/${plan.template._id}/log`, { date, clientId: newClientId('wk'), results: results.map((r: any) => ({ index: r.index, sets: r.sets })) })
        : await post('/api/training/workout/log', { date, clientId: newClientId('wk'), name: plan.title, exercises: results.map((r: any) => ({ activityName: r.activityName, sets: r.sets })) });
      if (plan.program) await post('/api/training/programs/done', { date, ...plan.program }).catch(() => {});
      successHaptic();
      setDone({ records: res.records || [], minutes: res.totals?.minutes ?? minutes, kcal: res.totals?.caloriesBurned ?? 0 });
      onSaved?.();
    } catch (e: any) { error('Could not save the workout', e.message); } finally { setBusy(false); }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 18, paddingTop: 48 }} keyboardShouldPersistTaps="handled">
        {done ? (
          <View style={{ alignItems: 'center' }}>
            <Buddy who={(done.records.length ? 'goku' : plan.who || 'goku') as any} scene={done.records.length ? 'powerup' : 'victory'} size={130} />
            <Text style={[S.title, { textAlign: 'center' }]}>{done.records.length ? 'Power up!' : 'Workout saved'}</Text>
            {done.records.map((r: any) => <Text key={r.activityName} style={{ color: c.primary, fontWeight: '800', marginVertical: 2 }}>{r.activityName}: {r.kind === '1rm' ? `estimated 1RM ${r.value} kg` : `heaviest set ${r.value} kg`} (was {r.previous} kg)</Text>)}
            <Text style={[S.muted, { marginVertical: 8 }]}>{done.minutes} min · {done.kcal} kcal logged</Text>
            <Button title="Done" onPress={onClose} />
          </View>
        ) : ex && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Buddy who={(plan.who || 'goku') as any} scene={plan.scene || 'lift'} size={64} />
              <View style={{ flex: 1 }}><Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>{plan.title}</Text><Text style={S.muted}>Exercise {idx + 1} of {state.length}</Text></View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close workout" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary, fontWeight: '800' }}>Close</Text></TouchableOpacity>
            </View>
            {!!plan.intro && <Text style={[S.muted, { marginTop: 8 }]}>{plan.intro}</Text>}
            <Text style={{ fontSize: 22, fontWeight: '800', color: c.ink, marginTop: 14 }}>{ex.name}</Text>
            {!!ex.hint && <Text style={{ backgroundColor: c.primarySoft, borderRadius: 12, padding: 10, marginVertical: 8, color: c.ink }}>💪 {ex.hint}</Text>}
            {ex.type === 'hold' && <Text style={S.muted}>Hold for the seconds shown. Ease off if it feels wrong.</Text>}
            {ex.sets.map((s, si) => {
              const jump = ex.type === 'hold' ? { needsConfirm: false, note: '' } : checkJump(Number(s.kg), ex.recentBestKg);
              return (
                <View key={si} style={{ marginVertical: 6, opacity: s.done ? 0.7 : 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                    <Text style={{ width: 46, fontWeight: '800', color: c.muted, paddingBottom: 12 }}>Set {si + 1}</Text>
                    <Num label={ex.type === 'hold' ? 'Seconds' : 'Reps'} value={s.reps} onChange={(v) => edit(si, { reps: v })} />
                    {ex.type !== 'hold' && <Num label="kg" value={s.kg} onChange={(v) => edit(si, { kg: v })} />}
                    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: s.done }} accessibilityLabel={`Set ${si + 1} ${s.done ? 'done' : 'not done'}`} onPress={() => toggle(si)}
                      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', backgroundColor: s.done ? c.primarySolid : c.chipBg }}>
                      <Text style={{ fontWeight: '800', color: s.done ? '#fff' : c.ink }}>{s.done ? '✓' : 'Done'}</Text>
                    </TouchableOpacity>
                  </View>
                  {jump.needsConfirm && !sure[`${idx}-${si}`] && (
                    <View style={{ backgroundColor: c.primarySoft, borderRadius: 10, padding: 10, marginTop: 6 }} accessibilityRole="alert">
                      <Text style={{ color: c.ink }}>{jump.note}</Text>
                      <TouchableOpacity onPress={() => setSure((m) => ({ ...m, [`${idx}-${si}`]: true }))} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary, fontWeight: '800' }}>Keep it</Text></TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
            <TouchableOpacity onPress={addSet} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary, fontWeight: '800' }}>+ Add set</Text></TouchableOpacity>
            <Rest autoSec={ex.restSec} tick={tick} />
            <Text style={[S.muted, { marginBottom: 12 }]}>{SAFETY_NOTE}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button title="‹ Back" disabled={idx === 0} onPress={() => setIdx(idx - 1)} /></View>
              <View style={{ flex: 2 }}>{idx < state.length - 1 ? <Button title="Next exercise ›" onPress={() => setIdx(idx + 1)} /> : <Button title={busy ? 'Saving…' : 'Finish and save'} disabled={busy} onPress={finish} />}</View>
            </View>
            {idx < state.length - 1 && <TouchableOpacity onPress={finish} disabled={busy} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.primary, fontWeight: '800' }}>Finish early</Text></TouchableOpacity>}
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

function Suggestion({ onStart, onGuided }: { onStart: (p: WorkoutPlan) => void; onGuided: (kind: string, minutes: number) => void }) {
  const { S, colors: c } = useThemedStyles();
  const [minutes, setMinutes] = useState(20);
  const [equipment, setEquipment] = useState('none');
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true; setErr('');
    get<any>(`/api/training/suggest?date=${today()}&minutes=${minutes}&equipment=${equipment}`).then((j) => live && setS(j.suggestion)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [minutes, equipment]);
  return (
    <View style={S.card}>
      <View style={S.between}><Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>Today's workout</Text>{s && <Buddy who={s.who} scene={s.scene} size={60} talk={false} />}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {[10, 20, 40].map((m) => <Chip key={m} label={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />)}
        {[['none', 'No equipment'], ['gym', 'Gym']].map(([k, l]) => <Chip key={k} label={l} active={equipment === k} onPress={() => setEquipment(k)} />)}
      </View>
      {!!err && <Text style={S.muted}>{err}</Text>}
      {s && (
        <>
          <Text style={{ fontWeight: '800', color: c.ink, marginTop: 10 }}>{s.title}</Text>
          {s.reasons.map((r: string) => <Text key={r} style={{ color: c.ink, marginTop: 2 }}>• {r}</Text>)}
          {s.items.map((i: Item) => <Text key={i.name} style={{ color: c.ink, marginTop: 6 }}><Text style={{ fontWeight: '800' }}>{i.name}</Text>  {i.sets} × {i.reps}{i.type === 'hold' ? ' s' : ''}</Text>)}
          {!!s.walkTip && <Text style={[S.muted, { marginTop: 8 }]}>🚶 {s.walkTip}</Text>}
          <View style={{ height: 12 }} />
          {s.type === 'stretch'
            ? <Button title="Start guided stretch" onPress={() => onGuided('stretch', s.guided?.minutes || 5)} />
            : <Button title="Start workout" onPress={() => onStart({ title: s.title, who: s.who, scene: s.scene, exercises: s.items, program: s.program })} />}
          <Text style={[S.muted, { marginTop: 8 }]}>You can always pick something else. {SAFETY_NOTE}</Text>
        </>
      )}
    </View>
  );
}

function PlateCalc() {
  const { S, colors: c } = useThemedStyles();
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [target, setTarget] = useState('');
  const [bar, setBar] = useState('');
  const [plates, setPlates] = useState('');
  const list = plates.split(/[ ,]+/).map(Number).filter((n) => n > 0);
  const r: any = target ? plateCalc(Number(target), { unit, barWeight: bar === '' ? undefined : Number(bar), plates: list }) : null;
  return (
    <View style={S.card}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>Plate calculator</Text>
      <View style={{ flexDirection: 'row', marginVertical: 8 }}>{(['kg', 'lb'] as const).map((u) => <Chip key={u} label={u} active={unit === u} onPress={() => setUnit(u)} />)}</View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Num label={`Target (${unit})`} value={target} onChange={setTarget} width={110} />
        <Num label={`Bar (${unit})`} value={bar} onChange={setBar} width={90} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color: c.muted, marginTop: 8 }}>Plates you have (default {DEFAULT_PLATES[unit].join(', ')}; bar {DEFAULT_BAR[unit]})</Text>
      <TextInput value={plates} onChangeText={setPlates} placeholder={DEFAULT_PLATES[unit].join(', ')} placeholderTextColor={c.muted} accessibilityLabel="Plates you have"
        style={{ minHeight: 44, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 8, color: c.ink, backgroundColor: c.card }} />
      {r && !r.error && (
        <View style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
          <Text style={{ color: c.ink, fontWeight: '800' }}>Each side: {r.perSide.length ? r.perSide.map((p: any) => `${p.count} × ${p.plate}`).join(' + ') : 'no plates'} · total {r.achieved} {unit}</Text>
          {!!r.note && <Text style={S.muted}>{r.note}</Text>}
        </View>
      )}
    </View>
  );
}

const MUSCLES: [string, string][] = [['chest', 'Chest'], ['back', 'Back'], ['shoulders', 'Shoulders'], ['arms', 'Arms'], ['core', 'Core'], ['legs', 'Legs'], ['glutes', 'Glutes']];

function Progress() {
  const { S, colors: c } = useThemedStyles();
  const [o, setO] = useState<any>(null);
  const [lift, setLift] = useState<string | null>(null);
  const [d, setD] = useState<any>(null);
  useEffect(() => { get<any>(`/api/training/overview?date=${today()}`).then(setO).catch(() => setO({ lifts: [], muscleVolume: Object.fromEntries(MUSCLES.map(([k]) => [k, { sets: 0 }])), powerLevel: 0, safety: SAFETY_NOTE })); }, []);
  useEffect(() => { if (lift) get<any>(`/api/training/progress?name=${encodeURIComponent(lift)}&date=${today()}`).then(setD).catch(() => setD(null)); else setD(null); }, [lift]);
  if (!o) return <View style={S.card}><Text style={S.muted}>Loading…</Text></View>;
  const maxSets = Math.max(1, ...MUSCLES.map(([k]) => o.muscleVolume[k]?.sets || 0));
  const stalled = o.lifts.filter((l: any) => l.deload === 'deload');
  return (
    <>
      <View style={S.card}>
        <View style={S.between}>
          <View><Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>Power level</Text><Text style={{ fontSize: 38, fontWeight: '800', color: c.primary }}>{o.powerLevel || '–'}</Text><Text style={S.muted}>Sum of your best estimated 1RMs (kg)</Text></View>
          <Buddy who="goku" scene={o.powerLevel ? 'powerup' : 'lift'} size={84} talk={false} />
        </View>
        {stalled.length > 0 && <Text style={{ backgroundColor: c.primarySoft, borderRadius: 12, padding: 10, marginTop: 10, color: c.ink }}>🌿 {stalled[0].activityName} has been level for 3 weeks. A lighter "rest arc" week (about 60% of your usual weight, half the sets) often helps. You can ignore this any time.</Text>}
        <Text style={[S.muted, { marginTop: 10 }]}>Estimated 1RM, Epley: {FORMULAS.epley}. Brzycki: {FORMULAS.brzycki} (up to 10 reps).</Text>
        {!o.lifts.length ? <BuddyEmpty scene="chart" size={84} title="No lifts yet" text="Log sets with weights and your power level appears here." /> : o.lifts.map((l: any) => (
          <View key={l.activityName} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => setLift(lift === l.activityName ? null : l.activityName)} accessibilityRole="button" accessibilityState={{ expanded: lift === l.activityName }} style={{ minHeight: 44 }}>
              <Text style={{ fontWeight: '800', color: c.ink }}>{l.activityName}</Text>
              <Text style={{ color: c.primary, fontWeight: '700' }}>Epley {l.best1RM} kg{l.best1RMBrzycki ? ` · Brzycki ${l.best1RMBrzycki} kg` : ''}</Text>
              <Text style={S.muted}>Best set {l.bestWeightKg} kg × {l.bestWeightReps} · {Math.round(l.totalVolumeKg).toLocaleString()} kg total</Text>
            </TouchableOpacity>
            {lift === l.activityName && d && (
              <View style={{ marginTop: 6 }}>
                {d.beat && <Text style={{ backgroundColor: c.primarySoft, borderRadius: 10, padding: 8, color: c.ink }}>🎯 Beat last time: {d.beat.text}</Text>}
                {!!d.deload?.text && <Text style={S.muted}>{d.deload.text}</Text>}
                {[...d.history].reverse().slice(0, 8).map((h: any) => <Text key={h.date} style={{ color: c.ink, fontSize: 13, paddingVertical: 2 }}>{h.date}: best {h.bestWeightKg} × {h.bestReps} · 1RM {h.best1RM} · volume {h.volumeKg.toLocaleString()} kg</Text>)}
              </View>
            )}
          </View>
        ))}
      </View>
      <View style={S.card}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: c.ink, marginBottom: 6 }}>This week by muscle</Text>
        {MUSCLES.map(([k, l]) => {
          const n = o.muscleVolume[k]?.sets || 0;
          return (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 5 }} accessible accessibilityLabel={`${l}: ${n} sets`}>
              <Text style={{ width: 84, color: c.ink }}>{l}</Text>
              <View style={{ flex: 1, height: 10 }}><View style={{ width: `${(n / maxSets) * 100}%`, minWidth: 2, height: 10, borderRadius: 6, backgroundColor: c.primarySolid }} /></View>
              <Text style={{ width: 64, textAlign: 'right', color: c.muted, fontSize: 12 }}>{n} sets</Text>
            </View>
          );
        })}
        <Text style={S.muted}>Last 7 days of logged sets. Exercises we cannot place on a muscle are left out.</Text>
      </View>
      <PlateCalc />
      <Text style={[S.muted, { marginBottom: 12 }]}>{o.safety}</Text>
    </>
  );
}

function Arcs({ onStart }: { onStart: (p: WorkoutPlan) => void }) {
  const { S, colors: c } = useThemedStyles();
  const { success, error } = useNotifications();
  const [programs, setPrograms] = useState<any[]>([]);
  const [active, setActive] = useState<any>(undefined);
  const [open, setOpen] = useState<any>(null);
  const load = useCallback(() => {
    get<any>('/api/training/programs').then((j) => setPrograms(j.programs)).catch(() => {});
    get<any>(`/api/training/programs/active?date=${today()}`).then((j) => setActive(j.active)).catch(() => setActive(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  const begin = async (id: string) => { try { const j: any = await post('/api/training/programs/start', { programId: id, date: today() }); setActive(j.active); success('Your arc has begun', 'Episode 1 is ready.'); } catch (e: any) { error('Could not start', e.message); } };
  const stop = () => Alert.alert('Stop this training arc?', 'Your logged workouts stay.', [{ text: 'Keep going', style: 'cancel' }, { text: 'Stop arc', style: 'destructive', onPress: async () => { await del('/api/training/programs/active').catch(() => {}); setActive(null); } }]);
  const detail = async (id: string) => { if (open?.id === id) return setOpen(null); try { setOpen((await get<any>(`/api/training/programs/${id}`)).program); } catch {} };
  const startSession = (s: any) => onStart({ title: `${s.episode}: day ${s.day}`, who: s.who, scene: s.scene, exercises: s.exercises, program: { week: s.week, day: s.day }, intro: s.rest ? 'Rest arc: lighter on purpose. Move well and enjoy it.' : undefined });
  return (
    <>
      {active && (
        <View style={S.card}>
          <View style={S.between}>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>{active.title}</Text><Text style={S.muted}>{active.finished ? 'Arc complete. Well done.' : active.notStarted ? 'Starts soon' : `Week ${active.week} of ${active.weeksCount} · ${active.episode}`}</Text></View>
            <Buddy who={(active.rest ? 'kakashi' : 'goku') as any} scene={active.rest ? 'health' : 'lift'} size={72} talk={false} />
          </View>
          {!active.finished && <Text style={{ color: c.ink, marginTop: 8 }}>🚶 Step goal this week: <Text style={{ fontWeight: '800' }}>{active.stepGoal.toLocaleString()}</Text>  <Text style={S.muted}>(+500 a week from {active.baseSteps.toLocaleString()}, never above your profile goal of {active.stepCap.toLocaleString()})</Text></Text>}
          {active.rest && <Text style={{ backgroundColor: c.primarySoft, borderRadius: 12, padding: 10, marginTop: 8, color: c.ink }}>🌿 Rest arc: lighter sessions on purpose, so you come back stronger.</Text>}
          {active.next ? <View style={{ marginTop: 10 }}><Button title={`Start episode ${active.week}, day ${active.next.day}`} onPress={() => startSession(active.next)} /></View>
            : !active.finished && <Text style={[S.muted, { marginTop: 8 }]}>All sessions for this week are done. Next episode begins on day {active.week * 7 + 1}.</Text>}
          {active.sessions.map((s: any) => <Text key={s.day} style={{ color: c.ink, paddingVertical: 3 }}>{active.done.some((d: any) => d.week === active.week && d.day === s.day) ? '✅' : '⬜'} Day {s.day}: {s.exercises.map((e: Item) => e.name).join(', ')}</Text>)}
          <TouchableOpacity onPress={stop} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={S.delete}>Stop this arc</Text></TouchableOpacity>
        </View>
      )}
      <View style={S.card}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>Beginner training arcs</Text>
        <Text style={[S.muted, { marginBottom: 6 }]}>Gradual weekly "episodes", three short sessions a week. {SAFETY_NOTE}</Text>
        {programs.map((p) => (
          <View key={p.id} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 10 }}>
            <Text style={{ fontWeight: '800', color: c.ink }}>{p.title}</Text>
            <Text style={S.muted}>{p.weeksCount} weeks · {p.equipment === 'none' ? 'no equipment' : 'basic gym'} · {p.summary}</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 6, alignItems: 'center' }}>
              <TouchableOpacity disabled={active?.programId === p.id && !active.finished} onPress={() => begin(p.id)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: active?.programId === p.id && !active.finished ? c.muted : c.primary, fontWeight: '800' }}>{active?.programId === p.id && !active.finished ? 'In progress' : 'Begin arc'}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => detail(p.id)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary, fontWeight: '700' }}>{open?.id === p.id ? 'Hide episodes' : 'See episodes'}</Text></TouchableOpacity>
            </View>
            {open?.id === p.id && open.weeks.map((w: any) => <Text key={w.week} style={{ color: c.ink, marginTop: 4 }}><Text style={{ fontWeight: '800' }}>Episode {w.week}: {w.episode}{w.rest ? ' 🌿' : ''}</Text>{'\n'}<Text style={S.muted}>{w.sessions[0].exercises.map((e: Item) => `${e.name} ${e.sets}×${e.reps}`).join(', ')}</Text></Text>)}
          </View>
        ))}
      </View>
    </>
  );
}

/** Guided meditate / stretch: breathing circle led by a calm character, text cues, gentle haptics, logged as an activity. No audio files. */
export function Guided({ kind: k0, minutes: m0, onLogged }: { kind?: string; minutes?: number; onLogged?: () => void }) {
  const { S, colors: c } = useThemedStyles();
  const { success, error } = useNotifications();
  const [kind, setKind] = useState(k0 || 'meditate');
  const [minutes, setMinutes] = useState(m0 || 5);
  const [session, setSession] = useState<any>(null);
  const [sec, setSec] = useState(0);
  const [run, setRun] = useState(false);
  const [saved, setSaved] = useState(false);
  const scale = useRef(new Animated.Value(0.8)).current;
  const lastPhase = useRef('');

  const load = useCallback(() => get<any>(`/api/training/guided?kind=${kind}&minutes=${minutes}`).then((j) => { setSession(j.session); setSec(0); setRun(false); setSaved(false); }).catch((e) => error('Could not load the session', e.message)), [kind, minutes]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!run) return; const id = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(id); }, [run]);
  const bp = breathPhase(sec);
  const total = session?.totalSec || 0;
  const finished = !!session && sec >= total;
  useEffect(() => { if (finished && run) setRun(false); }, [finished, run]);
  useEffect(() => { // the circle grows on the in-breath and shrinks on the out-breath; a light tap marks each change
    if (!run) return;
    if (lastPhase.current !== bp.phase) { lastPhase.current = bp.phase; if (bp.phase === 'inhale' || bp.phase === 'exhale') tapHaptic(); }
    Animated.timing(scale, { toValue: bp.phase === 'inhale' ? 1 : bp.phase === 'exhale' ? 0.55 : bp.phase === 'hold' ? 1 : 0.55, duration: (bp.phase === 'inhale' ? 4 : bp.phase === 'exhale' ? 6 : 1) * 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start();
  }, [bp.phase, run]);

  const cue = session ? cueAt(session.cues, sec) : null;
  const save = async () => {
    try { await post('/api/training/guided/log', { kind, minutes, date: today(), clientId: newClientId('gd') }); setSaved(true); successHaptic(); success('Session logged', 'Calm done.'); onLogged?.(); } catch (e: any) { error('Could not log the session', e.message); }
  };
  return (
    <View style={S.card}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>{kind === 'meditate' ? 'Guided meditation' : 'Guided stretch'}</Text>
      {!run && sec === 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {[['meditate', 'Meditate'], ['stretch', 'Stretch']].map(([k, l]) => <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}
          {[3, 5, 7, 10].map((m) => <Chip key={m} label={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />)}
        </View>
      )}
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Animated.View style={{ width: 190, height: 190, borderRadius: 95, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Buddy who={(session?.who || 'kakashi') as any} scene={session?.scene || 'health'} size={96} talk={false} />
        </Animated.View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.ink, marginTop: 12 }} accessibilityLiveRegion="polite">{finished ? 'All done. Lovely.' : run ? ({ inhale: 'Breathe in', hold: 'Hold gently', exhale: 'Breathe out', rest: 'Rest' } as any)[bp.phase] : 'Ready when you are'}</Text>
      </View>
      {!!cue && <Text style={{ textAlign: 'center', color: c.ink, minHeight: 48 }}>{cue.title ? <Text style={{ fontWeight: '800' }}>{cue.title}. </Text> : null}{cue.text}</Text>}
      <Text style={[S.muted, { textAlign: 'center', marginVertical: 6 }]}>{clock(Math.max(0, total - sec))} left</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {!finished && <View style={{ flex: 1 }}><Button title={run ? 'Pause' : sec ? 'Resume' : 'Begin'} onPress={() => setRun(!run)} /></View>}
        {(finished || sec >= 60) && !saved && <View style={{ flex: 1 }}><Button title="Log session" onPress={save} /></View>}
      </View>
      {sec > 0 && <TouchableOpacity onPress={load} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.primary, fontWeight: '800' }}>Restart</Text></TouchableOpacity>}
      <Text style={S.muted}>{session?.note}</Text>
    </View>
  );
}

type Tab = 'today' | 'progress' | 'arcs' | 'calm';
export default function Training({ onLogged }: { onLogged?: () => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [guided, setGuided] = useState<{ kind: string; minutes: number } | null>(null);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {([['today', 'Today'], ['progress', 'Progress'], ['arcs', 'Training arcs'], ['calm', 'Calm']] as [Tab, string][]).map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}
      </ScrollView>
      {tab === 'today' && <Suggestion onStart={setPlan} onGuided={(kind, minutes) => { setGuided({ kind, minutes }); setTab('calm'); }} />}
      {tab === 'progress' && <Progress />}
      {tab === 'arcs' && <Arcs onStart={setPlan} />}
      {tab === 'calm' && <Guided key={guided ? `${guided.kind}${guided.minutes}` : 'free'} kind={guided?.kind} minutes={guided?.minutes} onLogged={onLogged} />}
      <WorkoutMode plan={plan} onClose={() => setPlan(null)} onSaved={onLogged} />
    </View>
  );
}
