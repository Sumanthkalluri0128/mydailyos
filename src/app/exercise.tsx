import { ShowMoreButton, useShowMore } from '../components/ShowMore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, RefreshControl, ScrollView, Text, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { today } from '../config/api';
import { refreshWorkoutReminders } from '../utils/notifications';
import { write, newClientId, useOffline, read } from '../utils/offline';
import { Button, Field, Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { useNotifications } from '../components/Notifications';
import { successHaptic } from '../utils/haptics';
import { useProfile } from '../hooks/useProfile';
import { addDays, prettyDate } from '../utils/dates';
import { estimateBurn, stepCalories } from '../utils/energy';
import { useSteps } from '../hooks/useSteps';
import { RestTimer } from '../components/RestTimer';
import { fmtEnergy } from '../utils/units';
import { useGymSynced } from '../utils/gymSyncRunner';
import { BuddyEmpty } from '../motion/Buddy';
import Training, { WorkoutMode, type WorkoutPlan } from '../components/Training';
// ONE logger: the same screen as the Gym log (sets x reps x weight, seconds for holds, minutes + pace for cardio). What is logged here is counted once in Exercise and Home.
import { LogTab } from './gym-log';
import { useGymStore } from '../utils/gymStore';
import { editRequest } from '../utils/logEdit';
import { patchRow } from '../utils/logEditLocal';

type Activity = { _id: string; name: string; category: string; met: number };
type TemplateItem = { activityId: string; activityName: string; durationMinutes: number; targetSets?: number; targetReps?: number; targetWeightKg?: number; restSec?: number };
type Template = { _id: string; name: string; notes?: string; items: TemplateItem[] };

export default function Exercise() {
  const { error, warning, success, undoableDelete } = useNotifications();
  const { S, colors } = useThemedStyles();
  const { syncVersion } = useOffline();
  const { profile, units, goals } = useProfile();
  const stepper = useSteps();
  const [tab, setTab] = useState<'log' | 'templates' | 'train'>('log');
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [a, setA] = useState<Activity[]>([]);
  const [bq, setBq] = useState('');
  const [bcat, setBcat] = useState('Strength');
  // Template builder list: grouped (Strength first), A-Z inside a group; typing searches every group. (Before: one 160 px strip of every activity, unsorted by group.)
  const FIRST = ['Strength', 'Cardio', 'HIIT', 'Walking', 'Running', 'Cycling', 'Swimming', 'Mind & Mobility', 'Cult.fit', 'Sports', 'Outdoor'];
  const builderCats = useMemo(() => [...new Set(a.map((x: any) => x.category || 'Other'))].sort((x: string, y: string) => (FIRST.indexOf(x) < 0 ? 99 : FIRST.indexOf(x)) - (FIRST.indexOf(y) < 0 ? 99 : FIRST.indexOf(y)) || x.localeCompare(y)), [a]);
  const builderList = useMemo(() => { const n = bq.trim().toLowerCase(); return a.filter((x: any) => (n ? `${x.name} ${x.category}`.toLowerCase().includes(n) : (x.category || 'Other') === (builderCats.includes(bcat) ? bcat : builderCats[0]))).sort((x: any, y: any) => x.name.localeCompare(y.name)); }, [a, bq, bcat]);
  const [l, setL] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [id, setId] = useState('');
  const [min, setMin] = useState('');
  const [wt, setWt] = useState('');
  const [sets, setSets] = useState<{ reps: string; kg: string }[]>([]); // optional strength sets
  const [records, setRecords] = useState<any[]>([]);
  const [cal, setCal] = useState('');        // calories burned typed by the person (optional)
  const [timeOnly, setTimeOnly] = useState(false); // the old minutes-only form, folded away by default
  const gym = useGymStore();
  const [aq, setAq] = useState('');
  const [browse, setBrowse] = useState(false);          // activity search
  const [history, setHistory] = useState<any[]>([]);
  const [historyDays, setHistoryDays] = useState(14);
  const [refreshing, setRefreshing] = useState(false);

  const [builder, setBuilder] = useState<{ name: string; items: TemplateItem[] } | null>(null);
  const [builderId, setBuilderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [x, y, z, h] = await Promise.all([
        read<any>('/api/activities'), read<any>(`/api/activities/logs?date=${today()}`), read<any>('/api/templates'),
        read<any>(`/api/activities/logs?from=${addDays(today(), -(historyDays - 1))}&to=${today()}`).catch(() => ({ logs: [] })),
      ]);
      setA(x.activities || []);
      setL(y.logs || []);
      setTemplates(z.templates || []);
      setHistory(h.logs || []);
      read<any>('/api/activities/records').then((r) => setRecords(r.records || [])).catch(() => {});
    } catch (e: any) { error('Something went wrong', e.message); } finally { setRefreshing(false); }
  }, [error, historyDays]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (syncVersion > 0) load(); }, [syncVersion]);
  useGymSynced(load); // gym log exercises just reached the server: show them (and their calories) here

  const add = async () => {
    if (!id || +min <= 0) return warning('Missing exercise details', 'Choose an activity and enter a duration.');
    const manual = cal.trim() === '' ? undefined : Number(cal.replace(',', '.'));
    if (manual !== undefined && !(manual >= 0)) return warning('Invalid calories', 'Calories burned must be a number, or leave it blank to auto-estimate.');
    try {
      const r = await write('POST', '/api/activities/logs', { activityId: id, date: today(), durationMinutes: +min, weightKg: +wt || undefined, caloriesBurned: manual, sets: sets.filter((x) => +x.reps > 0).map((x) => ({ reps: Math.round(+x.reps), weightKg: +x.kg || 0 })), clientId: newClientId('ex') }, 'Exercise log', { activityName: chosen?.name, category: chosen?.category, caloriesBurned: manual ?? estimate });
      successHaptic();
      setId(''); setMin(''); setCal(''); setSets([]);
      success(r.queued ? 'Saved offline' : 'Saved', r.queued ? 'Will sync once you\u2019re back online.' : 'Exercise logged.');
      load();
      void refreshWorkoutReminders();   // a logged exercise can make a planned workout done: no reminder for it
    } catch (e: any) { error('Something went wrong', e.message); }
  };

  // Fix a logged workout: minutes, calories, day, note. Only what changed is sent, so a note-only edit cannot reset calories typed by hand.
  type EditForm = { id: string; minutes: string; kcal: string; kcalTouched: boolean; notes: string; date: string; orig: { durationMinutes: number; caloriesBurned: number; notes: string; date: string } };
  const [editLog, setEditLog] = useState<EditForm | null>(null);
  const startEdit = (x: any) => setEditLog({ id: x._id, minutes: String(x.durationMinutes), kcal: String(Math.round(x.caloriesBurned)), kcalTouched: false, notes: x.notes || '', date: x.date || today(), orig: { durationMinutes: x.durationMinutes, caloriesBurned: x.caloriesBurned, notes: x.notes || '', date: x.date || today() } });
  const saveEdit = async () => {
    const e = editLog; if (!e) return;
    const r = editRequest(e.orig, e, addDays(today(), 1));
    if (!r.ok) return warning('Check the details', r.error);
    if (!r.changed) { setEditLog(null); return; }
    const before = l;
    try {
      const res = await write('PATCH', `/api/activities/logs/${e.id}`, r.body, 'Edit workout');
      setEditLog(null);
      setL((cur) => cur.map((y) => (y._id === e.id ? patchRow(y, r.body) : y)).filter((y) => !y.date || y.date === today()));   // shown at once; the refresh below brings the server's copy
      successHaptic();
      success(res.queued ? 'Saved offline' : 'Workout updated', res.queued ? 'Will sync once you\u2019re back online.' : undefined);
      load();
      void refreshWorkoutReminders();
    } catch (err: any) { setL(before); error('Could not save the change', err.message); }
  };

  const removeLog = async (logId: string) => {
    const before = l;
    setL((cur) => cur.filter((y) => y._id !== logId));
    undoableDelete('Workout removed', async () => {
      try { await write('DELETE', `/api/activities/logs/${logId}`, undefined, 'Delete workout'); load(); void refreshWorkoutReminders(); }
      catch (e: any) { setL(before); error('Delete failed', e.message); }
    }, () => setL(before));
  };

  const logTemplate = async (t: Template) => {
    try {
      const r = await write('POST', `/api/templates/${t._id}/log`, { date: today(), weightKg: +wt || undefined, clientId: newClientId('tpl') }, `Template: ${t.name}`);
      successHaptic();
      success(r.queued ? 'Saved offline' : 'Logged', r.queued ? 'Will sync once you\u2019re back online.' : `"${t.name}" — ${t.items.length} exercises logged.`);
      load();
    } catch (e: any) { error('Could not log workout', e.message); }
  };

  const deleteTemplate = async (t: Template) => {
    const before = templates;
    setTemplates((cur) => cur.filter((x) => x._id !== t._id));
    undoableDelete(`"${t.name}" removed`, async () => {
      try { await write('DELETE', `/api/templates/${t._id}`, undefined, 'Delete template'); load(); }
      catch (e: any) { setTemplates(before); error('Delete failed', e.message); }
    }, () => setTemplates(before));
  };

  const openNewTemplate = () => { setBuilder({ name: '', items: [] }); setBuilderId(null); };
  const openEditTemplate = (t: Template) => { setBuilder({ name: t.name, items: t.items.map((i) => ({ ...i })) }); setBuilderId(t._id); };
  const addItemToBuilder = (act: Activity) => {
    if (!builder) return;
    setBuilder({ ...builder, items: [...builder.items, { activityId: act._id, activityName: act.name, durationMinutes: 15, targetSets: 3, targetReps: 10 }] });
  };
  const removeItemFromBuilder = (idx: number) => {
    if (!builder) return;
    setBuilder({ ...builder, items: builder.items.filter((_, i) => i !== idx) });
  };
  const setItemField = (idx: number, key: 'targetSets' | 'targetReps' | 'targetWeightKg' | 'restSec', raw: string) => {
    if (!builder) return;
    const items = [...builder.items];
    const n = raw.trim() === '' ? undefined : Number(raw.replace(',', '.'));
    items[idx] = { ...items[idx], [key]: n !== undefined && n >= 0 ? n : undefined };
    setBuilder({ ...builder, items });
  };
  const startTemplate = (t: Template) => setPlan({
    title: t.name, who: 'goku', scene: 'lift', template: { _id: t._id },
    exercises: t.items.map((i) => ({ name: i.activityName, sets: i.targetSets || 3, reps: i.targetReps || '', weightKg: i.targetWeightKg ?? 0, restSec: i.restSec, type: /plank|hold/i.test(i.activityName) ? 'hold' : 'reps' })),
  });
  const setItemDuration = (idx: number, minutes: string) => {
    if (!builder) return;
    const items = [...builder.items];
    items[idx] = { ...items[idx], durationMinutes: Number(minutes) || 0 };
    setBuilder({ ...builder, items });
  };

  const saveTemplate = async () => {
    if (!builder) return;
    if (!builder.name.trim()) return warning('Name your template', 'e.g. "Push day".');
    if (!builder.items.length) return warning('Add exercises', 'A template needs at least one exercise.');
    if (builder.items.some((i) => !(i.durationMinutes > 0))) return warning('Missing durations', 'Every exercise needs a duration.');
    const body = { name: builder.name.trim(), items: builder.items.map((i) => ({ activityId: i.activityId, durationMinutes: i.durationMinutes, targetSets: i.targetSets, targetReps: i.targetReps, targetWeightKg: i.targetWeightKg, restSec: i.restSec })) };
    try {
      if (builderId) await write('PUT', `/api/templates/${builderId}`, body, `Template: ${body.name}`);
      else await write('POST', '/api/templates', body, `Template: ${body.name}`);
      success('Saved', 'Workout template saved.');
      setBuilder(null);
      load();
    } catch (e: any) { error('Save failed', e.message); }
  };

  const workoutBurned = l.reduce((t, x) => t + Number(x.caloriesBurned || 0), 0);
  const stepBurned = stepCalories(stepper.steps, profile?.currentWeightKg);
  const burnedToday = workoutBurned + stepBurned;
  const minutesToday = l.reduce((t, x) => t + Number(x.durationMinutes || 0), 0);
  const chosen = a.find((x) => x._id === id);
  const weightForEstimate = +wt || profile?.currentWeightKg || 70;
  const estimate = chosen && +min > 0 ? estimateBurn(chosen.met, weightForEstimate, +min) : 0;
  const shownActivities = a.filter((x) => !aq.trim() || `${x.name} ${x.category}`.toLowerCase().includes(aq.trim().toLowerCase())).slice(0, 40);
  const byDay = history.reduce((m: Record<string, any[]>, x) => { (m[x.date] = m[x.date] || []).push(x); return m; }, {});
  const historyDates = Object.keys(byDay).sort().reverse();
  const hist = useShowMore(historyDates, 3);
  const burnedInHistory = history.reduce((t, x) => t + Number(x.caloriesBurned || 0), 0);

  return (
    <Screen buddyWho="goku" buddy="lift" buddySays="Let's lift!" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Exercise</Text>
      <Text style={S.sub}>Log workouts and calories burned.</Text>

      <View style={{ flexDirection: 'row', marginBottom: 16 }}>
        <Chip label="Log" active={tab === 'log'} onPress={() => setTab('log')} />
        <Chip label={`Templates (${templates.length})`} active={tab === 'templates'} onPress={() => setTab('templates')} />
        <Chip label="Training" active={tab === 'train'} onPress={() => setTab('train')} />
      </View>

      {tab === 'train' && <Training onLogged={load} />}

      {tab === 'log' ? (
        <>
          {!!templates.length && (
            <View style={{ marginBottom: 14 }}>
              <Text style={S.label}>One-tap workouts</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {templates.map((t) => (
                  <TouchableOpacity key={t._id} onPress={() => logTemplate(t)} style={{ backgroundColor: colors.primarySoft, borderRadius: 16, padding: 14, marginRight: 10, minWidth: 140 }}>
                    <Text style={{ fontWeight: '800', color: colors.primary }}>{t.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{t.items.length} exercises · {t.items.reduce((s, i) => s + i.durationMinutes, 0)} min</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 4, color: colors.ink }}>Log an exercise</Text>
          <Text style={[S.muted, { marginBottom: 8 }]}>Lifts take sets, reps and weight. Holds take seconds. Cardio takes minutes and pace. Pick one and the form changes to match.</Text>
          {gym.ready ? <LogTab /> : <Text style={S.muted}>Loading…</Text>}
          <TouchableOpacity accessibilityRole="button" onPress={() => setTimeOnly((v) => !v)} style={{ minHeight: 44, justifyContent: 'center', marginVertical: 6 }}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>{timeOnly ? 'Hide' : 'Log by time only (yoga, sports, anything without sets)'} {timeOnly ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          {timeOnly && (
          <View style={S.card}>
            <Field label="Find an activity" value={aq} onChangeText={setAq} placeholder="Running, cycling..." />
            {/* The activity list appears only while you type or tap Browse; the chosen activity stays visible as one row. */}
            {!!chosen && !aq.trim() && !browse && (
              <TouchableOpacity accessibilityRole="button" onPress={() => setBrowse(true)} style={[S.item, { backgroundColor: colors.primarySoft }]}>
                <Text style={{ fontWeight: '800', color: colors.ink }}>{chosen.name}  ✓</Text>
                <Text style={S.muted}>Tap to change the activity</Text>
              </TouchableOpacity>
            )}
            {!chosen && !aq.trim() && !browse && (
              <TouchableOpacity accessibilityRole="button" onPress={() => setBrowse(true)} style={{ minHeight: 44, justifyContent: 'center', marginBottom: 8 }}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>Browse all activities ⌄</Text>
              </TouchableOpacity>
            )}
            {(!!aq.trim() || browse) && shownActivities.map((x) => (
              <TouchableOpacity key={x._id} onPress={() => { setId(x._id); setBrowse(false); setAq(''); }} style={[S.item, id === x._id && { backgroundColor: colors.primarySoft }]}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{x.name}{id === x._id ? '  ✓' : ''}</Text>
                <Text style={S.muted}>{x.category || 'General'} · MET {x.met}</Text>
              </TouchableOpacity>
            ))}
            {(!!aq.trim() || browse) && !shownActivities.length && <Text style={[S.muted, { marginBottom: 12 }]}>No activity matches “{aq}”.</Text>}
            <Field label="Duration (minutes)" value={min} onChangeText={setMin} keyboardType="numeric" />
            <Field label="Calories burned (optional)" value={cal} onChangeText={setCal} keyboardType="decimal-pad" placeholder={estimate ? `Auto: about ${Math.round(estimate)}` : 'Leave blank to auto-estimate'} />
            {!!estimate && cal.trim() === '' && <Text style={[S.muted, { marginTop: -6, marginBottom: 12 }]}>Estimated {Math.round(estimate)} kcal from {chosen?.name} · {min} min · {weightForEstimate} kg. Type your own number (e.g. from a watch) to override.</Text>}
            <Text style={S.label}>Sets (optional — for strength training)</Text>
            {sets.map((st, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Text style={{ width: 52, color: colors.muted, fontWeight: '700' }}>Set {i + 1}</Text>
                <View style={{ flex: 1 }}><Field label="Reps" value={st.reps} onChangeText={(v) => setSets((a) => a.map((x, j) => (j === i ? { ...x, reps: v } : x)))} keyboardType="numeric" /></View>
                <View style={{ flex: 1 }}><Field label="Weight (kg)" value={st.kg} onChangeText={(v) => setSets((a) => a.map((x, j) => (j === i ? { ...x, kg: v } : x)))} keyboardType="decimal-pad" /></View>
                <TouchableOpacity onPress={() => setSets((a) => a.filter((_, j) => j !== i))} accessibilityLabel={`Remove set ${i + 1}`}><Text style={S.delete}>✕</Text></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setSets((a) => [...a, { reps: a.length ? a[a.length - 1].reps : '', kg: a.length ? a[a.length - 1].kg : '' }])} style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>+ Add set</Text>
            </TouchableOpacity>
            {sets.length > 0 && <RestTimer />}
            <Field label="Weight override (kg, optional)" value={wt} onChangeText={setWt} keyboardType="decimal-pad" />
            <Button title="Log Exercise" onPress={add} />
          </View>
          )}
          <View style={{ backgroundColor: colors.primarySolid, borderRadius: 22, padding: 20, marginBottom: 14 }}>
            <Text style={{ color: '#DCD4FF', fontSize: 12, fontWeight: '800' }}>BURNED TODAY</Text>
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4 }}>{fmtEnergy(burnedToday, units.energy)}</Text>
            <Text style={{ color: '#E8E3FF', marginTop: 2 }}>{Math.round(workoutBurned)} kcal workouts + {stepBurned} kcal from {stepper.steps.toLocaleString()} steps</Text>
            <Text style={{ color: '#E8E3FF', marginTop: 2 }}>{minutesToday} min across {l.length} workout{l.length === 1 ? '' : 's'}</Text>
            <View style={{ marginTop: 14, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, height: 10, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, ((minutesToday) / (goals?.exerciseMinutesTarget || 30)) * 100)}%`, height: '100%', backgroundColor: '#fff', borderRadius: 10 }} />
            </View>
            <Text style={{ color: '#E8E3FF', fontSize: 12, marginTop: 6 }}>{minutesToday} / {goals?.exerciseMinutesTarget || 30} min goal</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 12, color: colors.ink }}>Today's Workouts</Text>
          {l.length ? l.filter((x) => x.source !== 'gymlog').map((x) => (
            <View style={[S.item, S.row]} key={x._id}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{x.activityName}</Text>
                <Text style={S.muted}>{x.durationMinutes} min · {Math.round(x.caloriesBurned)} kcal{x.caloriesSource === 'manual' ? ' · entered by you' : ' · estimated'}{x.source === 'healthconnect' ? ` · from ${x.sourceApp || 'Health Connect'}${x.avgHeartRate ? ` · avg ${x.avgHeartRate} bpm` : ''}` : ''}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${x.activityName}`} onPress={() => startEdit(x)} style={{ minHeight: 44, justifyContent: 'center', marginRight: 14 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Edit</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => removeLog(x._id)}><Text style={S.delete}>Delete</Text></TouchableOpacity>
            </View>
          )) : <View style={S.card}><BuddyEmpty scene="sad" title="No workout yet today" text="Even 10 minutes counts. Log one and I will cheer!" /></View>}

          {!!records.length && (
            <View style={[S.card, { marginTop: 14 }]}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 8 }}>🏅 Personal records</Text>
              {records.slice(0, 6).map((r) => (
                <View key={r.activityName} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View style={S.between}>
                    <Text style={{ fontWeight: '700', color: colors.ink }}>{r.activityName}</Text>
                    <Text style={{ fontWeight: '800', color: colors.primary }}>{r.bestWeightKg} kg × {r.bestWeightReps}</Text>
                  </View>
                  <Text style={S.muted}>Est. 1-rep max {r.best1RM} kg · {r.totalSets} sets · {Math.round(r.totalVolumeKg).toLocaleString()} kg lifted in total</Text>
                </View>
              ))}
            </View>
          )}

          <View style={[S.between, { marginTop: 18, marginBottom: 6 }]}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>History</Text>
            <View style={{ flexDirection: 'row' }}>
              {[7, 14, 30].map((d) => <Chip key={d} label={`${d}d`} small active={historyDays === d} onPress={() => setHistoryDays(d)} />)}
            </View>
          </View>
          <Text style={[S.muted, { marginBottom: 12 }]}>{fmtEnergy(burnedInHistory, units.energy)} burned in the last {historyDays} days</Text>
          {historyDates.length ? <>{hist.shown.map((d) => {
            const items = byDay[d];
            const kcal = items.reduce((t: number, x: any) => t + Number(x.caloriesBurned || 0), 0);
            const mins = items.reduce((t: number, x: any) => t + Number(x.durationMinutes || 0), 0);
            return (
              <View key={d} style={S.item}>
                <View style={S.between}>
                  <Text style={{ fontWeight: '800', color: colors.ink }}>{d === today() ? 'Today' : prettyDate(d)}</Text>
                  <Text style={{ fontWeight: '800', color: colors.primary }}>{Math.round(kcal)} kcal</Text>
                </View>
                <Text style={[S.muted, { marginBottom: 6 }]}>{mins} min · {items.length} workout{items.length === 1 ? '' : 's'}</Text>
                {items.map((x: any) => (
                  <Text key={x._id} style={{ color: colors.ink, fontSize: 13, paddingVertical: 2 }}>• {x.activityName} — {x.durationMinutes} min · {Math.round(x.caloriesBurned)} kcal{x.sets?.length ? ` · ${x.sets.length} sets` : ''}{x.source === 'healthconnect' ? ` · from ${x.sourceApp || 'Health Connect'}` : ''}</Text>
                ))}
              </View>
            );
          })}<ShowMoreButton hidden={hist.hidden} open={hist.open} onPress={hist.toggle} noun="days" /></> : <View style={S.card}><Text style={S.muted}>No workouts in this period.</Text></View>}
        </>
      ) : tab === 'templates' ? (
        <>
          <Button title="+ New template" onPress={openNewTemplate} />
          <View style={{ height: 12 }} />
          {templates.map((t) => (
            <View key={t._id} style={S.item}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{t.name}</Text>
              <Text style={S.muted}>{t.items.map((i) => (i.targetSets ? `${i.activityName} ${i.targetSets}×${i.targetReps || '?'}${i.targetWeightKg ? ` @ ${i.targetWeightKg} kg` : ''}` : `${i.activityName} (${i.durationMinutes}m)`)).join(' · ')}</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                <TouchableOpacity onPress={() => startTemplate(t)} accessibilityRole="button"><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Start</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => logTemplate(t)}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Log as planned</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => openEditTemplate(t)}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Edit</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => deleteTemplate(t)}><Text style={S.delete}>Delete</Text></TouchableOpacity>
              </View>
            </View>
          ))}
          {!templates.length && <View style={S.card}><Text style={S.muted}>No templates yet. Save a routine like "Push day" to log it in one tap.</Text></View>}
        </>
      ) : null}

      <Modal visible={!!editLog} transparent animationType="fade" onRequestClose={() => setEditLog(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(15,18,35,0.45)', justifyContent: 'center', padding: 20 }}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '88%' }} contentContainerStyle={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 22, padding: 20 }}>
            {editLog && (
              <>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 14 }}>Fix this workout</Text>
                <Field label="Minutes" value={editLog.minutes} onChangeText={(v) => setEditLog({ ...editLog, minutes: v })} keyboardType="numeric" />
                <Field label="Calories burned" value={editLog.kcal} onChangeText={(v) => setEditLog({ ...editLog, kcal: v, kcalTouched: true })} keyboardType="numeric" />
                <Text style={[S.muted, { marginBottom: 10 }]}>{editLog.kcalTouched ? 'Your number is kept.' : 'Leave it and the calories follow the new minutes.'}</Text>
                <Text style={S.label}>Day</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Chip label="Today" active={editLog.date === today()} onPress={() => setEditLog({ ...editLog, date: today() })} />
                  <Chip label="Yesterday" active={editLog.date === addDays(today(), -1)} onPress={() => setEditLog({ ...editLog, date: addDays(today(), -1) })} />
                </View>
                <Field label="Day (YYYY-MM-DD)" value={editLog.date} onChangeText={(v) => setEditLog({ ...editLog, date: v })} placeholder="2026-11-23" />
                <Field label="Note" value={editLog.notes} onChangeText={(v) => setEditLog({ ...editLog, notes: v })} />
                <View style={{ height: 6 }} />
                <Button title="Save changes" onPress={saveEdit} />
                <TouchableOpacity onPress={() => setEditLog(null)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <WorkoutMode plan={plan} onClose={() => setPlan(null)} onSaved={load} />

      <Modal visible={!!builder} transparent animationType="fade" onRequestClose={() => setBuilder(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(15,18,35,0.45)', justifyContent: 'center', padding: 20 }}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '88%' }} contentContainerStyle={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 22, padding: 20 }}>
            {builder && (
              <>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 14 }}>{builderId ? 'Edit template' : 'New template'}</Text>
                <Field label="Name" value={builder.name} onChangeText={(v) => setBuilder({ ...builder, name: v })} placeholder="Push day" />
                <Text style={S.label}>Exercises</Text>
                {builder.items.map((it, idx) => (
                  <View key={idx} style={S.item}>
                    <View style={S.row}>
                      <Text style={{ flex: 1, color: colors.ink, fontWeight: '700' }}>{it.activityName}</Text>
                      <TouchableOpacity onPress={() => removeItemFromBuilder(idx)} accessibilityLabel={`Remove ${it.activityName}`} style={{ marginLeft: 8, minHeight: 44, justifyContent: 'center' }}><Text style={S.delete}>×</Text></TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Field label="Sets" value={it.targetSets ? String(it.targetSets) : ''} onChangeText={(v) => setItemField(idx, 'targetSets', v)} keyboardType="numeric" /></View>
                      <View style={{ flex: 1 }}><Field label="Reps" value={it.targetReps ? String(it.targetReps) : ''} onChangeText={(v) => setItemField(idx, 'targetReps', v)} keyboardType="numeric" /></View>
                      <View style={{ flex: 1 }}><Field label="kg" value={it.targetWeightKg !== undefined ? String(it.targetWeightKg) : ''} onChangeText={(v) => setItemField(idx, 'targetWeightKg', v)} keyboardType="decimal-pad" /></View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Field label="Rest (s)" value={it.restSec ? String(it.restSec) : ''} onChangeText={(v) => setItemField(idx, 'restSec', v)} keyboardType="numeric" /></View>
                      <View style={{ flex: 1 }}><Field label="Minutes" value={String(it.durationMinutes)} onChangeText={(v) => setItemDuration(idx, v)} keyboardType="numeric" /></View>
                    </View>
                  </View>
                ))}
                <Text style={S.label}>Add exercise</Text>
                <Field label="Search exercises" value={bq} onChangeText={setBq} placeholder="Squat, bench, walk…" />
                {!bq.trim() && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {builderCats.map((c) => (
                      <TouchableOpacity key={c} onPress={() => setBcat(c)} accessibilityRole="button" accessibilityState={{ selected: bcat === c }} style={{ paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', borderRadius: 20, marginRight: 6, backgroundColor: bcat === c ? colors.primary : colors.card, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ color: bcat === c ? '#fff' : colors.ink, fontWeight: '700' }}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <ScrollView style={{ maxHeight: 280, marginBottom: 12 }} nestedScrollEnabled>
                  {builderList.map((act: any) => (
                    <TouchableOpacity key={act._id} onPress={() => addItemToBuilder(act)} style={S.item}>
                      <Text style={{ color: colors.ink, fontWeight: '600' }}>＋ {act.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {!builderList.length && <Text style={{ color: colors.muted, padding: 8 }}>No exercise found.</Text>}
                </ScrollView>
                <Button title="Save template" onPress={saveTemplate} />
                <TouchableOpacity onPress={() => setBuilder(null)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
