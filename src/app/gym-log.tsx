// Gym log: log exercises (sets x reps x weight), body weight and tape measurements, set a body goal and watch the progress.
// The log is stored on this phone (utils/gymStore.ts). Only each exercise (name, sets, minutes, estimated kcal) is also sent, by utils/gymSyncRunner.ts, so Exercise and Home count the calories; other data leaves only through the
// Export tab, which makes CSV / JSON files you save or share yourself.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProfile } from '../hooks/useProfile';
import { Text, TextInput, TouchableOpacity, View, LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G as SvgG, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Button, Field, Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { useNotifications } from '../components/Notifications';
import { exerciseList } from '../data/workoutPlan';
import { GYM_CATS, mergeCatalog } from '../utils/gymCatalog';
import { formatDateLocal, prettyDate } from '../utils/dates';
import { fmtWeight, parseWeightInput, weightValue } from '../utils/units';
import { useWorkoutStore } from '../utils/workoutStore';
import { isComplete, nextStep, progress, stepsFor } from '../utils/planStart';
import { endPlannedStart, skipPlannedStep, usePlannedStart } from '../utils/plannedStart';
import { write } from '../utils/offline';
import { refreshWorkoutReminders } from '../utils/notifications';
import * as G from '../utils/gymMath';
import { refreshRecordSync, setRecordSync, syncRecordsNow, useRecordSyncStatus } from '../utils/gymRecordRunner';
import { clearGym, gymId, removeBody, removeEntry, replaceGym, saveBody, saveEntry, saveGoal, saveProfile, useGymStore } from '../utils/gymStore';
import { backupJson, bodyCsv, parseBackup, workoutsCsv } from '../utils/gymExport';
import { shareGymFile } from '../utils/gymShare';
import { Image } from 'react-native';
import { photoFor } from '../data/exerciseImages';

type Tab = 'log' | 'body' | 'progress' | 'export';
const todayStr = () => formatDateLocal(new Date());
const CATS = [...GYM_CATS]; // the exercise list shows only when you search or tap a muscle group
const unitWord = (u: G.GymUnit) => (u === 'sec' ? 'Seconds' : u === 'min' ? 'Minutes' : 'Reps');
const num2s = (n: number) => String(Math.round(n * 100) / 100);

// ------------------------------------------------------------------------------------------------ small shared pieces (module level so typing never remounts them)
function Card({ children, title, sub, right }: { children?: any; title?: string; sub?: string; right?: any }) {
  const { S, colors } = useThemedStyles();
  return (
    <View style={S.card}>
      {!!title && (
        <View style={[S.between, { marginBottom: sub ? 2 : 10 }]}>
          <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16, flex: 1 }}>{title}</Text>{right}
        </View>
      )}
      {!!sub && <Text style={[S.muted, { marginBottom: 10 }]}>{sub}</Text>}
      {children}
    </View>
  );
}
function SmallBtn({ label, onPress, icon, danger, disabled }: { label?: string; onPress: () => void; icon?: any; danger?: boolean; disabled?: boolean }) {
  const { colors } = useThemedStyles();
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label || icon} disabled={disabled} activeOpacity={0.8} onPress={onPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: danger ? colors.dangerSoft : colors.primarySoft, opacity: disabled ? 0.45 : 1 }}>
      {!!icon && <Ionicons name={icon} size={16} color={danger ? colors.dangerInk : colors.primary} />}
      {!!label && <Text style={{ fontWeight: '800', fontSize: 13, color: danger ? colors.dangerInk : colors.primary }}>{label}</Text>}
    </TouchableOpacity>
  );
}
function DateBar({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const { colors } = useThemedStyles();
  const t = todayStr();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <SmallBtn icon="chevron-back" onPress={() => onChange(G.shiftDate(date, -1))} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Jump to today" onPress={() => onChange(t)}>
        <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16, textAlign: 'center' }}>{date === t ? 'Today' : prettyDate(date)}</Text>
        {date !== t && <Text style={{ color: colors.primary, fontSize: 12, textAlign: 'center', fontWeight: '700' }}>Tap for today</Text>}
      </TouchableOpacity>
      <SmallBtn icon="chevron-forward" disabled={date >= t} onPress={() => onChange(G.shiftDate(date, 1))} />
    </View>
  );
}
function Stat({ l, v, sub }: { l: string; v: string; sub?: string }) {
  const { S, colors } = useThemedStyles();
  return (
    <View style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginBottom: 8 }}>
      <Text style={S.muted}>{l}</Text>
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 17 }}>{v}</Text>
      {!!sub && <Text style={[S.muted, { marginTop: 1 }]}>{sub}</Text>}
    </View>
  );
}
function Bar({ pct, color }: { pct: number; color?: string }) {
  const { colors } = useThemedStyles();
  return (
    <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.chipBg, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', borderRadius: 6, backgroundColor: color || colors.primary }} />
    </View>
  );
}
function NumInput({ value, onChange, placeholder, width, label, kb }: { value: string; onChange: (s: string) => void; placeholder?: string; width?: number; label: string; kb?: 'decimal-pad' | 'numbers-and-punctuation' }) {
  const { colors } = useThemedStyles();
  return (
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={kb || 'decimal-pad'} selectTextOnFocus
      style={{ width: width || 76, minHeight: 46, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.ink, backgroundColor: colors.card }} />
  );
}

/** Exercise picture (the real photo when the app has one, else a muscle-group icon). */
function Thumb({ name, cat, size = 48 }: { name: string; cat?: string; size?: number }) {
  const { colors } = useThemedStyles();
  const photo: any = photoFor(name);
  const icon = ({ chest: '🫁', back: '🦍', shoulders: '🏐', arms: '💪', legs: '🦵', glutes: '🍑', core: '🎯', cardio: '🏃', 'full body': '⚡' } as Record<string, string>)[String(cat || '').toLowerCase()] || '🏋️';
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: photo ? '#fff' : colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
      {photo && photo.thumb ? <Image source={photo.thumb} accessibilityLabel={name} style={{ width: size, height: size }} resizeMode="contain" /> : <Text style={{ fontSize: size * 0.46 }}>{icon}</Text>}
    </View>
  );
}
/** A number with big − and + buttons around it. */
function Stepper({ value, onChange, onBump, label, placeholder, kb }: { value: string; onChange: (s: string) => void; onBump: (dir: number) => void; label: string; placeholder?: string; kb?: 'decimal-pad' | 'numbers-and-punctuation' }) {
  const { colors } = useThemedStyles();
  const btn = { width: 44, height: 48, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: less`} style={btn} onPress={() => onBump(-1)}><Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>−</Text></TouchableOpacity>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder || '0'} placeholderTextColor={colors.muted} keyboardType={kb || 'decimal-pad'} selectTextOnFocus
        style={{ flex: 1, minWidth: 54, height: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink, backgroundColor: colors.card }} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: more`} style={btn} onPress={() => onBump(1)}><Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>＋</Text></TouchableOpacity>
    </View>
  );
}
/** "bench press 3x10 60", "squat 4 x 8 @ 80kg", "plank 3x40s" -> a ready set list, or null. */
function parseQuick(text: string) {
  const m = String(text || '').trim().match(/^(.{2,}?)\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})\s*(s|sec|secs|min)?(?:\s*(?:@|at|with)?\s*(\d+(?:\.\d+)?)\s*(kg|lb|lbs)?)?$/i);
  if (!m) return null;
  return { name: m[1].trim(), sets: Math.min(12, Math.max(1, parseInt(m[2], 10))), reps: parseInt(m[3], 10), timed: m[4] ? (/^m/i.test(m[4]) ? 'min' : 'sec') as G.GymUnit : null, kg: m[5] ? parseFloat(m[5]) : 0, lb: /lb/i.test(m[6] || '') };
}
/** Seven day pills ending today (or around an older chosen day), with a dot on the days you trained. */
function WeekStrip({ date, onChange, trained }: { date: string; onChange: (d: string) => void; trained: Set<string> }) {
  const { colors } = useThemedStyles();
  const t = todayStr();
  const after = G.shiftDate(date, 3);
  const end = date >= G.shiftDate(t, -6) ? t : after > t ? t : after;
  const days = Array.from({ length: 7 }, (_, i) => G.shiftDate(end, i - 6));
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
      {days.map((d) => {
        const on = d === date, dt = new Date(`${d}T00:00:00`);
        return (
          <TouchableOpacity key={d} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={prettyDate(d)} onPress={() => onChange(d)}
            style={{ flex: 1, minHeight: 62, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.chipBg, borderWidth: 1.5, borderColor: d === t && !on ? colors.border : 'transparent' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#ffffffd9' : colors.muted }}>{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: on ? '#fff' : colors.ink }}>{dt.getDate()}</Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: trained.has(d) ? (on ? '#fff' : colors.success || colors.primary) : 'transparent' }} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Line chart: dots for each reading, an optional smoothed line, an optional dashed goal line. Pure SVG, no data leaves the phone. */
function LineChart({ raw, trend, goal, fmt, color }: { raw: G.Pt[]; trend?: G.Pt[]; goal?: number; fmt: (n: number) => string; color?: string }) {
  const { colors } = useThemedStyles();
  const [w, setW] = useState(320);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.max(200, Math.round(e.nativeEvent.layout.width)));
  const h = 170, padL = 44, padR = 10, padT = 10, padB = 22;
  if (raw.length < 1) return null;
  const c = color || colors.primary;
  const xs = raw.map((p) => G.dayNum(p.date)), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const vals = [...raw.map((p) => p.value), ...(trend || []).map((p) => p.value), ...(goal ? [goal] : [])];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || Math.max(1, hi * 0.05)) * 0.12; lo -= pad; hi += pad;
  const X = (d: string) => padL + (x1 === x0 ? (w - padL - padR) / 2 : ((G.dayNum(d) - x0) / (x1 - x0)) * (w - padL - padR));
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const grid = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  return (
    <View onLayout={onLayout} accessible accessibilityLabel={`Chart of ${raw.length} readings, latest ${fmt(raw[raw.length - 1].value)}`}>
      <Svg width={w} height={h}>
        {grid.map((g, i) => (
          <SvgG key={i}>
            <Line x1={padL} x2={w - padR} y1={Y(g)} y2={Y(g)} stroke={colors.border} strokeWidth={1} />
            <SvgText x={padL - 6} y={Y(g) + 4} fontSize={10} fill={colors.muted} textAnchor="end">{fmt(g)}</SvgText>
          </SvgG>
        ))}
        {!!goal && <Line x1={padL} x2={w - padR} y1={Y(goal)} y2={Y(goal)} stroke={colors.success} strokeWidth={2} strokeDasharray="6 5" />}
        {!!trend && trend.length > 1 && <Polyline points={trend.map((p) => `${X(p.date)},${Y(p.value)}`).join(' ')} fill="none" stroke={c} strokeWidth={2.5} strokeLinejoin="round" />}
        {!trend && raw.length > 1 && <Polyline points={raw.map((p) => `${X(p.date)},${Y(p.value)}`).join(' ')} fill="none" stroke={c} strokeWidth={2.5} strokeLinejoin="round" />}
        {raw.map((p, i) => <Circle key={i} cx={X(p.date)} cy={Y(p.value)} r={trend ? 3 : 4} fill={trend ? colors.muted : c} opacity={trend ? 0.55 : 1} />)}
        <SvgText x={padL} y={h - 5} fontSize={10} fill={colors.muted} textAnchor="start">{prettyDate(raw[0].date)}</SvgText>
        <SvgText x={w - padR} y={h - 5} fontSize={10} fill={colors.muted} textAnchor="end">{prettyDate(raw[raw.length - 1].date)}</SvgText>
      </Svg>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ screen
export default function GymLogScreen() {
  const { S, colors } = useThemedStyles();
  const gym = useGymStore();
  const [tab, setTab] = useState<Tab>('log');
  const TABS: [Tab, string, string][] = [['log', 'barbell', 'Log'], ['body', 'body', 'Body'], ['progress', 'trending-up', 'Progress'], ['export', 'download', 'Export']];
  return (
    <Screen>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/workout'))}>
        <Text style={S.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={S.title}>Gym log</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 14 }}>
        <Ionicons name="lock-closed" size={14} color={colors.success} />
        <Text style={[S.muted, { flex: 1 }]}>Body measurements and goals stay on this phone unless you turn on sync (Export tab). Each exercise you log (name, sets, minutes, calories) is also sent so Exercise and Home can count it.</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {TABS.map(([k, , label]) => <Chip key={k} label={label} active={tab === k} onPress={() => setTab(k)} />)}
      </View>
      <View style={{ height: 6 }} />
      {!gym.ready ? <Text style={S.muted}>Loading…</Text> : (
        tab === 'log' ? <LogTab /> : tab === 'body' ? <BodyTab /> : tab === 'progress' ? <ProgressTab /> : <ExportTab />
      )}
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------------ LOG
type Draft = { kg: string; reps: string; pace?: string; incline?: string }[];
type Picked = { id: string; name: string; cat: string; unit: G.GymUnit; custom?: boolean };

export function LogTab() {
  const { S, colors } = useThemedStyles();
  const { entries, body, profile } = useGymStore();
  const prof = useProfile().profile;
  useEffect(() => { G.setDefaultBodyKg(prof?.currentWeightKg); }, [prof?.currentWeightKg]); // calories here use your profile weight until you log one in Body
  const wk = useWorkoutStore();
  const { success, error, confirm } = useNotifications();
  const unit = profile.unit;
  const [date, setDate] = useState(todayStr());
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [more, setMore] = useState(false);
  const [pick, setPick] = useState<Picked | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [draft, setDraft] = useState<Draft>([]);
  const [note, setNote] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [customUnit, setCustomUnit] = useState<G.GymUnit>('reps');

  // The app's own library first (it has photos), then the wider catalogue of common gym lifts, with no name listed twice.
  const all = useMemo(() => mergeCatalog(exerciseList()).map((e: any) => ({ id: e.id, name: e.name, cat: e.cat, gear: e.gear, unit: (e.unit || (String(e.cat).toLowerCase() === 'cardio' ? 'min' : 'reps')) as G.GymUnit, muscle: (e.muscles && e.muscles[0]) || '' })), []);
  const used = useMemo(() => G.exercisesUsed(entries), [entries]);
  const kgStr = (kg: number) => (kg > 0 ? num2s(weightValue(kg, unit)) : '');
  const fmtKg = useCallback((kg: number) => fmtWeight(kg, unit), [unit]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const favs = new Set(wk.favs);
    const usedIds = new Map(used.map((u, i) => [u.exId, i]));
    const quickName = parseQuick(q)?.name.toLowerCase();
    const words = (quickName || s).split(/\s+/).filter(Boolean);
    if (!words.length && !cat) return []; // the list shows only when you search or tap a muscle group
    return all
      .filter((e) => (!cat || e.cat === cat) && words.every((w) => `${e.name} ${e.muscle} ${e.gear}`.toLowerCase().includes(w)))
      .sort((a, b) => {
        const ra = usedIds.has(a.id) ? usedIds.get(a.id)! : 999, rb = usedIds.has(b.id) ? usedIds.get(b.id)! : 999;
        if (ra !== rb) return ra - rb;
        const fa = favs.has(a.id) ? 0 : 1, fb = favs.has(b.id) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ga = GYM_CATS.indexOf(a.cat), gb = GYM_CATS.indexOf(b.cat); // muscle-group order, then A-Z
        return ga !== gb ? (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb) : a.name.localeCompare(b.name);
      });
  }, [all, q, cat, used, wk.favs]);
  const exact = list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  const choose = (p: Picked) => {
    const last = G.lastFor(entries, p.id, date);
    const rows: Draft = last ? last.sets.map((s) => ({ kg: kgStr(s.kg), reps: String(s.reps), pace: s.pace ? G.fmtPace(s.pace) : '', incline: s.incline ? String(s.incline) : '' })) : p.unit === 'min' ? [{ kg: '', reps: '', pace: '', incline: '' }] : [{ kg: '', reps: '' }, { kg: '', reps: '' }, { kg: '', reps: '' }];
    setPick(p); setDraft(rows); setNote(''); setShowNote(false); setEditId(null); setQ(''); setCat(''); setMore(false);
  };
  const fromEx = (e: { id: string; name: string; cat: string; unit: G.GymUnit }): Picked => ({ id: e.id, name: e.name, cat: e.cat, unit: e.unit });
  const edit = (e: G.GymEntry) => {
    setPick({ id: e.exId, name: e.name, cat: e.cat, unit: e.unit });
    setDraft(e.sets.map((s) => ({ kg: kgStr(s.kg), reps: String(s.reps), pace: s.pace ? G.fmtPace(s.pace) : '', incline: s.incline ? String(s.incline) : '' })));
    setNote(e.note || ''); setShowNote(!!e.note); setEditId(e.id);
  };
  const cancel = () => { setPick(null); setDraft([]); setNote(''); setEditId(null); };

  const setRow = (i: number, patch: Partial<{ kg: string; reps: string; pace: string; incline: string }>) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const timed = pick ? G.isTimed(pick.unit) : false;
  const last = pick ? G.lastFor(entries, pick.id, date, editId || undefined) : null;

  const save = async () => {
    if (!pick) return;
    const sets: G.GymSet[] = [];
    for (const r of draft) {
      const reps = G.parseNum(r.reps, 1, 5000);
      if (!reps) continue;
      const kg = timed || !r.kg.trim() ? 0 : parseWeightInput(r.kg, unit);
      if (kg === null) { error('Check the weight', 'A weight must be a number, or leave it blank for bodyweight.'); return; }
      const set: G.GymSet = { kg, reps: Math.round(reps * 10) / 10 };
      if (pick.unit === 'min' && (r.pace || '').trim()) {
        const pace = G.parsePace(r.pace);
        if (pace === null) { error('Check the pace', 'Type the average pace per km like 6:30 (6 min 30 s). It must be between 2:00 and 30:00.'); return; }
        set.pace = pace;
        if ((r.incline || '').trim()) {
          const inc = G.parseNum(r.incline, 0, 40);
          if (inc === null) { error('Check the incline', 'Incline is a percent between 0 and 40, like 3. Leave it blank for flat.'); return; }
          if (inc > 0) set.incline = Math.round(inc * 10) / 10;
        }
      }
      sets.push(set);
    }
    if (!sets.length) { error('Nothing to save', `Fill in at least one set with ${pick.unit === 'reps' ? 'reps' : pick.unit === 'sec' ? 'seconds' : 'minutes'}.`); return; }
    const entry: G.GymEntry = { id: editId || gymId('e'), date, exId: pick.id, name: pick.name, cat: pick.cat, unit: pick.unit, sets, note: note.trim() || undefined, at: editId ? (entries.find((x) => x.id === editId)?.at || Date.now()) : Date.now() };
    const prs = editId ? [] : G.detectPRs(entries, entry);
    await saveEntry(entry);
    const pr = prs[0];
    success(editId ? 'Updated' : 'Saved', pr
      ? `New record: ${pr.kind === 'weight' ? `${fmtKg(pr.value)} (was ${fmtKg(pr.prev)})` : pr.kind === 'e1rm' ? `est. 1RM ${fmtKg(pr.value)}` : `${pr.value} ${pick.unit === 'reps' ? 'reps' : pick.unit}`} on ${pick.name}.`
      : `${pick.name}: ${G.setsLine(entry, fmtKg)}`);
    cancel();
  };
  const del = async (e: G.GymEntry) => {
    const ok = await confirm({ title: 'Delete this exercise?', message: `${e.name} – ${G.setsLine(e, fmtKg)}`, confirmText: 'Delete', destructive: true });
    if (ok) await removeEntry(e.id);
  };

  const dayList = entries.filter((e) => e.date === date).sort((a, b) => a.at - b.at);

  // ---- a planned workout started from the planner: its exercises, one after another, each opened with the planned sets / reps / weight filled in
  const plan = usePlannedStart();
  const planOn = !!plan && date === todayStr();                // the steps are about today's log
  const steps = useMemo(() => (planOn && plan ? stepsFor(plan.item.exercises, all, entries.filter((e) => e.date === date).map((e) => ({ exId: e.exId }))) : []), [planOn, plan, all, entries, date]);
  const planNext = planOn && plan ? nextStep(steps, plan.skipped) : null;
  const planDone = planOn && plan ? isComplete(steps, plan.skipped) : false;
  const finishPlan = async () => {
    if (!plan) return;
    const { id, title } = plan.item;
    endPlannedStart();
    try {
      const r: any = await write('PATCH', `/api/workout-plan/${id}`, { status: 'done' }, 'Mark workout done');   // queued when there is no signal
      success(r.queued ? 'Saved offline' : 'Workout done', r.queued ? `${title} will be marked done when you are back online.` : `${title} is done in your plan.`);
      void refreshWorkoutReminders({ doneIds: [id] });   // also when queued: the server does not know yet, this phone does
    } catch { error('Could not mark it done', 'Your sets are logged. Open the planner to mark the workout done.'); }
  };
  const openStep = (st: any) => {
    const found = all.find((e) => e.id === st.exId);
    setPick(found ? { id: found.id, name: found.name, cat: found.cat, unit: found.unit } : { id: st.exId, name: st.name, cat: st.cat, unit: st.unit });
    const n = st.unit === 'min' ? 1 : st.sets;                  // a run is one block of minutes, not several sets
    setDraft(Array.from({ length: n }, () => ({ kg: st.unit === 'reps' ? kgStr(st.kg) : '', reps: String(st.reps), pace: '', incline: '' })));
    setNote(''); setShowNote(false); setEditId(null); setQ(''); setCat(''); setMore(false);
  };
  const bwOf = useMemo(() => G.bodyKgFn(body), [body, prof?.currentWeightKg]); // a blank weight = body weight: the weight you logged on or before that day
  const ds = G.dayStats(entries, date, bwOf);
  const wKnown = G.bodyKgOn(body, date);
  const bodyKg = wKnown || G.DEFAULT_BODY_KG;
  const dayKcal = dayList.reduce((n, e) => n + G.entryKcal(e, bodyKg), 0);
  // Calories for the sets being typed right now (updates as you fill them in).
  const draftEntry = (): G.GymEntry => ({
    id: 'x', date, exId: pick!.id, name: pick!.name, cat: pick!.cat, unit: pick!.unit, at: 0,
    sets: draft.map((r) => ({ kg: timed || !r.kg.trim() ? 0 : parseWeightInput(r.kg, unit) || 0, reps: G.parseNum(r.reps, 1, 5000) || 0, ...(pick!.unit === 'min' && G.parsePace(r.pace) ? { pace: G.parsePace(r.pace)!, ...(G.parseNum(r.incline, 0.1, 40) ? { incline: G.parseNum(r.incline, 0.1, 40)! } : {}) } : {}) })).filter((x) => x.reps > 0),
  });
  const draftKcal = (() => { if (!pick) return 0; return G.entryKcal(draftEntry(), bodyKg); })();
  const draftKm = pick && pick.unit === 'min' ? G.entryKm(draftEntry()) : 0;
  const isRun = pick?.unit === 'min';

  const bump = (i: number, field: 'kg' | 'reps', dir: number) => {
    const cur = parseFloat(String(draft[i][field] || '').replace(',', '.')) || 0;
    const step = field === 'kg' ? (unit === 'lb' ? 5 : 2.5) : pick?.unit === 'sec' ? 5 : 1;
    const nx = Math.max(0, Math.round((cur + dir * step) * 100) / 100);
    setRow(i, { [field]: nx ? String(nx) : '' } as any);
  };
  const trained = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);
  const dayMin = Math.round(dayList.reduce((n, e) => n + G.entryMinutes(e), 0));
  const draftVol = pick && !timed ? G.entryVolume(draftEntry(), bodyKg) : 0;
  const draftHasBw = pick && !timed ? draftEntry().sets.some((s) => !(s.kg > 0)) : false;
  const draftSetCount = pick ? draftEntry().sets.length : 0;

  // ---- the log sheet
  if (pick) {
    return (
      <View style={S.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Thumb name={pick.name} cat={pick.cat} size={60} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 18 }}>{pick.name}</Text>
            <Text style={S.muted}>{pick.cat}{editId ? ' · editing' : ''} · {date === todayStr() ? 'Today' : prettyDate(date)}</Text>
          </View>
          <SmallBtn icon="close" onPress={cancel} />
        </View>
        {!!last && !editId && (
          <TouchableOpacity accessibilityRole="button" onPress={() => setDraft(last.sets.map((s2) => ({ kg: kgStr(s2.kg), reps: String(s2.reps), pace: s2.pace ? G.fmtPace(s2.pace) : '' })))}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <Text style={[S.muted, { flex: 1 }]}>Last time · {G.setsLine(last, fmtKg)}</Text>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>Use these</Text>
          </TouchableOpacity>
        )}
        {draft.map((r, i) => (
          <View key={i} style={{ backgroundColor: colors.chipBg, borderRadius: 16, padding: 10, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>Set {i + 1}</Text>
              <SmallBtn icon="close" danger disabled={draft.length < 2} onPress={() => setDraft((d) => (d.length > 1 ? d.filter((_, j) => j !== i) : d))} />
            </View>
            {!timed && (<View style={{ marginBottom: 8 }}><Text style={[S.muted, { fontWeight: '800', marginBottom: 3 }]}>{unit.toUpperCase()} <Text style={{ fontWeight: '600' }}>· empty = body weight</Text></Text><Stepper label={`Set ${i + 1} weight`} value={r.kg} placeholder="BW" onChange={(t) => setRow(i, { kg: t })} onBump={(d) => bump(i, 'kg', d)} /></View>)}
            <Text style={[S.muted, { fontWeight: '800', marginBottom: 3 }]}>{pick.unit === 'reps' ? 'REPS' : pick.unit === 'sec' ? 'SECONDS' : 'MINUTES'}</Text>
            <Stepper label={`Set ${i + 1} ${unitWord(pick.unit)}`} value={r.reps} onChange={(t) => setRow(i, { reps: t })} onBump={(d) => bump(i, 'reps', d)} />
            {isRun && (<View style={{ marginTop: 8 }}><Text style={[S.muted, { fontWeight: '800', marginBottom: 3 }]}>AVERAGE PACE PER KM</Text><NumInput label={`Set ${i + 1} average pace per km`} value={r.pace || ''} onChange={(t) => setRow(i, { pace: t })} placeholder="6:30" kb="numbers-and-punctuation" width={110} /><Text style={[S.muted, { fontWeight: '800', marginTop: 8, marginBottom: 3 }]}>INCLINE % (OPTIONAL)</Text><NumInput label={`Set ${i + 1} treadmill incline percent`} value={r.incline || ''} onChange={(t) => setRow(i, { incline: t })} placeholder="0" kb="decimal-pad" width={110} /></View>)}
          </View>
        ))}
        <TouchableOpacity accessibilityRole="button" onPress={() => setDraft((d) => [...d, d.length ? { ...d[d.length - 1] } : { kg: '', reps: '', pace: '', incline: '' }])}
          style={{ minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>＋ Add set <Text style={{ color: colors.muted, fontWeight: '600' }}>(copies the last one)</Text></Text>
        </TouchableOpacity>
        {isRun && <Text style={[S.muted, { marginBottom: 6 }]}>Treadmill: enter minutes and average pace per km, like 6:30. Add the incline % if you use one. Calories come from your speed and incline.{draftKm > 0 ? ` About ${draftKm} km.` : ''}</Text>}
        {showNote ? <Field label="Note" value={note} onChangeText={setNote} placeholder="Felt strong, slow tempo…" /> : <SmallBtn icon="add" label="Add a note" onPress={() => setShowNote(true)} />}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginVertical: 12 }}>
          <Text style={{ color: colors.ink }}><Text style={{ fontWeight: '800' }}>{draftSetCount}</Text> set{draftSetCount === 1 ? '' : 's'}</Text>
          {draftVol > 0 && <Text style={{ color: colors.ink }}><Text style={{ fontWeight: '800' }}>{fmtWeight(draftVol, unit)}</Text> lifted</Text>}
          <Text style={{ color: colors.ink }}><Text style={{ fontWeight: '800' }}>≈ {draftKcal}</Text> kcal</Text>
        </View>
        {draftHasBw && draftVol > 0 && <Text style={[S.muted, { marginBottom: 8 }]}>Sets with no weight count as body weight ({fmtWeight(bodyKg, unit)}{wKnown ? '' : ', your profile weight'}), so they add to what you lifted.</Text>}
        {!wKnown && draftKcal > 0 && <Text style={[S.muted, { marginBottom: 8 }]}>Calories assume {G.DEFAULT_BODY_KG} kg. Log your weight in Body for a closer number.</Text>}
        <Button title={editId ? 'Save changes' : 'Save exercise'} onPress={save} />
      </View>
    );
  }

  // ---- picker + day list
  const quick = parseQuick(q);
  const quickMatch = quick ? list[0] : null;
  const logQuick = async (e: { id: string; name: string; cat: string; unit: G.GymUnit }) => {
    if (!quick) return;
    const u = quick.timed || e.unit;
    const kg = u === 'reps' && quick.kg ? (parseWeightInput(String(quick.kg), quick.lb ? 'lb' : unit) || 0) : 0;
    const entry: G.GymEntry = { id: gymId('e'), date, exId: e.id, name: e.name, cat: e.cat, unit: u, sets: Array.from({ length: quick.sets }, () => ({ kg, reps: quick.reps })), at: Date.now() };
    const pr = G.detectPRs(entries, entry)[0];
    await saveEntry(entry);
    success('Saved', pr ? `New record on ${e.name}.` : `${e.name}: ${G.setsLine(entry, fmtKg)}`);
    setQ('');
  };
  const SHOW = 12;
  const shown = more ? list : list.slice(0, SHOW);
  const searching = !!q.trim() || !!cat;
  const planBanner = planOn && plan && steps.length > 0 ? (
    <View accessibilityLabel={`Planned workout: ${plan.item.title}`} style={[S.card, { borderColor: colors.primary, borderWidth: 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Text style={S.muted}>Planned workout</Text><Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>{plan.item.title}</Text></View>
        <Text style={{ color: colors.ink, fontWeight: '800' }}>{progress(steps).done} of {steps.length}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop this planned workout" onPress={() => endPlannedStart()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>
      {steps.map((st: any) => {
        const skipped = plan.skipped.includes(st.key), isNext = !!planNext && planNext.key === st.key;
        const label = st.unit === 'min' ? `${st.reps} min` : st.unit === 'sec' ? `${st.sets}×${st.reps}s` : `${st.sets}×${st.reps}${st.kg > 0 ? ` · ${fmtKg(st.kg)}` : ''}`;
        return (
          <View key={st.key} style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4 }}>
            <Text style={{ width: 22, color: colors.muted }}>{st.done ? '✓' : skipped ? '–' : '○'}</Text>
            <Text style={{ flex: 1, color: st.done || skipped ? colors.muted : colors.ink, fontWeight: isNext ? '800' : '500', textDecorationLine: st.done ? 'line-through' : 'none' }}>{st.name}{st.custom ? ' (your own)' : ''}</Text>
            <Text style={S.muted}>{label}</Text>
          </View>
        );
      })}
      <View style={{ height: 8 }} />
      {planDone
        ? <Button title="All done: mark the workout done" onPress={finishPlan} />
        : planNext ? (
          <>
            <Button title={`Next: ${planNext.name}`} onPress={() => openStep(planNext)} />
            <TouchableOpacity accessibilityRole="button" onPress={() => skipPlannedStep(planNext.key)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted, fontWeight: '700' }}>Skip this one</Text></TouchableOpacity>
          </>
        ) : null}
    </View>
  ) : null;
  return (
    <View>
      {planBanner}
      <WeekStrip date={date} onChange={setDate} trained={trained} />
      <View style={{ backgroundColor: colors.primary, borderRadius: 20, padding: 16, marginBottom: 12 }}>
        <Text style={{ color: '#ffffffd9', fontWeight: '700' }}>{date === todayStr() ? 'Today' : prettyDate(date)}</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{dayKcal}<Text style={{ fontSize: 15 }}> kcal</Text></Text>
        <Text style={{ color: '#ffffffe6', marginTop: 2 }}>{ds.exercises} exercise{ds.exercises === 1 ? '' : 's'} · {ds.sets} sets · {dayMin} min{ds.volumeKg ? ` · ${fmtWeight(ds.volumeKg, unit)} lifted` : ''}</Text>
      </View>

      <View style={S.card}>
        <Field label="What did you train?" value={q} onChangeText={(t) => { setQ(t); setMore(false); }} placeholder="Squat, plank… or “bench 3x10 60”" />
        {!!quick && !!quickMatch && (
          <TouchableOpacity accessibilityRole="button" onPress={() => logQuick(fromEx(quickMatch))} style={{ borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginBottom: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>⚡ Log now</Text>
            <Text style={{ color: colors.ink, fontWeight: '800' }}>{quickMatch.name}</Text>
            <Text style={S.muted}>{quick.sets} × {quick.reps}{quick.timed ? (quick.timed === 'min' ? ' min' : ' s') : ''}{quick.kg ? ` @ ${quick.kg} ${quick.lb ? 'lb' : unit}` : ''}</Text>
          </TouchableOpacity>
        )}
        {used.length > 0 && !q && (
          <View style={{ marginBottom: 6 }}>
            <Text style={[S.label]}>Recent</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {used.slice(0, 8).map((u) => <Chip key={u.exId} small label={u.name} onPress={() => { const ex = all.find((x) => x.id === u.exId); choose(ex ? fromEx(ex) : { id: u.exId, name: u.name, cat: u.cat, unit: u.unit, custom: true }); }} />)}
            </View>
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
          {CATS.map((c) => <Chip key={c} small label={c} active={cat === c} onPress={() => { setCat(cat === c ? '' : c); setMore(false); }} />)}
        </View>
        {searching && shown.map((e) => (
          <TouchableOpacity key={e.id} accessibilityRole="button" accessibilityLabel={`Log ${e.name}`} activeOpacity={0.8} onPress={() => choose(fromEx(e))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Thumb name={e.name} cat={e.cat} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 15 }}>{wk.favs.includes(e.id) ? '★ ' : ''}{e.name}</Text>
              <Text style={S.muted}>{e.cat} · {e.gear}{e.muscle ? ` · ${e.muscle}` : ''}</Text>
            </View>
            <Ionicons name="add-circle" size={28} color={colors.primary} />
          </TouchableOpacity>
        ))}
        {searching && list.length > SHOW && !more && <SmallBtn label={`Show all ${list.length}`} onPress={() => setMore(true)} />}
        {searching && !list.length && <Text style={S.muted}>No exercise matches “{q}”.</Text>}
        {!!q.trim() && !quick && !exact && (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
            <Text style={S.label}>Not in the list? Add “{q.trim()}” as your own exercise</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {(['reps', 'sec', 'min'] as G.GymUnit[]).map((u) => <Chip key={u} small label={u === 'reps' ? 'Counted in reps' : u === 'sec' ? 'Timed (seconds)' : 'Timed (minutes)'} active={customUnit === u} onPress={() => setCustomUnit(u)} />)}
            </View>
            <Button title={`Use “${q.trim()}”`} onPress={() => choose({ id: `custom:${q.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, name: q.trim().slice(0, 60), cat: cat || 'Other', unit: customUnit, custom: true })} />
          </View>
        )}
      </View>

      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 17, marginVertical: 6 }}>{date === todayStr() ? 'Today’s workout' : 'Workout'}</Text>
      {dayList.length === 0 && <View style={[S.card, { alignItems: 'center' }]}><Text style={S.muted}>Nothing logged {date === todayStr() ? 'yet today' : 'on this day'}. Search above or tap a recent exercise.</Text></View>}
      {dayList.map((e) => (
        <View key={e.id} style={[S.card, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }]}>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="button" accessibilityLabel={`Edit ${e.name}`} onPress={() => edit(e)}>
            <Thumb name={e.name} cat={e.cat} size={50} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{e.name}</Text>
              <Text style={S.muted}>{G.setsLine(e, fmtKg)}</Text>
              <Text style={S.muted}>{G.entryKm(e) > 0 ? `${G.entryKm(e)} km · ` : ''}≈ {G.entryKcal(e, bodyKg)} kcal{e.note ? ` · ${e.note}` : ''}</Text>
            </View>
          </TouchableOpacity>
          <SmallBtn icon="trash-outline" danger onPress={() => del(e)} />
        </View>
      ))}
      {dayList.length > 0 && !wKnown && <Text style={S.muted}>Calories assume {G.DEFAULT_BODY_KG} kg. Log your weight in Body for a closer number.</Text>}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ BODY
function BodyTab() {
  const { S, colors } = useThemedStyles();
  const { body, profile } = useGymStore();
  const { success, error, confirm } = useNotifications();
  const unit = profile.unit;
  const [date, setDate] = useState(todayStr());
  const [w, setW] = useState('');
  const [bf, setBf] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [height, setHeight] = useState(profile.heightCm ? String(profile.heightCm) : '');
  const [showSites, setShowSites] = useState(true);

  // Load the day's saved values into the form whenever the date (or the stored record) changes.
  const dayRec = body.find((b) => b.date === date);
  const recKey = dayRec ? `${dayRec.id}:${dayRec.at}` : `none:${date}`;
  const [loadedKey, setLoadedKey] = useState('');
  if (loadedKey !== recKey) {
    setLoadedKey(recKey);
    setW(dayRec?.weightKg ? num2s(weightValue(dayRec.weightKg, unit)) : '');
    setBf(dayRec?.bodyFat ? String(dayRec.bodyFat) : '');
    const v: Record<string, string> = {}; if (dayRec) for (const s of G.SITES) if (dayRec.sites[s.key]) v[s.key] = String(dayRec.sites[s.key]);
    setVals(v); setNote(dayRec?.note || '');
  }

  const save = async () => {
    const weightKg = w.trim() ? parseWeightInput(w, unit) : null;
    if (w.trim() && (weightKg === null || weightKg < 20 || weightKg > 400)) { error('Check your weight', 'That does not look like a body weight.'); return; }
    const fat = bf.trim() ? G.parseNum(bf, 2, 70) : null;
    if (bf.trim() && fat === null) { error('Check body fat', 'Body fat should be between 2 and 70 %.'); return; }
    const sites: Partial<Record<G.SiteKey, number>> = {};
    for (const s of G.SITES) {
      const t = vals[s.key];
      if (!t || !t.trim()) continue;
      const n = G.parseNum(t, 5, 300);
      if (n === null) { error(`Check ${s.label.toLowerCase()}`, 'Measurements are in cm (for example 82.5).'); return; }
      sites[s.key] = n;
    }
    if (weightKg === null && fat === null && !Object.keys(sites).length) { error('Nothing to save', 'Fill in at least one number.'); return; }
    await saveBody({ date, weightKg: weightKg ?? undefined, bodyFat: fat ?? undefined, sites, note: note.trim() || undefined });
    success('Saved', 'Added to your body log. See the trend in Progress.');
  };
  const del = async (id: string, d: string) => {
    const ok = await confirm({ title: 'Delete this entry?', message: prettyDate(d), confirmText: 'Delete', destructive: true });
    if (ok) await removeBody(id);
  };
  const saveHeight = async () => { const h = G.parseNum(height, 80, 250); if (h) await saveProfile({ heightCm: h }); else if (!height.trim()) await saveProfile({ heightCm: undefined }); };

  const wPts = G.seriesOf(body, 'weightKg');
  const latestW = wPts.length ? wPts[wPts.length - 1].value : undefined;
  const lw = G.latestOf(body, 'waist')?.value, ln = G.latestOf(body, 'neck')?.value, lh = G.latestOf(body, 'hips')?.value;
  const loggedBf = G.latestOf(body, 'bodyFat')?.value;
  const est = G.navyBodyFat({ sex: profile.sex, heightCm: profile.heightCm, waistCm: lw, neckCm: ln, hipCm: lh });
  const bmiV = G.bmi(latestW, profile.heightCm);
  const lean = G.leanMassKg(latestW, loggedBf ?? est ?? undefined);
  const wc = G.changeOf(wPts);
  const sorted = [...body].sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1));
  const arrow = (d: number | null, goodDown?: boolean) => (d === null || d === 0 ? '' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}`);

  return (
    <View>
      <DateBar date={date} onChange={setDate} />
      <Card title="Weigh-in" sub={`Fill in only what you measured. Weight in ${unit}, tape measurements in cm.${dayRec ? ' Editing this day’s entry.' : ''}`}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label={`Body weight (${unit})`} value={w} onChangeText={setW} keyboardType="decimal-pad" placeholder={latestW ? num2s(weightValue(latestW, unit)) : unit} /></View>
          <View style={{ flex: 1 }}><Field label="Body fat % (optional)" value={bf} onChangeText={setBf} keyboardType="decimal-pad" placeholder={loggedBf ? String(loggedBf) : '%'} /></View>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showSites }} onPress={() => setShowSites((s) => !s)} style={[S.between, { marginBottom: 10 }]}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>Tape measurements (cm)</Text><Text style={{ color: colors.muted }}>{showSites ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {showSites && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {G.SITES.map((s) => (
              <View key={s.key} style={{ width: '48%' }}>
                <Field label={s.label} value={vals[s.key] || ''} onChangeText={(t) => setVals((v) => ({ ...v, [s.key]: t }))} keyboardType="decimal-pad" placeholder={G.latestOf(body, s.key) ? String(G.latestOf(body, s.key)!.value) : 'cm'} />
              </View>
            ))}
          </View>
        )}
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Morning, fasted…" />
        <Button title={dayRec ? 'Update this day' : 'Save measurements'} onPress={save} />
      </Card>

      <Card title="About you" sub="Used for BMI and the body-fat estimate. Stays on this phone unless you turn on sync (Export tab).">
        <Text style={S.label}>Weight unit</Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip label="Kilograms (kg)" active={unit === 'kg'} onPress={() => { saveProfile({ unit: 'kg' }); setLoadedKey(''); }} />
          <Chip label="Pounds (lb)" active={unit === 'lb'} onPress={() => { saveProfile({ unit: 'lb' }); setLoadedKey(''); }} />
        </View>
        <Text style={S.label}>Sex (for the body-fat estimate)</Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip label="Male" active={profile.sex === 'male'} onPress={() => saveProfile({ sex: 'male' })} />
          <Chip label="Female" active={profile.sex === 'female'} onPress={() => saveProfile({ sex: 'female' })} />
        </View>
        <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="170" />
        <SmallBtn label="Save height" onPress={saveHeight} />
      </Card>

      {body.length > 0 && (
        <Card title="Where you are now" sub="From your latest readings.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {latestW !== undefined && <Stat l="Body weight" v={fmtWeight(latestW, unit)} sub={wc.sinceStart !== null ? `${wc.sinceStart > 0 ? '+' : ''}${weightValue(Math.abs(wc.sinceStart) * Math.sign(wc.sinceStart), unit)} ${unit} since first entry` : undefined} />}
            {bmiV !== null && <Stat l="BMI" v={String(bmiV)} sub="Rough guide only" />}
            {loggedBf !== undefined ? <Stat l="Body fat (logged)" v={`${loggedBf}%`} /> : est !== null ? <Stat l="Body fat (tape estimate)" v={`${est}%`} sub="US Navy method" /> : null}
            {lean !== null && <Stat l="Lean mass" v={fmtWeight(lean, unit)} />}
            {G.waistToHeight(lw, profile.heightCm) !== null && <Stat l="Waist ÷ height" v={String(G.waistToHeight(lw, profile.heightCm))} sub="Under 0.5 is a good aim" />}
            {G.waistToHip(lw, lh) !== null && <Stat l="Waist ÷ hips" v={String(G.waistToHip(lw, lh))} />}
          </View>
          {G.SITES.filter((s) => G.seriesOf(body, s.key).length).map((s) => {
            const pts = G.seriesOf(body, s.key), ch = G.changeOf(pts);
            return (
              <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ flex: 1, fontWeight: '700', color: colors.ink }}>{s.label}</Text>
                <Text style={{ fontWeight: '800', color: colors.ink, width: 70, textAlign: 'right' }}>{pts[pts.length - 1].value} cm</Text>
                <Text style={[S.muted, { width: 78, textAlign: 'right' }]}>{ch.sinceStart === null ? '' : `${arrow(ch.sinceStart)} total`}</Text>
              </View>
            );
          })}
        </Card>
      )}

      {sorted.length > 0 && (
        <Card title="History">
          {sorted.slice(0, 40).map((b) => (
            <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
              <TouchableOpacity style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${prettyDate(b.date)}`} onPress={() => setDate(b.date)}>
                <Text style={{ fontWeight: '800', color: colors.ink }}>{prettyDate(b.date)}</Text>
                <Text style={S.muted}>{[b.weightKg ? fmtWeight(b.weightKg, unit) : '', b.bodyFat ? `${b.bodyFat}% fat` : '', Object.keys(b.sites).length ? `${Object.keys(b.sites).length} tape` : ''].filter(Boolean).join(' · ')}</Text>
              </TouchableOpacity>
              <SmallBtn icon="trash-outline" danger onPress={() => del(b.id, b.date)} />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ PROGRESS
function ProgressTab() {
  const { S, colors } = useThemedStyles();
  const { entries, body, goal, profile } = useGymStore();
  const { success } = useNotifications();
  const unit = profile.unit;
  const t = todayStr();
  const [metric, setMetric] = useState<G.MetricKey>('weightKg');
  const [range, setRange] = useState<30 | 90 | 0>(90);
  const [exId, setExId] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [gw, setGw] = useState(''); const [gf, setGf] = useState(''); const [gd, setGd] = useState(''); const [gs, setGs] = useState<Record<string, string>>({});

  const startEdit = () => {
    setGw(goal?.weightKg ? num2s(weightValue(goal.weightKg, unit)) : ''); setGf(goal?.bodyFat ? String(goal.bodyFat) : ''); setGd(goal?.targetDate || '');
    const v: Record<string, string> = {}; for (const s of G.SITES) if (goal?.sites[s.key]) v[s.key] = String(goal.sites[s.key]); setGs(v); setEditing(true);
  };
  const saveG = async () => {
    const sites: Partial<Record<G.SiteKey, number>> = {};
    for (const s of G.SITES) { const n = G.parseNum(gs[s.key], 5, 300); if (n) sites[s.key] = n; }
    const weightKg = gw.trim() ? parseWeightInput(gw, unit) : null;
    const bodyFat = gf.trim() ? G.parseNum(gf, 2, 70) : null;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(gd.trim()) && G.dayNum(gd.trim()) > G.dayNum(t);
    await saveGoal({ startDate: goal?.startDate || t, targetDate: validDate ? gd.trim() : undefined, weightKg: weightKg || undefined, bodyFat: bodyFat || undefined, sites });
    setEditing(false); success('Goal saved', 'Your progress is measured from your first reading on or after the start date.');
  };

  const goalKeys: G.MetricKey[] = goal ? (['weightKg', 'bodyFat', ...G.SITES.map((s) => s.key)] as G.MetricKey[]).filter((k) => (k === 'weightKg' ? goal.weightKg : k === 'bodyFat' ? goal.bodyFat : goal.sites[k as G.SiteKey])) : [];
  const targetOf = (k: G.MetricKey) => (!goal ? undefined : k === 'weightKg' ? goal.weightKg : k === 'bodyFat' ? goal.bodyFat : goal.sites[k as G.SiteKey]);
  const progress = goalKeys.map((k) => G.goalProgress(body, k, targetOf(k), goal, t)).filter(Boolean) as G.GoalProgress[];
  const fmtM = (k: G.MetricKey, v: number) => (k === 'weightKg' ? fmtWeight(v, unit) : k === 'bodyFat' ? `${G.round1(v)}%` : `${G.round1(v)} cm`);
  const dispRate = (k: G.MetricKey, r: number) => (k === 'weightKg' ? `${num2s(weightValue(Math.abs(r), unit))} ${unit}` : k === 'bodyFat' ? `${Math.abs(r)}%` : `${Math.abs(r)} cm`);

  const metrics = (['weightKg', 'bodyFat', ...G.SITES.map((s) => s.key)] as G.MetricKey[]).filter((k) => G.seriesOf(body, k).length);
  const m = metrics.includes(metric) ? metric : metrics[0];
  const cutoff = range ? G.shiftDate(t, -range) : '0000-00-00';
  const raw = m ? G.seriesOf(body, m).filter((p) => p.date >= cutoff) : [];
  const conv = (v: number) => (m === 'weightKg' ? G.round1(weightValue(v, unit)) : v);
  const rawD = raw.map((p) => ({ ...p, value: conv(p.value) }));
  const trendD = raw.length > 2 ? G.trendOf(raw).map((p) => ({ ...p, value: conv(p.value) })) : undefined;
  const mGoal = m ? targetOf(m) : undefined;

  const week = G.weekStart(t);
  const bwOf = G.bodyKgFn(body);
  const thisWeek = G.rangeStats(entries, week, G.shiftDate(week, 6), bwOf);
  const lastWeek = G.rangeStats(entries, G.shiftDate(week, -7), G.shiftDate(week, -1), bwOf);
  const weeks = G.weeklyDays(entries, t, 8, bwOf);
  const maxDays = Math.max(1, ...weeks.map((x) => x.days));
  const streak = G.loggingStreak(entries, t);
  const kcalWeek = G.kcalIn(entries, body, week, G.shiftDate(week, 6)), kcalLast = G.kcalIn(entries, body, G.shiftDate(week, -7), G.shiftDate(week, -1));

  const used = G.exercisesUsed(entries);
  const exSel = exId && used.find((u) => u.exId === exId) ? exId : used[0]?.exId;
  const ser = exSel ? G.exerciseSeries(entries, exSel, bwOf) : [];
  const exInfo = used.find((u) => u.exId === exSel);
  const exTimed = exInfo ? G.isTimed(exInfo.unit) : false;
  const weighted = ser.some((p) => p.topKg > 0);
  const exPts = ser.map((p) => ({ date: p.date, value: exTimed ? p.topReps : weighted ? G.round1(weightValue(p.e1rm || p.topKg, unit)) : p.topReps }));
  const bestE = Math.max(0, ...ser.map((p) => p.e1rm)), bestKg = Math.max(0, ...ser.map((p) => p.topKg)), bestReps = Math.max(0, ...ser.map((p) => p.topReps));
  const totalVol = ser.reduce((n, p) => n + p.volumeKg, 0);

  return (
    <View>
      <Card title="Your body goal" sub="Set where you want to get to. Progress is worked out here, on your phone." right={!editing ? <SmallBtn icon="create-outline" label={goal ? 'Edit' : 'Set goal'} onPress={startEdit} /> : undefined}>
        {editing ? (
          <View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Field label={`Target weight (${unit})`} value={gw} onChangeText={setGw} keyboardType="decimal-pad" placeholder={unit} /></View>
              <View style={{ flex: 1 }}><Field label="Target body fat %" value={gf} onChangeText={setGf} keyboardType="decimal-pad" placeholder="%" /></View>
            </View>
            <Field label="Target date (YYYY-MM-DD, optional)" value={gd} onChangeText={setGd} placeholder="2027-03-01" />
            <Text style={S.label}>Target measurements (cm, optional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {G.SITES.map((s) => <View key={s.key} style={{ width: '48%' }}><Field label={s.label} value={gs[s.key] || ''} onChangeText={(v) => setGs((o) => ({ ...o, [s.key]: v }))} keyboardType="decimal-pad" placeholder="cm" /></View>)}
            </View>
            <Button title="Save goal" onPress={saveG} />
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SmallBtn label="Cancel" onPress={() => setEditing(false)} />
              {!!goal && <SmallBtn label="Remove goal" danger onPress={async () => { await saveGoal(null); setEditing(false); }} />}
            </View>
          </View>
        ) : !goal || !goalKeys.length ? (
          <Text style={S.muted}>No goal yet. Tap “Set goal” to add a target weight, body fat or measurements, then log your weigh-ins in the Body tab.</Text>
        ) : (
          <View>
            <Text style={[S.muted, { marginBottom: 8 }]}>Started {prettyDate(goal.startDate)}{goal.targetDate ? ` · aiming for ${prettyDate(goal.targetDate)}` : ''}</Text>
            {progress.map((p) => (
              <View key={p.key} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={S.between}>
                  <Text style={{ fontWeight: '800', color: colors.ink }}>{G.METRIC_LABEL[p.key]}</Text>
                  <Text style={{ fontWeight: '800', color: p.reached ? colors.success : colors.ink }}>{p.reached ? 'Goal reached 🎉' : `${p.pct}%`}</Text>
                </View>
                <View style={{ height: 6 }} />
                <Bar pct={p.pct} color={p.reached ? colors.success : undefined} />
                <Text style={[S.muted, { marginTop: 6 }]}>{fmtM(p.key, p.start)} → now {fmtM(p.key, p.current)} → goal {fmtM(p.key, p.target)}</Text>
                {!p.reached && <Text style={S.muted}>{fmtM(p.key, Math.abs(p.remaining))} to go{p.ratePerWeek !== null ? ` · moving ${p.ratePerWeek === 0 ? 'nowhere' : `${p.ratePerWeek < 0 ? 'down' : 'up'} ${dispRate(p.key, p.ratePerWeek)}/week`}` : ' · log a few more readings over a week or more for a pace'}</Text>}
                {!p.reached && p.etaDate && <Text style={[S.muted, { color: colors.ink }]}>At this pace: around {prettyDate(p.etaDate)} (about {Math.max(1, Math.round(p.etaWeeks || 0))} weeks)</Text>}
                {p.onTrack !== null && !p.reached && <Text style={{ fontSize: 12, marginTop: 2, fontWeight: '700', color: p.onTrack ? colors.successInk : colors.warnInk }}>{p.onTrack ? 'On track for your date' : `To hit your date you need about ${dispRate(p.key, p.neededPerWeek || 0)}/week`}</Text>}
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card title="Body trend" sub={rawD.length ? 'Dots are readings; the line smooths out day-to-day swings. Dashed green = goal.' : 'Log weight or measurements in the Body tab to see a chart.'}>
        {metrics.length > 0 && (
          <View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {metrics.map((k) => <Chip key={k} small label={G.METRIC_LABEL[k]} active={m === k} onPress={() => setMetric(k)} />)}
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              {([[30, '30 days'], [90, '90 days'], [0, 'All']] as [30 | 90 | 0, string][]).map(([r, l]) => <Chip key={r} small label={l} active={range === r} onPress={() => setRange(r)} />)}
            </View>
            {rawD.length ? <LineChart raw={rawD} trend={trendD} goal={mGoal ? conv(mGoal) : undefined} fmt={(n) => (m === 'weightKg' || m === 'bodyFat' ? String(G.round1(n)) : String(Math.round(n * 10) / 10))} /> : <Text style={S.muted}>No readings in this period.</Text>}
          </View>
        )}
      </Card>

      <Card title="Training" sub="From your gym log.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Stat l="This week" v={`${thisWeek.days} day${thisWeek.days === 1 ? '' : 's'}`} sub={`${thisWeek.sets} sets · last week ${lastWeek.days}`} />
          <Stat l="Volume this week" v={fmtWeight(thisWeek.volumeKg, unit)} sub={lastWeek.volumeKg ? `last week ${fmtWeight(lastWeek.volumeKg, unit)}` : undefined} />
          <Stat l="Calories burned this week" v={`≈ ${kcalWeek}`} sub={`kcal · last week ≈ ${kcalLast}${G.bodyKgOn(body, t) ? '' : ' · at 70 kg'}`} />
          <Stat l="Logging streak" v={`${streak} day${streak === 1 ? '' : 's'}`} />
          <Stat l="Total logged" v={`${new Set(entries.map((e) => e.date)).size} workouts`} sub={`${entries.length} exercises`} />
        </View>
        <Text style={[S.label, { marginTop: 4 }]}>Training days per week</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 70, gap: 6 }}>
          {weeks.map((x, i) => (
            <View key={x.start} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} accessible accessibilityLabel={`Week of ${prettyDate(x.start)}: ${x.days} days`}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{x.days || ''}</Text>
              <View style={{ width: '100%', height: Math.max(3, (x.days / maxDays) * 46), borderRadius: 5, backgroundColor: i === weeks.length - 1 ? colors.primary : colors.primarySoft }} />
            </View>
          ))}
        </View>
      </Card>

      <Card title="Exercise progress" sub={used.length ? 'Estimated one-rep max over time (or best reps / time for bodyweight and timed moves).' : 'Log some exercises to see your strength progress here.'}>
        {used.length > 0 && (
          <View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {used.slice(0, 14).map((u) => <Chip key={u.exId} small label={u.name} active={exSel === u.exId} onPress={() => setExId(u.exId)} />)}
            </View>
            {exPts.length > 0 && <LineChart raw={exPts} fmt={(n) => String(Math.round(n * 10) / 10)} color={colors.kcal} />}
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {!exTimed && bestKg > 0 && <Stat l="Heaviest set" v={fmtWeight(bestKg, unit)} />}
              {!exTimed && bestE > 0 && <Stat l="Best est. 1RM" v={fmtWeight(bestE, unit)} />}
              <Stat l={exInfo?.unit === 'sec' ? 'Longest hold' : exInfo?.unit === 'min' ? 'Longest session' : 'Most reps in a set'} v={`${bestReps}${exInfo?.unit === 'sec' ? ' s' : exInfo?.unit === 'min' ? ' min' : ''}`} />
              {totalVol > 0 && <Stat l="Total volume" v={fmtWeight(totalVol, unit)} />}
            </View>
            <Text style={S.label}>Recent sessions</Text>
            {entries.filter((e) => e.exId === exSel).sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1)).slice(0, 6).map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ width: 92, color: colors.muted, fontSize: 13 }}>{prettyDate(e.date)}</Text>
                <Text style={{ flex: 1, color: colors.ink, fontSize: 13, fontWeight: '600' }}>{G.setsLine(e, (k) => fmtWeight(k, unit))}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ EXPORT
function ExportTab() {
  const { S, colors } = useThemedStyles();
  const gym = useGymStore();
  const { success, error, confirm } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const sets = gym.entries.reduce((n, e) => n + G.entrySetCount(e), 0);
  const run = async (kind: 'workouts-csv' | 'body-csv' | 'backup-json', text: string, what: string) => {
    setBusy(true);
    try { await shareGymFile(kind, text); success('Ready', `${what} created. Choose where to save it.`); }
    catch (e: any) { error('Could not create the file', e?.message || 'Try again.'); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    const b = parseBackup(paste);
    if (!b) { error('Not a backup', 'Paste the full text of a FlexFit gym backup (.json) file.'); return; }
    const ok = await confirm({ title: 'Replace your gym log?', message: `This replaces what is on this phone with the backup (${b.entries.length} exercises, ${b.body.length} body entries).`, confirmText: 'Restore', destructive: true });
    if (!ok) return;
    await replaceGym(b); setPaste(''); success('Restored', 'Your gym log was restored from the backup.');
  };
  const sync = useRecordSyncStatus();
  useEffect(() => { refreshRecordSync().catch(() => {}); }, []);
  const wipe = async () => {
    const ok = await confirm({ title: 'Delete all gym log data?', message: sync.on ? 'Sync is on, so this removes every logged exercise, measurement and goal from this phone, from your other devices and from your account. Export a backup first if you want to keep it.' : 'This removes every logged exercise, measurement and goal from this phone. Export a backup first if you want to keep it.', confirmText: 'Delete everything', destructive: true });
    if (ok) { await clearGym(); success('Deleted', 'The gym log is empty.'); }
  };
  const none = !gym.entries.length && !gym.body.length;
  return (
    <View>
      <Card title="Download your data" sub={`${gym.entries.length} exercises (${sets} sets) · ${gym.body.length} body entries`}>
        <Text style={[S.muted, { marginBottom: 12 }]}>Files are made on your phone. After you tap, pick “Save to Files”, Drive, e-mail or any app you like.</Text>
        <Button title="Workouts (CSV, one row per set)" disabled={busy || !gym.entries.length} onPress={() => run('workouts-csv', workoutsCsv(gym.entries, gym.body), 'Your workout log')} />
        <View style={{ height: 8 }} />
        <Button title="Body weight & measurements (CSV)" disabled={busy || !gym.body.length} onPress={() => run('body-csv', bodyCsv(gym.body, gym.profile), 'Your body log')} />
        <View style={{ height: 8 }} />
        <Button title="Full backup (JSON)" disabled={busy || none} onPress={() => run('backup-json', backupJson(gym), 'Your backup')} />
        <Text style={[S.muted, { marginTop: 10 }]}>Calories are estimates (MET-based, from your sets and body weight). CSV opens in Excel or Google Sheets. The JSON backup holds everything, including your goal, so you can restore it later.</Text>
      </Card>
      <Card title="Restore from a backup" sub="Open your backup file, copy all of its text, paste it here.">
        <TextInput accessibilityLabel="Backup text" value={paste} onChangeText={setPaste} multiline placeholder='{"app":"flexfit-gymlog", …}' placeholderTextColor={colors.muted}
          style={{ minHeight: 90, maxHeight: 160, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, padding: 12, color: colors.ink, backgroundColor: colors.card, marginBottom: 10, textAlignVertical: 'top', fontSize: 12 }} />
        <Button title="Restore" disabled={!paste.trim()} onPress={restore} />
      </Card>
      <Card title="Sync across my devices" sub={sync.on ? 'On for this account' : 'Off: your gym log stays on this phone only'}>
        {sync.on ? (
          <>
            <Text style={S.muted}>{sync.state === 'syncing' ? 'Syncing…' : sync.state === 'error' ? sync.message : sync.last ? `Up to date · last synced ${new Date(sync.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for the first sync…'}{sync.state === 'ok' && sync.message ? ` ${sync.message}` : ''}</Text>
            <Text style={[S.muted, { marginTop: 6 }]}>Your exercises, body measurements and goal are saved to your FlexFit account, so the web app and other devices show the same log. Deleting something on one device deletes it everywhere. Turn sync on in the web app too.</Text>
            <View style={{ height: 10 }} />
            <Button title="Sync now" onPress={() => { syncRecordsNow(); }} />
            <View style={{ height: 8 }} />
            <Button title="Turn off sync" onPress={() => { setRecordSync(false); }} />
          </>
        ) : (
          <>
            <Text style={S.muted}>Turn this on to keep the same gym log on this phone and in the web app. Your exercises, body measurements and goal are then saved to your FlexFit account (and included in your account export). Nothing is deleted when you turn it on: what is on each device is combined. Turn it on in the web app too.</Text>
            <View style={{ height: 10 }} />
            <Button title="Turn on sync" onPress={() => { setRecordSync(true); }} />
          </>
        )}
      </Card>
      <Card title="Privacy">
        <Text style={S.muted}>{sync.on ? 'With sync on, your gym log is kept on this phone and in your FlexFit account (it is in your account export). Removing the app no longer loses it: the next sync brings it back.' : 'Your gym log is stored on this phone. Only each exercise’s name, sets, minutes and estimated calories are sent to the FlexFit server (so Exercise and Home count them). Body measurements and goals stay here, and the log isn’t in your account export or server backups, so export a backup now and then. Removing the app, or clearing its data, erases it. Turn on sync above if you want it in the web app too.'} It is kept separately for each account that signs in on this phone.</Text>
        <View style={{ height: 10 }} />
        <SmallBtn icon="trash-outline" label="Delete all gym log data" danger onPress={wipe} />
      </Card>
    </View>
  );
}
