// Body plan: the training half. A setup form (where, level, days, time, equipment, anything that hurts, focus), the body analysis and the
// weekly program with an alternative for every situation (machine busy, no gym today, no time, rest day). Every number comes from the
// server (lib/trainingPlan.js); this file only shows them. Used by app/(tabs)/body.tsx.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import ExercisePic from './ExercisePic';

const GROUP: Record<string, string> = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', core: 'Core', legs: 'Legs', glutes: 'Glutes' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const rest = (sec: number) => (sec >= 90 ? `${Math.round((sec / 60) * 10) / 10} min` : `${sec} s`);

function Line({ t }: { t: string }) {
  const { colors } = useThemedStyles();
  return <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19, marginBottom: 5 }}>• {t}</Text>;
}
function H({ t }: { t: string }) {
  const { colors } = useThemedStyles();
  return <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 14, marginTop: 14, marginBottom: 4 }}>{t}</Text>;
}
function Note({ t }: { t: string }) {
  const { colors } = useThemedStyles();
  return <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10, marginTop: 8 }}><Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>{t}</Text></View>;
}
function Item({ title, body, sub }: { title: string; body?: string; sub?: string }) {
  const { S, colors } = useThemedStyles();
  return (
    <View style={{ marginBottom: 9 }}>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{title}</Text>
      {!!body && <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>{body}</Text>}
      {!!sub && <Text style={S.muted}>{sub}</Text>}
    </View>
  );
}
function Toggle({ label, children }: { label: string; children: any }) {
  const { colors } = useThemedStyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 4 }}>
      <TouchableOpacity onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}>
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{open ? '▾' : '▸'} {label}</Text>
      </TouchableOpacity>
      {open && <View style={{ marginTop: 6 }}>{children}</View>}
    </View>
  );
}

function Question({ label, hint, children }: { label: string; hint?: string; children: any }) {
  const { S, colors } = useThemedStyles();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14, marginBottom: 2 }}>{label}</Text>
      {!!hint && <Text style={[S.muted, { marginBottom: 6 }]}>{hint}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: hint ? 0 : 6 }}>{children}</View>
    </View>
  );
}

/** The setup questions. `prefs` is the editable copy, `onChange` previews the plan with the new answers. */
export function TrainingSetup({ options, prefs, serverPrefs, onChange }: { options: any; prefs: any; serverPrefs: any; onChange: (p: any) => void }) {
  if (!options || !prefs) return null;
  const set = (k: string, v: any) => onChange({ ...prefs, [k]: v });
  const multi = (k: string, id: string, max?: number) => {
    const cur: string[] = prefs[k] || [];
    if (cur.includes(id)) return set(k, cur.filter((x) => x !== id));
    set(k, max && cur.length >= max ? [...cur.slice(1), id] : [...cur, id]);
  };
  const home = prefs.place !== 'gym';
  return (
    <View>
      {serverPrefs && !serverPrefs.setupDone && <Note t="Tell us how you train and the plan below fits you exactly. Until then it assumes you are new to lifting and train at a gym." />}
      <Question label="Where do you train?">{options.places.map((o: any) => <Chip key={o.id} label={o.label} active={prefs.place === o.id} onPress={() => set('place', o.id)} />)}</Question>
      <Question label="Your experience">{options.levels.map((o: any) => <Chip key={o.id} label={o.label} active={prefs.level === o.id} onPress={() => set('level', o.id)} />)}</Question>
      <Question label="Gym days a week" hint="Every day you pick gets its own exercises. ★ is the best fit for your goal">
        {options.days.map((d: number) => <Chip key={d} label={`${d}${serverPrefs && serverPrefs.recommendedDays === d ? ' ★' : ''}`} active={prefs.days === d} onPress={() => onChange({ ...prefs, days: d, weekdays: [] })} />)}
      </Question>
      <Question label="Which days?" hint="Optional. Pick the exact weekdays you go and the plan is laid out on them.">
        {WEEKDAYS.map((n, i) => {
          const cur: number[] = prefs.weekdays || [];
          const on = cur.includes(i);
          return <Chip key={n} label={n} active={on} onPress={() => { const next = (on ? cur.filter((x) => x !== i) : [...cur, i]).sort((a, b) => a - b); onChange({ ...prefs, weekdays: next, days: next.length >= 2 ? next.length : prefs.days }); }} />;
        })}
      </Question>
      <Question label="Minutes a session">{options.minutes.map((m: number) => <Chip key={m} label={`${m}`} active={prefs.minutes === m} onPress={() => set('minutes', m)} />)}</Question>
      {home && <Question label="What do you have at home?" hint="Nothing is fine too. A backpack and water bottles count.">{options.equipment.map((o: any) => <Chip key={o.id} label={o.label} active={(prefs.equipment || []).includes(o.id)} onPress={() => multi('equipment', o.id)} />)}</Question>}
      <Question label="Anything that hurts or limits you?" hint="Those moves are removed and replaced.">{options.limits.map((o: any) => <Chip key={o.id} label={o.label} active={(prefs.limits || []).includes(o.id)} onPress={() => multi('limits', o.id)} />)}</Question>
      <Question label="Bring up a muscle?" hint="Pick up to 3">{options.focus.map((o: any) => <Chip key={o.id} label={o.label} active={(prefs.focus || []).includes(o.id)} onPress={() => multi('focus', o.id, 3)} />)}</Question>
      {serverPrefs && serverPrefs.notes.map((n: string, i: number) => <Note key={i} t={n} />)}
    </View>
  );
}

export function Analysis({ a }: { a: any }) {
  const { S, colors } = useThemedStyles();
  const fr = a.frame;
  const stat = (l: string, v: string) => (
    <View key={l} style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginBottom: 8 }}>
      <Text style={S.muted}>{l}</Text><Text style={{ fontWeight: '800', color: colors.ink, fontSize: 15 }}>{v}</Text>
    </View>
  );
  return (
    <View>
      <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '600', marginBottom: 10 }}>{a.headline}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {stat('Lean mass', `${fr.leanMassKg} kg`)}{stat('Fat mass', `${fr.fatMassKg} kg`)}
        {stat('Muscle index (FFMI)', `${fr.ffmi}${fr.ffmiBand ? ` · ${fr.ffmiBand}` : ''}`)}{stat('Body fat', `${fr.bodyFatPct}% (${fr.bodyFatSource === 'tape' ? 'tape' : 'estimate'})`)}
      </View>
      <Text style={S.muted}>{fr.ffmiNote}</Text>
      <H t="Your proportions" />
      {a.proportions.map((p: any) => <Item key={p.id} title={`${p.label}${p.value !== null ? `: ${p.value}` : ''}${p.goal ? ` (aim about ${p.goal})` : ''}`} sub={p.read} />)}
      <H t="Muscles to bring up" />
      {a.focus.map((f: any) => <Item key={f.group} title={cap(f.group)} sub={f.why} />)}
      <H t="What your body changed in the plan" />
      {a.adjustments.map((x: any, i: number) => <Item key={i} title={x.area} body={x.change} sub={`Why: ${x.why}`} />)}
      <H t="What to expect" />
      <Line t={a.expectation.timeline} /><Line t={a.expectation.strength} />
      <Line t={a.expectation.muscleKgPerMonth[1] > 0 ? `Muscle gain: roughly ${a.expectation.muscleKgPerMonth[0]} to ${a.expectation.muscleKgPerMonth[1]} kg a month at your level and goal.` : 'Muscle gain is small while eating less. Holding your muscle is the win.'} />
      <Line t={`Sleep ${a.recovery.sleepHours} hours and take ${a.recovery.fullRestDaysPerWeek} full rest day${a.recovery.fullRestDaysPerWeek > 1 ? 's' : ''} a week. ${a.recovery.note}`} />
      <Text style={S.muted}>{a.expectation.caution}</Text>
      {a.warnings.map((w: string, i: number) => <Note key={i} t={w} />)}
    </View>
  );
}

function Swap({ s }: { s: any }) {
  const { S, colors } = useThemedStyles();
  return <View style={{ marginBottom: 6 }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{s.name} <Text style={S.muted}>· {s.kind}</Text></Text><Text style={S.muted}>{s.hint}</Text></View>;
}

const FEEL: [string, string][] = [['easy', '😌 Easy'], ['good', '🙂 Good'], ['hard', '😮‍💨 Hard']];
const PAIN: [string, string][] = [['knee', 'Knee'], ['back', 'Back'], ['shoulder', 'Shoulder'], ['wrist', 'Wrist'], ['elbow', 'Elbow'], ['dizzy', 'Dizzy or chest pressure']];
const REASONS: [string, string][] = [['tired', 'Tired'], ['busy', 'No time'], ['sick', 'Unwell'], ['pain', 'Sore or hurt'], ['travel', 'Travelling']];
const ACTION_TEXT: Record<string, string> = { start: 'Find your weight', addRep: '+1 rep', addWeight: 'Heavier', harder: 'Harder version', recover: 'Recover', ease: 'Lighter', hold: 'Hold the weight' };
const STATUS_ICON: Record<string, string> = { done: '✅', partial: '◐', extra: '✅', today: '💪', planned: '💪', spare: '·', skipped: '—', notdone: '○' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function FormGuide({ f }: { f: any }) {
  const { S, colors } = useThemedStyles();
  if (!f) return null;
  const row = (k: string, v: string, red?: boolean) => <Text key={k} style={{ color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 4 }}><Text style={{ fontWeight: '800', color: red ? '#d6455a' : colors.muted, fontSize: 11 }}>{k.toUpperCase()}  </Text>{v}</Text>;
  return <View style={{ marginTop: 6 }}>{row('Set up', f.setup)}{row('Move', f.move)}{row('Breathe', f.breathe)}{row('Avoid', f.avoid, true)}</View>;
}

function NumBox({ value, onChange, label, w = 60 }: { value: any; onChange: (v: string) => void; label: string; w?: number }) {
  const { colors } = useThemedStyles();
  return <TextInput value={String(value ?? '')} onChangeText={onChange} keyboardType="decimal-pad" accessibilityLabel={label} style={{ width: w, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, color: colors.ink, backgroundColor: colors.card }} />;
}

/** One exercise: the picture, today's target (from what you did last time), the set logger, how to do it, and the swaps. */
function Exercise({ e, n, showSwaps, rows, setRows, canLog, onSwap, onSkip, onReset }: { e: any; n: number; showSwaps?: boolean; rows: any[] | null; setRows: (id: string, r: any[]) => void; canLog: boolean; onSwap?: (e: any, s: any, always: boolean) => void; onSkip?: (e: any) => void; onReset?: (e: any) => void }) {
  const { S, colors } = useThemedStyles();
  const [pick, setPick] = useState(false);
  const sw = e.swaps;
  const t = e.next;
  const sets = e.setsToday || e.sets;
  const unit = e.unit === 'seconds' ? 'sec' : 'reps';
  const badges = e.sets ? [`${sets} sets`, `${e.reps}`, `rest ${rest(e.restSec)}`] : [String(e.reps)];
  const setRow = (i: number, k: string, v: string) => rows && setRows(e.id, rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <View style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{n}</Text></View>
        <Text style={{ flex: 1, color: colors.ink, fontWeight: '800', fontSize: 15 }}>{e.name}</Text>
      </View>
      {!!e.swappedFrom && <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12.5, marginTop: 2 }}>Swapped in for {e.swappedFrom}. <Text onPress={() => onReset && onReset(e)} style={{ textDecorationLine: 'underline' }}>Use the original</Text></Text>}
      {!!e.replaces && <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12.5, marginTop: 2 }}>{e.match === 'same' ? 'Same as the gym' : `Home match for: ${e.replaces.name}`}</Text>}
      <ExercisePic ex={e} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {badges.map((b) => <Text key={b} style={{ backgroundColor: colors.card, color: colors.primary, fontWeight: '800', fontSize: 12.5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, marginRight: 6, marginBottom: 4, overflow: 'hidden' }}>{b}</Text>)}
      </View>
      {!!t && (
        <View style={{ marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: t.action === 'addWeight' ? '#2aa876' : t.action === 'ease' || t.action === 'recover' ? '#e0a100' : colors.primary }}>
          <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 13.5 }}>{ACTION_TEXT[t.action] || 'Today'}{t.weightKg ? ` · ${t.weightKg} kg` : ''}{t.action !== 'start' ? ` · ${t.reps} ${unit}` : ''}</Text>
          <Text style={[S.muted, { marginTop: 2 }]}>{t.note}</Text>
          {!!t.last && <Text style={[S.muted, { marginTop: 2, fontSize: 11.5 }]}>Last time: {t.last.reps} {unit}{t.last.weightKg ? ` at ${t.last.weightKg} kg` : ''}</Text>}
        </View>
      )}
      {!!e.effortToday && <Text style={[S.muted, { marginTop: 4 }]}>{e.effortToday}</Text>}
      <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{e.cue}</Text>
      {!!e.matchNote && <Text style={[S.muted, { marginTop: 4 }]}>{e.matchNote}</Text>}
      <FormGuide f={e.form} />
      {!!onSwap && (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {showSwaps && !!sw && <TouchableOpacity onPress={() => setPick(!pick)} accessibilityRole="button" accessibilityState={{ expanded: pick }} style={{ marginRight: 18, paddingVertical: 4 }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Swap this exercise</Text></TouchableOpacity>}
            <TouchableOpacity onPress={() => onSkip && onSkip(e)} accessibilityRole="button" style={{ paddingVertical: 4 }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Skip it today</Text></TouchableOpacity>
          </View>
          {pick && !!sw && [...(sw.busy || []), ...(sw.dumbbellOnly ? [sw.dumbbellOnly] : []), ...(sw.home ? [sw.home] : [])].filter((x: any, i: number, a: any[]) => a.findIndex((y) => y.id === x.id) === i).map((x: any) => (
            <View key={x.id} style={{ marginTop: 6, padding: 8, borderRadius: 10, backgroundColor: colors.card }}>
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{x.name} <Text style={S.muted}>· {x.kind}</Text></Text>
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <TouchableOpacity onPress={() => { onSwap(e, x, false); setPick(false); }} accessibilityRole="button" style={{ marginRight: 18, paddingVertical: 4 }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Use today</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { onSwap(e, x, true); setPick(false); }} accessibilityRole="button" style={{ paddingVertical: 4 }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Always use this</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
      {canLog && !!rows && (
        <View style={{ marginTop: 8 }}>
          {rows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[S.muted, { width: 46, fontWeight: '700' }]}>Set {i + 1}</Text>
              {e.unit !== 'seconds' && <><NumBox value={r.weightKg} onChange={(v) => setRow(i, 'weightKg', v)} label={`Set ${i + 1} weight in kg`} /><Text style={[S.muted, { marginHorizontal: 6 }]}>kg</Text></>}
              <NumBox value={r.reps} onChange={(v) => setRow(i, 'reps', v)} label={`Set ${i + 1} ${unit}`} w={54} /><Text style={[S.muted, { marginLeft: 6 }]}>{unit}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={() => setRows(e.id, [...rows, { ...(rows[rows.length - 1] || { weightKg: '', reps: '' }) }].slice(0, 8))} accessibilityRole="button"><Text style={{ color: colors.primary, fontWeight: '700' }}>+ Add a set</Text></TouchableOpacity>
        </View>
      )}
      {!!e.weightHint && (
        <Toggle label="How heavy, and what if the machine is busy">
          <Text style={S.muted}>{e.weightHint}</Text>
          <Text style={[S.muted, { marginTop: 4 }]}>{e.progress}</Text>
          {showSwaps && sw && (
            <View>
              {sw.busy.length > 0 && <><H t="Machine busy or missing" />{sw.busy.map((x: any) => <Swap key={x.id} s={x} />)}</>}
              {sw.dumbbellOnly && <><H t="Only dumbbells and a bench" /><Swap s={sw.dumbbellOnly} /></>}
              {sw.home && <><H t="No equipment (home)" /><Swap s={sw.home} /></>}
              {(sw.easier || sw.harder) && <Text style={[S.muted, { marginTop: 4 }]}>{sw.easier ? `Too hard? Try: ${sw.easier.name}. ` : ''}{sw.harder ? `Too easy? Try: ${sw.harder.name}.` : ''}</Text>}
            </View>
          )}
        </Toggle>
      )}
    </View>
  );
}

const WAYS: [string, string][] = [['gym', '🏋️ Gym'], ['home', '🏠 Home'], ['quick', '⏱️ Quick']];

/** Every training day of the week with its full exercise list, so nothing is hidden behind a tap. Gym on the left, the matching home move under it. */
function WeekOverview({ program, onPick }: { program: any; onPick: (i: number) => void }) {
  const { S, colors } = useThemedStyles();
  const [home, setHome] = useState(false);
  const trainDays = program.week.map((d: any, i: number) => ({ d, i })).filter(({ d }: any) => d.kind === 'train' && d.sessionId);
  const hasHome = program.sessions.some((x: any) => x.homeBackup);
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15 }}>Your {trainDays.length} training day{trainDays.length === 1 ? '' : 's'} this week</Text>
      {hasHome && <View style={{ flexDirection: 'row', marginTop: 6 }}><Chip small label="🏋️ Gym" active={!home} onPress={() => setHome(false)} /><Chip small label="🏠 Home match" active={home} onPress={() => setHome(true)} /></View>}
      {trainDays.map(({ d, i }: any) => {
        const s = program.sessions.find((x: any) => x.id === d.sessionId);
        if (!s) return null;
        const list = home && s.homeBackup ? s.homeBackup.exercises : s.exercises;
        return (
          <TouchableOpacity key={d.day} onPress={() => onPick(i)} accessibilityRole="button" accessibilityLabel={`${d.day}: ${s.title}. Open this day`} style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: colors.primarySoft }}>
            <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 14 }}>{d.day} · {s.title}{s.light ? ' (light)' : ''}</Text>
            <Text style={[S.muted, { marginBottom: 4 }]}>{list.length} exercises · about {home && s.homeBackup ? s.homeBackup.minutes : s.minutes} min · {(s.focus || []).slice(0, 4).map(cap).join(', ')}</Text>
            {list.map((e: any, n: number) => <Text key={e.id} style={{ color: colors.ink, fontSize: 12.5, lineHeight: 18 }}>{n + 1}. {e.name} · {e.sets} × {e.reps}</Text>)}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const DAY_ICON: Record<string, string> = { train: '💪', active: '🚶', rest: '😴' };

/** "This week": how you are doing, what changed and why, and what you can accept with one tap. */
export function AdaptCard({ adapt, onApply, busy }: { adapt: any; onApply: (c: any) => void; busy?: boolean }) {
  const { S, colors } = useThemedStyles();
  if (!adapt) return null;
  const b = adapt.body;
  return (
    <View style={S.card}>
      <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 17 }}>{adapt.status.headline}</Text>
      <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 4 }}>{adapt.status.detail}</Text>
      <Note t={`${adapt.phase.name}. ${adapt.phase.why}`} />
      <Text style={[S.muted, { marginTop: 8 }]}>{adapt.todayPlan.text}</Text>
      {adapt.changes.length > 0 && <Toggle label="What changed this week, and why">{adapt.changes.map((c: any) => <Item key={c.id} title={c.title} sub={c.detail} />)}</Toggle>}
      {adapt.suggestions.map((sg: any) => (
        <View key={sg.id} style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: sg.level === 'alert' ? '#d6455a22' : colors.primarySoft }}>
          <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 14 }}>{sg.title}</Text>
          <Text style={[S.muted, { marginTop: 3 }]}>{sg.detail} {sg.why}</Text>
          {!!sg.apply && <TouchableOpacity disabled={busy} onPress={() => onApply(sg.apply)} accessibilityRole="button" style={{ marginTop: 8, alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: colors.primary, paddingVertical: 7, paddingHorizontal: 14 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Yes, update my plan</Text></TouchableOpacity>}
        </View>
      ))}
      <Toggle label="Is it working?">
        <Text style={S.muted}>{b.detail}</Text>
        {b.ratePerWeekKg !== null && <Text style={[S.muted, { marginTop: 4 }]}>Weight trend: {b.ratePerWeekKg > 0 ? '+' : ''}{b.ratePerWeekKg} kg a week{b.waistChangeCm !== null ? ` · waist ${b.waistChangeCm > 0 ? '+' : ''}${b.waistChangeCm} cm over 5 weeks` : ''}{b.liftsTracked ? ` · ${b.liftsProgressing} of ${b.liftsTracked} lifts moving up` : ''}</Text>}
        <Text style={[S.muted, { marginTop: 4 }]}>Cardio this week: {adapt.cardio.doneMin} of {adapt.cardio.targetMin} minutes (builds toward {adapt.cardio.fullTargetMin}).</Text>
      </Toggle>
    </View>
  );
}

/** The Workout tab. Pick a day (today is already chosen), pick where you are, follow the list, log your sets, finish. */
export function Workout({ program, adapt, onLog, onApplySuggestion, busy }: { program: any; adapt?: any; onLog: (p: any) => Promise<boolean>; onApplySuggestion: (c: any) => void; busy?: boolean }) {
  const { S, colors } = useThemedStyles();
  const today = (new Date().getDay() + 6) % 7; // Monday = 0
  const [day, setDay] = useState<number>(today);
  const [way, setWay] = useState<string>('gym');
  const [logs, setLogs] = useState<Record<string, any[]>>({});
  const [feel, setFeel] = useState('good');
  const [pain, setPain] = useState<string[]>([]);
  const [skip, setSkip] = useState(false);
  const [swapPref, setSwapPref] = useState<Record<string, any>>({}); // original id -> chosen swap, kept on this phone
  const [swapToday, setSwapToday] = useState<Record<string, any>>({});
  const [skipEx, setSkipEx] = useState<string[]>([]);
  useEffect(() => { AsyncStorage.getItem('bp_swap_pref').then((v) => { if (v) setSwapPref(JSON.parse(v) || {}); }).catch(() => {}); }, []);
  const savePref = (m: Record<string, any>) => { setSwapPref(m); AsyncStorage.setItem('bp_swap_pref', JSON.stringify(m)).catch(() => {}); };
  const d = program.week[day] || program.week[0];
  const s = program.sessions.find((x: any) => x.id === d.sessionId);
  const ways: [string, string][] = program.place === 'home' ? [['gym', '🏠 Home'], ['quick', '⏱️ Quick']] : WAYS.filter(([id]) => id !== 'home' || (s && s.homeBackup));
  const base = !s ? [] : way === 'home' && s.homeBackup ? s.homeBackup.exercises : way === 'quick' ? s.quick.exercises : s.exercises;
  const picks: Record<string, any> = { ...swapPref, ...swapToday };
  const shown = base.map((e: any) => { const p = way === 'gym' ? picks[e.id] : null; return p && p.id !== e.id ? { ...e, id: p.id, name: p.name, cue: p.cue || e.cue, kind: p.kind, next: undefined, swaps: undefined, form: undefined, weightHint: undefined, swappedFrom: e.name, origId: e.id } : e; });
  const list = shown.filter((e: any) => !skipEx.includes(e.id));
  const swapTo = (e: any, x: any, always: boolean) => { const o = e.origId || e.id; const v = { id: x.id, name: x.name, cue: x.cue, kind: x.kind }; setSwapToday((m) => ({ ...m, [o]: v })); if (always) savePref({ ...swapPref, [o]: v }); };
  const swapReset = (e: any) => { const o = e.origId; setSwapToday((m) => ({ ...m, [o]: { id: o } })); const m = { ...swapPref }; delete m[o]; savePref(m); };
  const todayStr = ymd(new Date());
  const isFuture = !!d.date && d.date > todayStr;
  const finished = d.status === 'done' || d.status === 'extra' || d.status === 'partial';
  const canLog = !!s && !finished && !isFuture;
  const setRows = (id: string, r: any[]) => setLogs((x) => ({ ...x, [id]: r }));
  const rowsFor = (e: any) => logs[e.id] || Array.from({ length: e.setsToday || e.sets || 1 }, () => ({ weightKg: e.next && e.next.weightKg ? String(e.next.weightKg) : '', reps: e.next && e.next.action !== 'start' ? String(e.next.reps) : '' }));
  const submit = async () => {
    const exercises = list.map((e: any) => ({ id: e.id, name: e.name, slot: e.slot, sets: rowsFor(e).map((r: any) => ({ reps: e.unit === 'seconds' ? 0 : Number(r.reps) || 0, seconds: e.unit === 'seconds' ? Number(r.reps) || 0 : 0, weightKg: Number(r.weightKg) || 0 })).filter((r: any) => r.reps > 0 || r.seconds > 0) })).filter((e: any) => e.sets.length);
    const st = exercises.length >= Math.ceil(list.length * 0.6) ? 'done' : 'partial';
    const ok = await onLog({ date: d.date && d.date <= todayStr ? d.date : todayStr, today: todayStr, sessionId: d.sessionId, title: s ? s.title : '', way, status: st, feel, pain, phase: adapt ? adapt.phase.key : '', minutes: s ? (way === 'quick' ? s.quick.minutes : s.minutes) : 0, exercises });
    if (ok) { setLogs({}); setPain([]); setSkip(false); }
  };
  const skipWith = async (reason: string) => {
    const ok = await onLog({ date: todayStr, today: todayStr, sessionId: d.sessionId, title: s ? s.title : '', way, status: 'skipped', reason, phase: adapt ? adapt.phase.key : '', exercises: [] });
    if (ok) setSkip(false);
  };
  return (
    <View>
      <AdaptCard adapt={adapt} onApply={onApplySuggestion} busy={busy} />
      <View style={S.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {program.week.map((x: any, i: number) => (
            <TouchableOpacity key={x.day} onPress={() => setDay(i)} accessibilityRole="button" accessibilityLabel={`${x.day}: ${x.label}${x.status ? `, ${x.status}` : ''}`}
              style={{ flex: 1, marginHorizontal: 2, paddingVertical: 8, borderRadius: 12, alignItems: 'center', borderWidth: i === day ? 2 : 1, borderColor: i === day ? colors.primary : colors.cardBorder, backgroundColor: x.kind === 'train' ? colors.primarySoft : 'transparent', opacity: x.status === 'notdone' || x.status === 'spare' ? 0.65 : 1 }}>
              <Text style={[S.muted, { fontSize: 10.5 }]}>{i === today ? 'Today' : x.day}</Text>
              <Text style={{ fontSize: 19 }}>{x.kind === 'train' && STATUS_ICON[x.status] ? STATUS_ICON[x.status] : DAY_ICON[x.kind]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[S.muted, { marginTop: 6 }]}>✅ done  💪 gym day  ○ not done (it slides along)  🚶 cardio  😴 rest</Text>
        {!!d.statusNote && <Note t={d.statusNote} />}
        <WeekOverview program={program} onPick={setDay} />

        {!s && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 17 }}>{d.kind === 'active' ? 'Easy cardio day' : 'Rest day'}</Text>
            <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{program.active.restDay}</Text>
            <Note t={`${program.active.minimumDay.title}. ${program.active.minimumDay.detail}`} />
            <H t="Ideas for today" />
            {program.active.menu.slice(0, 4).map((m: any) => <Item key={m.id} title={`${m.name} · about ${m.kcal30} kcal in 30 min`} sub={m.tip} />)}
          </View>
        )}

        {!!s && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 17 }}>{s.title}{finished ? ' ✅' : ''}</Text>
            <Text style={[S.muted, { marginTop: 2 }]}>{way === 'quick' ? `${s.quick.minutes} minutes. ${s.quick.format}` : way === 'home' ? `${s.homeBackup.minutes} minutes. ${s.homeBackup.note}` : `About ${s.minutes} minutes. Do them in this order.`}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {ways.map(([id, label]) => <Chip key={id} small label={label} active={way === id} onPress={() => setWay(id)} />)}
            </View>
            {way === 'gym' && <Toggle label="Warm-up (about 8 minutes)">{s.warmup.map((t: string, i: number) => <Line key={i} t={t} />)}</Toggle>}
            <View style={{ marginTop: 10 }}>{shown.map((e: any) => skipEx.includes(e.id)
              ? <Text key={e.id} style={[S.muted, { marginBottom: 10 }]}>{e.name} skipped today. <Text onPress={() => setSkipEx((x) => x.filter((y) => y !== e.id))} style={{ color: colors.primary, fontWeight: '700' }}>Undo</Text></Text>
              : <Exercise key={e.id} e={e} n={list.indexOf(e) + 1} showSwaps={way === 'gym'} rows={canLog ? rowsFor(e) : null} setRows={setRows} canLog={canLog} onSwap={canLog && way !== 'quick' ? swapTo : undefined} onSkip={(x) => setSkipEx((v) => [...v, x.id])} onReset={swapReset} />)}</View>
            {way === 'gym' && <Toggle label="Cool-down">{s.cooldown.map((t: string, i: number) => <Line key={i} t={t} />)}</Toggle>}
            {way === 'gym' && <Toggle label="Gym is busy?">{program.busyGym.map((t: string, i: number) => <Line key={i} t={t} />)}</Toggle>}
            {canLog && (
              <View style={{ marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <H t="How did it feel?" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{FEEL.map(([id, l]) => <Chip key={id} small label={l} active={feel === id} onPress={() => setFeel(id)} />)}</View>
                <H t="Anything sore or odd? (optional)" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{PAIN.map(([id, l]) => <Chip key={id} small label={l} active={pain.includes(id)} onPress={() => setPain((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))} />)}</View>
                <TouchableOpacity disabled={busy} onPress={submit} accessibilityRole="button" style={{ marginTop: 10, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', opacity: busy ? 0.6 : 1 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{busy ? 'Saving…' : '✔ Finish and log this session'}</Text></TouchableOpacity>
                {!skip ? <TouchableOpacity onPress={() => setSkip(true)} accessibilityRole="button" style={{ marginTop: 10, alignSelf: 'center' }}><Text style={{ color: colors.muted, fontWeight: '700' }}>Not today</Text></TouchableOpacity> : (
                  <View style={{ marginTop: 8 }}><Text style={S.muted}>That is fine. Pick a reason so the plan adjusts the week:</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>{REASONS.map(([id, l]) => <Chip key={id} small label={l} onPress={() => skipWith(id)} />)}</View></View>
                )}
              </View>
            )}
            {isFuture && <Text style={[S.muted, { marginTop: 8 }]}>This session is planned for {d.day}. You can log it on the day.</Text>}
          </View>
        )}
      </View>
    </View>
  );
}

export function ActiveDays({ program }: { program: any }) {
  const { S } = useThemedStyles();
  const a = program.active, c = program.cardio;
  const lines = [
    `Easy cardio: ${c.easy.perWeek} sessions of ${c.easy.minutes} minutes a week (about ${c.weeklyEasyMinutes} minutes)${c.startMinutes < c.weeklyEasyMinutes ? `. Start at ${c.startMinutes} and add 10 minutes a week.` : '.'}`,
    `Easy pace: ${c.easy.talkTest} Roughly ${c.easy.zoneBpm[0]} to ${c.easy.zoneBpm[1]} beats a minute (maximum about ${c.maxHeartRateBpm}).`,
    c.intervals ? `Intervals: ${c.intervals.perWeek} a week. ${c.intervals.format}` : c.intervalsNote,
    `Steps: ${Number(c.steps).toLocaleString()} a day.`,
    ...c.notes,
  ].filter(Boolean);
  return (
    <View>
      <Text style={S.muted}>{a.restDay}</Text>
      <Note t={`${a.minimumDay.title}. ${a.minimumDay.detail}`} />
      <H t="Choose an activity" />
      <Text style={[S.muted, { marginBottom: 8 }]}>Calories are for 30 minutes at your weight. A guide, not a promise.</Text>
      {a.menu.map((m: any) => <Item key={m.id} title={`${m.name} · about ${m.kcal30} kcal · ${m.intensity}`} sub={m.tip} />)}
      <H t="Cardio plan" />
      {lines.map((t: string, i: number) => <Line key={i} t={t} />)}
    </View>
  );
}

export function Progress({ program }: { program: any }) {
  const { S, colors } = useThemedStyles();
  const p = program.progression;
  return (
    <View>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>{p.method}</Text>
      {p.rules.map((t: string, i: number) => <Line key={i} t={t} />)}
      <H t={`Your first ${p.deloadEveryWeeks} weeks`} />
      {p.phases.map((x: any, i: number) => <Line key={i} t={`Week ${x.weeks}: ${x.name}. ${x.note}`} />)}
      <H t="At home, with no heavier weights" />
      {p.homeLadder.map((t: string, i: number) => <Line key={i} t={t} />)}
      <H t="If you stall" />
      {p.whenStuck.map((t: string, i: number) => <Line key={i} t={t} />)}
      <Text style={S.muted}>{p.track}</Text>
      <H t="Weekly sets per muscle" />
      <Text style={[S.muted, { marginBottom: 6 }]}>Hard sets a week against a sensible range for your level. Helper muscles count half.</Text>
      {program.volume.map((v: any) => (
        <View key={v.group} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ width: 82, color: colors.ink, fontSize: 13 }}>{GROUP[v.group]}</Text>
          <View style={{ flex: 1, height: 8, borderRadius: 6, backgroundColor: colors.chipBg, overflow: 'hidden', marginRight: 8 }}>
            <View style={{ height: 8, borderRadius: 6, width: `${Math.min(100, (v.weeklySets / Math.max(1, v.target[1])) * 100)}%`, backgroundColor: v.status === 'ok' ? '#2aa876' : v.status === 'low' ? '#d9a21b' : '#d9701b' }} />
          </View>
          <Text style={S.muted}>{v.weeklySets} (aim {v.target[0]}–{v.target[1]})</Text>
        </View>
      ))}
    </View>
  );
}

export function Safety({ items }: { items: any[] }) {
  return <View>{items.map((s) => <Item key={s.id} title={s.title} sub={s.detail} />)}</View>;
}
