// Workout planner: plan workouts for any day, a week or a month ahead; move, skip or mark them done. Stored on your account (not only on this phone),
// so the web app shows the same plan. A planned workout shows as done when your own exercise log covers it (Gym log, Workout tab, Exercise page, watch).
// Planning never adds calories. The view logic is shared with the web app (utils/workoutPlanView.ts).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { PlanExercisePicker } from '../components/workout/PlanExercisePicker';
import { useNotifications } from '../components/Notifications';
import { del, get, patch, post } from '../config/api';
import { formatDateLocal } from '../utils/dates';
import { refreshWorkoutReminders } from '../utils/notifications';
import { canStart } from '../utils/planStart';
import { beginPlannedStart } from '../utils/plannedStart';
import { KINDS, WEEKDAYS, addDays, dayState, exercisesToText, itemState, itemsOn, kindMeta, monthGrid, mondayOf, parseExercises, patternFromRows, shiftMonth, weekDays, weekTotals } from '../utils/workoutPlanView';

type Item = { _id: string; date: string; kind: string; title: string; minutes: number; exercises: { name: string; sets: number; reps: number; kg: number }[]; note: string; status: string; movedFrom: string; seriesId: string; matched: boolean; done: boolean };
type Data = { items: Item[]; days: Record<string, { planned: number; done: number; skipped: number; rest: number }> };
type Form = { id?: string; date: string; kind: string; title: string; minutes: string; exercises: string; note: string };
const EMPTY: Omit<Form, 'date'> = { kind: 'strength', title: '', minutes: '', exercises: '', note: '' };
const parseD = (s: string) => new Date(`${s}T00:00:00Z`);
const fmtDay = (s: string) => parseD(s).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });
const fmtShort = (s: string) => parseD(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMonth = (s: string) => parseD(s).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Small({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const { colors } = useThemedStyles();
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: danger ? colors.chipBg : colors.primarySoft, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: danger ? colors.dangerInk : colors.primary, fontWeight: '800', fontSize: 12.5 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function WorkoutPlannerScreen() {
  const { S, colors } = useThemedStyles();
  const { success, error, confirm } = useNotifications();
  const today = formatDateLocal(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [start, setStart] = useState(mondayOf(today));
  const [month, setMonth] = useState(today);
  const [data, setData] = useState<Data>({ items: [], days: {} });
  const [loaded, setLoaded] = useState('');            // the range the data on screen is for; anything else means it is still loading
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [xfer, setXfer] = useState<{ from: string; ids: string[] } | null>(null);   // the copy / move panel: the day and the workouts it is for
  const [xDates, setXDates] = useState<string[]>([]);                                 // the days chosen in that panel
  const [xMore, setXMore] = useState(false);                                      // weeks 3–4 in that panel
  const [ticked, setTicked] = useState<string[]>([]);                                 // workouts ticked on a day
  const [open, setOpen] = useState<string[]>([]);                                     // workouts whose exercise list is unfolded
  const [ahead, setAhead] = useState(false);
  const [rows, setRows] = useState(() => WEEKDAYS.map((_, i) => ({ dow: i + 1, kind: '', title: '', minutes: '' })));
  const [weeks, setWeeks] = useState(4);
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => monthGrid(month), [month]);
  const [from, to] = view === 'week' ? [start, addDays(start, 6)] : [grid.gridStart, grid.gridEnd];

  const load = useCallback(() => get(`/api/workout-plan?from=${from}&to=${to}`)
    .then((j: any) => { if (!j || !j.success) throw new Error('load failed'); setData({ items: j.items, days: j.days }); setLoaded(`${from}|${to}`); setFailed(false); })
    .catch(() => setFailed(true)), [from, to]);
  useEffect(() => { load(); }, [load]);
  const loading = loaded !== `${from}|${to}` && !failed;

  /** One request at a time: a second tap while it runs is ignored. */
  const run = async (fn: () => Promise<any>, okMsg?: string | ((j: any) => string)): Promise<any> => {
    if (busy) return null;
    setBusy(true);
    try { const j = await fn(); if (okMsg) success(typeof okMsg === 'function' ? okMsg(j) : okMsg); await load(); void refreshWorkoutReminders(); return j || {}; }   // done / skipped / moved / added / removed: re-plan the reminders
    catch (e: any) { error('That did not work', e?.message); return null; }
    finally { setBusy(false); }
  };

  const saveForm = async () => {
    const f = form!;
    const fields = { kind: f.kind, title: f.title, minutes: Number(f.minutes) || 0, exercises: parseExercises(f.exercises), note: f.note, today };
    const j = f.id ? await run(() => patch(`/api/workout-plan/${f.id}`, fields), 'Workout updated') : await run(() => post('/api/workout-plan', { ...fields, date: f.date }), 'Workout planned');
    if (j) setForm(null);
  };
  const setStatus = (it: Item, status: string) => run(() => patch(`/api/workout-plan/${it._id}`, { status }));
  const flipDate = (d: string) => setXDates((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]));
  const openXfer = (from: string, ids: string[]) => { setXfer(xfer && xfer.from === from && xfer.ids.join() === ids.join() ? null : { from, ids }); setXDates([]); setXMore(false); };
  const transfer = async (mode: 'copy' | 'move') => {
    if (!xfer || !xDates.length) return;
    const j = await run(() => post('/api/workout-plan/transfer', { ids: xfer.ids, dates: xDates, mode, today }), (x) => {
      const n = (x.copied || 0) + (x.moved || 0);
      return n ? `${mode === 'move' ? 'Moved' : 'Copied'} to ${xDates.length} day${xDates.length === 1 ? '' : 's'}${x.skipped ? ` (${x.skipped} already there)` : ''}` : 'Those days already have this';
    });
    if (j) { setXfer(null); setXDates([]); setTicked([]); }
  };
  const tick = (id: string) => setTicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const fold = (id: string) => setOpen((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const remove = async (it: Item) => { if (await confirm({ title: 'Remove this workout?', message: `${it.title} on ${fmtShort(it.date)}`, confirmText: 'Remove', destructive: true })) run(() => del(`/api/workout-plan/${it._id}`), 'Removed'); };
  const removeSeries = async (it: Item) => { if (await confirm({ title: 'Remove the rest of this repeat?', message: `${it.title} and every repeat from ${fmtShort(it.date)} on`, confirmText: 'Remove all', destructive: true })) run(() => del(`/api/workout-plan/series/${encodeURIComponent(it.seriesId)}?from=${it.date}`), (j) => `Removed ${j.deleted} workouts`); };
  const planAhead = async () => {
    const pattern = patternFromRows(rows);
    if (!pattern.length) { error('Pick a workout for at least one weekday'); return; }
    const j = await run(() => post('/api/workout-plan/repeat', { from: start, weeks, pattern, today }), (x) => `Planned ${x.created} workouts`);
    if (j) setAhead(false);
  };
  const copyWeek = () => run(() => post('/api/workout-plan/copy-week', { fromStart: start, toStart: addDays(start, 7), today }), (x) => (x.copied ? `Copied ${x.copied} workouts to next week${x.alreadyThere ? ` (${x.alreadyThere} already there)` : ''}` : x.alreadyThere ? 'Next week already has these' : 'Nothing to copy'));

  const totals = weekTotals(data.items.filter((i) => i.date >= start && i.date <= addDays(start, 6)));
  const input = { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.card } as const;

  const renderForm = () => !form ? null : (
    <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 14, padding: 12, marginTop: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>{KINDS.map(([k, icon, label]) => <Chip key={k} label={`${icon} ${label}`} active={form.kind === k} onPress={() => setForm({ ...form, kind: k })} small />)}</View>
      {form.kind !== 'rest' && (
        <>
          <Text style={S.muted}>Name (optional)</Text>
          <TextInput style={input} value={form.title} maxLength={80} placeholder={kindMeta(form.kind).label} placeholderTextColor={colors.muted} onChangeText={(t) => setForm({ ...form, title: t })} />
          <Text style={[S.muted, { marginTop: 8 }]}>Minutes (optional)</Text>
          <TextInput style={input} value={form.minutes} keyboardType="number-pad" onChangeText={(t) => setForm({ ...form, minutes: t.replace(/[^0-9]/g, '') })} />
          <PlanExercisePicker key={form.id || `new-${form.date}`} value={form.exercises} onChange={(t) => setForm((f) => (f ? { ...f, exercises: t } : f))} />
          <Text style={[S.muted, { marginTop: 8 }]}>Note (optional)</Text>
          <TextInput style={input} value={form.note} maxLength={300} onChangeText={(t) => setForm({ ...form, note: t })} />
        </>
      )}
      <View style={{ height: 10 }} />
      <Button title={busy ? 'Saving…' : form.id ? 'Save changes' : 'Add to plan'} disabled={busy} onPress={saveForm} />
      <View style={{ height: 8 }} />
      <Button title="Cancel" onPress={() => setForm(null)} />
    </View>
  );

  const renderItem = (it: Item) => {
    const st = itemState(it), meta = kindMeta(it.kind);
    return (
      <View key={it._id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
          <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 15 }}>{it.title}</Text>
          {it.minutes > 0 && <Text style={S.muted}>{it.minutes} min</Text>}
          {st === 'done' && <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>{it.matched ? 'Done · matches your log' : 'Done'}</Text>}
          {st === 'skipped' && <Text style={{ color: colors.dangerInk, fontWeight: '800', fontSize: 12 }}>Skipped</Text>}
          {!!it.movedFrom && <Text style={S.muted}>moved from {fmtShort(it.movedFrom)}</Text>}
        </View>
        {it.exercises.length > 0 && (open.includes(it._id)
          ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Hide exercises" onPress={() => fold(it._id)}>{it.exercises.map((e, i) => <Text key={i} style={[S.muted, { marginLeft: 28 }]}>{e.name}{e.sets && e.reps ? ` · ${e.sets}×${e.reps}` : ''}{e.kg ? ` · ${e.kg} kg` : ''}</Text>)}</TouchableOpacity>
          : <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show ${it.exercises.length} exercises`} onPress={() => fold(it._id)}><Text numberOfLines={1} style={[S.muted, { marginLeft: 28 }]}>{it.exercises.length} exercise{it.exercises.length === 1 ? '' : 's'}: {it.exercises.map((e) => e.name).join(', ')}  ▾</Text></TouchableOpacity>)}
        {!!it.note && <Text style={[S.muted, { marginLeft: 28 }]}>{it.note}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 28 }}>
          {canStart({ ...it, done: it.matched }, today) && <Small label="Start" disabled={busy} onPress={async () => { await beginPlannedStart(it); router.push('/gym-log'); }} />}
          {it.kind !== 'rest' && (it.status === 'planned' && !it.matched
            ? <><Small label="Mark done" disabled={busy} onPress={() => setStatus(it, 'done')} /><Small label="Skip" disabled={busy} onPress={() => setStatus(it, 'skipped')} /></>
            : it.status !== 'planned' ? <Small label="Undo" disabled={busy} onPress={() => setStatus(it, 'planned')} /> : null)}
          {it.date >= today && <Small label="Copy / move" disabled={busy} onPress={() => openXfer(it.date, [it._id])} />}
          {it.date >= today && <Small label={ticked.includes(it._id) ? '☑ Selected' : '☐ Select'} disabled={busy} onPress={() => tick(it._id)} />}
          <Small label="Edit" disabled={busy} onPress={() => setForm({ id: it._id, date: it.date, kind: it.kind, title: it.title, minutes: it.minutes ? String(it.minutes) : '', exercises: exercisesToText(it.exercises), note: it.note })} />
          <Small label="Remove" danger disabled={busy} onPress={() => remove(it)} />
          {!!it.seriesId && <Small label="Remove the rest of this repeat" danger disabled={busy} onPress={() => removeSeries(it)} />}
        </View>
      </View>
    );
  };

  /** Copy / move panel for one day: choose any number of days in the next 4 weeks, then Copy or Move. */
  const renderXfer = (d: string) => {
    if (!xfer || xfer.from !== d) return null;
    const days = Array.from({ length: 28 }, (_, i) => addDays(today, i)).filter((x) => x !== d);
    const sameDay = [7, 14, 21, 28].map((n) => addDays(d, n)).filter((x) => x >= today);
    const chip = (x: string) => <Chip key={x} small label={`${fmtDay(x).slice(0, 3)} ${Number(x.slice(8))}`} active={xDates.includes(x)} onPress={() => flipDate(x)} />;
    return (
      <View style={{ marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft }}>
        <Text style={{ fontWeight: '800', color: colors.ink }}>{xfer.ids.length === 1 ? 'This workout' : `${xfer.ids.length} workouts`} to which days?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{days.slice(0, 14).map(chip)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <Small label={`Same weekday ×${sameDay.length}`} onPress={() => setXDates(sameDay)} />
          <Small label="Next 7 days" onPress={() => setXDates(days.slice(0, 7))} />
          <Small label={xMore ? 'Hide weeks 3–4' : 'More days'} onPress={() => setXMore(!xMore)} />
          {xDates.length > 0 && <Small label="Clear" danger onPress={() => setXDates([])} />}
        </View>
        {xMore && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{days.slice(14).map(chip)}</View>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}><Button title={xDates.length ? `Copy to ${xDates.length}` : 'Copy'} disabled={busy || !xDates.length} onPress={() => transfer('copy')} /></View>
          <View style={{ flex: 1 }}><Button title={xDates.length ? `Move to ${xDates.length}` : 'Move'} disabled={busy || !xDates.length} onPress={() => transfer('move')} /></View>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/workout'))}><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Workout planner</Text>
      <Text style={[S.muted, { marginBottom: 12 }]}>Plan workouts for any day, a week or a month ahead. A workout shows as done when what you logged covers it, or when you mark it. Planning never adds calories. Saved to your account, so the web app shows the same plan.</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><Chip label="Week" active={view === 'week'} onPress={() => setView('week')} /><Chip label="Month" active={view === 'month'} onPress={() => setView('month')} /></View>

      {failed && <View style={S.card}><Text style={S.muted}>Could not load your plan. The server may be waking up.</Text><View style={{ height: 8 }} /><Button title="Try again" onPress={() => { setFailed(false); load(); }} /></View>}

      {view === 'week' && (
        <>
          <View style={[S.between, { marginBottom: 6 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Small label="‹" onPress={() => setStart(addDays(start, -7))} />
              <Text style={{ fontWeight: '800', color: colors.ink }}>{fmtShort(start)} – {fmtShort(addDays(start, 6))}</Text>
              <Small label="›" onPress={() => setStart(addDays(start, 7))} />
            </View>
            {start !== mondayOf(today) && <Small label="This week" onPress={() => setStart(mondayOf(today))} />}
          </View>
          <Text style={[S.muted, { marginBottom: 10 }]}>{loading ? 'Loading…' : totals.planned ? `${totals.done} of ${totals.planned} done${totals.skipped ? ` · ${totals.skipped} skipped` : ''} · ${totals.minutes} min planned` : 'Nothing planned this week yet.'}</Text>
          {weekDays(start).map((d) => {
            const its = itemsOn(data.items, d as any) as Item[], adding = !!form && !form.id && form.date === d;
            return (
              <View key={d} style={[S.card, d === today ? { borderColor: colors.primary, borderWidth: 1.5 } : null]}>
                <View style={S.between}>
                  <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 15 }}>{fmtDay(d)}  <Text style={S.muted}>{fmtShort(d)}{d === today ? ' · today' : ''}</Text></Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {d >= today && its.length > 0 && <Small label={ticked.some((id) => its.some((x) => x._id === id)) ? 'Copy / move ticked' : its.length > 1 ? 'Copy / move day' : 'Copy / move'} disabled={busy} onPress={() => { const t = its.filter((x) => ticked.includes(x._id)).map((x) => x._id); openXfer(d, t.length ? t : its.map((x) => x._id)); }} />}
                    {d >= today && !adding && <Small label="＋ Add" disabled={busy} onPress={() => setForm({ ...EMPTY, date: d })} />}
                  </View>
                </View>
                {its.length === 0 && !adding && <Text style={[S.muted, { marginTop: 6 }]}>{d < today ? 'Nothing was planned.' : 'Nothing planned.'}</Text>}
                {its.map((it) => (form && form.id === it._id ? <View key={it._id}>{renderForm()}</View> : renderItem(it)))}
                {adding && renderForm()}
                {renderXfer(d)}
              </View>
            );
          })}
          <View style={S.card}>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16, marginBottom: 6 }}>Plan ahead</Text>
            {!ahead ? (
              <>
                <Text style={S.muted}>Set up a repeating week and plan the next few weeks in one go, or copy this week to next week.</Text>
                <View style={{ height: 10 }} />
                <Button title="Plan several weeks" onPress={() => setAhead(true)} />
                <View style={{ height: 8 }} />
                <Button title="Copy this week to next week" disabled={busy || !totals.planned} onPress={copyWeek} />
              </>
            ) : (
              <>
                <Text style={S.muted}>Choose what you do on each weekday. It starts with the week shown above (days before today are skipped), and doing it twice never doubles the plan.</Text>
                {rows.map((r, i) => (
                  <View key={r.dow} style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ width: 40, fontWeight: '800', color: colors.ink }}>{WEEKDAYS[i]}</Text>
                      <TextInput style={[input, { width: 70, padding: 8 }]} editable={!!r.kind && r.kind !== 'rest'} placeholder="min" placeholderTextColor={colors.muted} keyboardType="number-pad" value={r.minutes} onChangeText={(t) => setRows(rows.map((x, j) => (j === i ? { ...x, minutes: t.replace(/[^0-9]/g, '') } : x)))} />
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      <Chip small label="—" active={!r.kind} onPress={() => setRows(rows.map((x, j) => (j === i ? { ...x, kind: '' } : x)))} />
                      {KINDS.filter((k) => k[0] !== 'custom').map(([k, icon, label]) => <Chip key={k} small label={`${icon} ${label}`} active={r.kind === k} onPress={() => setRows(rows.map((x, j) => (j === i ? { ...x, kind: k } : x)))} />)}
                    </View>
                  </View>
                ))}
                <Text style={[S.muted, { marginTop: 12 }]}>For how many weeks?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{[1, 2, 3, 4, 6, 8, 12].map((n) => <Chip key={n} small label={`${n}`} active={weeks === n} onPress={() => setWeeks(n)} />)}</View>
                <View style={{ height: 12 }} />
                <Button title={busy ? 'Planning…' : `Plan ${weeks} week${weeks > 1 ? 's' : ''}`} disabled={busy} onPress={planAhead} />
                <View style={{ height: 8 }} />
                <Button title="Cancel" onPress={() => setAhead(false)} />
              </>
            )}
          </View>
        </>
      )}

      {view === 'month' && (
        <View style={S.card}>
          <View style={[S.between, { marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Small label="‹" onPress={() => setMonth(shiftMonth(month, -1))} />
              <Text style={{ fontWeight: '800', color: colors.ink }}>{fmtMonth(grid.first)}</Text>
              <Small label="›" onPress={() => setMonth(shiftMonth(month, 1))} />
            </View>
            {grid.month !== today.slice(0, 7) && <Small label="This month" onPress={() => setMonth(today)} />}
          </View>
          <View style={{ flexDirection: 'row' }}>{WEEKDAYS.map((w) => <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: '800', color: colors.muted }}>{w}</Text>)}</View>
          {grid.weeks.map((wk, wi) => (
            <View key={wi} style={{ flexDirection: 'row' }}>
              {wk.map((d) => {
                const ds = dayState(data.days[d]);
                return (
                  <TouchableOpacity key={d} accessibilityRole="button" accessibilityLabel={`${fmtShort(d)}${ds ? `, ${ds}` : ''}`} onPress={() => { setStart(mondayOf(d)); setView('week'); }}
                    style={{ flex: 1, height: 46, margin: 2, borderRadius: 12, borderWidth: d === today ? 1.5 : 1, borderColor: d === today ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center', opacity: d.slice(0, 7) !== grid.month ? 0.4 : 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>{Number(d.slice(8))}</Text>
                    <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 3, borderWidth: ds ? 2 : 0, borderColor: ds === 'skipped' ? colors.dangerInk : ds === 'rest' ? colors.muted : colors.primary, backgroundColor: ds === 'done' || ds === 'part' ? colors.primary : 'transparent', opacity: ds === 'skipped' ? 0.6 : 1 }} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <Text style={[S.muted, { marginTop: 10 }]}>Filled = done · half = partly · ring = planned · grey ring = rest. Tap a day to open its week.</Text>
        </View>
      )}
    </Screen>
  );
}
