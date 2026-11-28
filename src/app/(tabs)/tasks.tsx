import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatedCheck } from '../../motion/Press';
import { useFocusEffect } from 'expo-router';
import { Modal, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native';
import { today } from '../../config/api';
import { write, newClientId, useOffline, read } from '../../utils/offline';
import { Button, Field, Screen, useThemedStyles } from '../../components/UI';
import { Chip } from '../../components/Chip';
import { DateTimeField } from '../../components/DateTimeField';
import { addDays, prettyDate } from '../../utils/dates';
import { useNotifications } from '../../components/Notifications';
import { successHaptic, tapHaptic, warningHaptic } from '../../utils/haptics';
import { isValidTime } from '../../utils/reminderSchedule';
import { resyncTaskReminders, scheduleTaskReminder } from '../../utils/notifications';
import { localId } from '../../utils/optimistic';
import { HabitsToday } from '../../components/HabitsToday';

type Task = {
  _id: string; title: string; description?: string; date: string; time: string;
  priority: 'low' | 'medium' | 'high'; category: string; completed: boolean;
  recurrence: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'; seriesId?: string; notes?: string; pending?: boolean;
};

const PRIORITIES: Task['priority'][] = ['high', 'medium', 'low'];
const RECURRENCES: Task['recurrence'][] = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
const RECURRENCE_LABEL: Record<Task['recurrence'], string> = { none: 'Once', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };
const PRIORITY_COLOR: Record<Task['priority'], string> = { high: '#B83232', medium: '#D78A13', low: '#3D8BDB' };

export default function Tasks() {
  const { error, warning, success, confirm, undoableDelete } = useNotifications();
  const { S, colors } = useThemedStyles();
  const { syncVersion } = useOffline();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewDate, setViewDate] = useState(today());   // the day being shown
  const [taskDate, setTaskDate] = useState(today());   // the day a NEW task will be added to
  const [refreshing, setRefreshing] = useState(false);

  // add form
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [category, setCategory] = useState('');
  const [recurrence, setRecurrence] = useState<Task['recurrence']>('none');
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // edit modal
  const [editing, setEditing] = useState<Task | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks((await read<any>(`/api/tasks?date=${viewDate}`)).tasks || []);
    } catch (e: any) {
      error('Something went wrong', e.message);
    } finally {
      setRefreshing(false);
    }
  }, [error, viewDate]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setTaskDate(viewDate); }, [viewDate]); // the add form follows the day you are looking at
  useEffect(() => { if (syncVersion > 0) load(); }, [syncVersion]); // offline writes replayed -> refresh
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => { if (firstFocus.current) { firstFocus.current = false; return; } load(); }, [load]));

  const resetForm = () => { setTitle(''); setTime(''); setPriority('medium'); setCategory(''); setRecurrence('none'); setShowMore(false); };

  const add = async () => {
    if (!title.trim()) return warning('Enter a title', 'Give your task a name.');
    if (time && !isValidTime(time)) return warning('Invalid time', 'Use 24-hour HH:mm, e.g. 18:30.');
    try {
      setSaving(true);
      const clientId = newClientId('task');
      const body = { title: title.trim(), date: taskDate, time, priority, category: category.trim() || 'General', recurrence, clientId };
      const r = await write<any>('POST', '/api/tasks', body, `Task: ${title.trim()}`);
      // Schedule the reminder right now from local data, so it works offline and for any date (not only after a server round-trip).
      if (time) scheduleTaskReminder({ id: r.queued ? localId(clientId) : (r.data?.task?._id || localId(clientId)), title: body.title, date: taskDate, time, recurrence }).catch(() => {});
      const where = taskDate === today() ? '' : ` for ${prettyDate(taskDate)}`;
      resetForm();
      success(r.queued ? 'Saved offline' : 'Saved', r.queued ? 'Will sync once you\u2019re back online.' : `Task added${where}.`);
      if (taskDate !== viewDate) setViewDate(taskDate); else load();
      resyncTaskReminders();
    } catch (e: any) {
      error('Something went wrong', e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t: Task) => {
    const nextCompleted = !t.completed;
    setTasks((prev) => prev.map((x) => (x._id === t._id ? { ...x, completed: nextCompleted } : x)));
    if (nextCompleted) successHaptic(); else tapHaptic();
    try {
      await write('PATCH', `/api/tasks/${t._id}/toggle`, { completed: nextCompleted }, `Complete: ${t.title}`, { wasCompleted: t.completed });
      if (nextCompleted) resyncTaskReminders();
    } catch (e: any) {
      setTasks((prev) => prev.map((x) => (x._id === t._id ? { ...x, completed: t.completed } : x)));
      error('Could not update task', e.message);
    }
  };

  const removeNow = async (id: string, scope: 'this' | 'series') => {
    setTasks((prev) => (scope === 'series' ? prev.filter((x) => x._id !== id) : prev.filter((x) => x._id !== id)));
    try {
      await write('DELETE', `/api/tasks/${id}?scope=${scope}`, undefined, 'Delete task');
    } catch (e: any) {
      error('Delete failed', e.message);
      load();
    }
  };

  const requestDelete = (t: Task) => {
    if (t.seriesId) {
      confirm({ title: 'Delete repeating task', message: `"${t.title}" repeats. Delete just today\u2019s occurrence, or stop the whole series?`, confirmText: 'Just this one' }).then((ok) => {
        if (ok) { setTasks((p) => p.filter((x) => x._id !== t._id)); undoableDelete(`Removed "${t.title}"`, () => removeNow(t._id, 'this'), () => load()); }
      });
      return;
    }
    setTasks((p) => p.filter((x) => x._id !== t._id));
    undoableDelete(`Removed "${t.title}"`, () => removeNow(t._id, 'this'), () => load());
  };

  const stopSeries = async (t: Task) => {
    try { await write('DELETE', `/api/tasks/${t._id}?scope=series`, undefined, 'Stop series'); success('Series stopped', 'Future occurrences were removed.'); load(); }
    catch (e: any) { error('Could not stop series', e.message); }
  };

  const saveEdit = async (t: Task, scope: 'this' | 'following') => {
    if (t.time && !isValidTime(t.time)) return warning('Invalid time', 'Use 24-hour HH:mm.');
    try {
      await write('PATCH', `/api/tasks/${t._id}`, {
        title: t.title, date: t.date, time: t.time, priority: t.priority, category: t.category, recurrence: t.recurrence, scope,
      }, `Edit: ${t.title}`);
      setEditing(null);
      success('Saved', 'Task updated.');
      load();
      resyncTaskReminders();
    } catch (e: any) { error('Save failed', e.message); }
  };

  const sorted = [...tasks].sort((a, b) =>
    Number(a.completed) - Number(b.completed) ||
    (a.time ? 0 : 1) - (b.time ? 0 : 1) ||
    a.time.localeCompare(b.time) ||
    PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)
  );
  const openCount = tasks.filter((t) => !t.completed).length;

  return (
    <Screen buddy="task" buddySays="Check 'em off!" tab refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <Text style={S.title}>Tasks</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 6 }}>
        <TouchableOpacity onPress={() => setViewDate(addDays(viewDate, -1))} hitSlop={10} accessibilityLabel="Previous day" style={{ padding: 8 }}><Text style={{ fontSize: 22, color: colors.primary, fontWeight: '800' }}>‹</Text></TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-end', justifyContent: 'center' }}>
          <View style={{ flex: 1, maxWidth: 240 }}><DateTimeField label="Showing" mode="date" value={viewDate} onChange={(v) => v && setViewDate(v)} /></View>
        </View>
        <TouchableOpacity onPress={() => setViewDate(addDays(viewDate, 1))} hitSlop={10} accessibilityLabel="Next day" style={{ padding: 8 }}><Text style={{ fontSize: 22, color: colors.primary, fontWeight: '800' }}>›</Text></TouchableOpacity>
      </View>
      {viewDate !== today() && (
        <TouchableOpacity onPress={() => setViewDate(today())} style={{ alignSelf: 'center', marginBottom: 8 }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Jump to today</Text></TouchableOpacity>
      )}
      <Text style={S.sub}>{openCount === 0 ? (tasks.length ? `All done${viewDate === today() ? ' for today' : ''} 🎉` : 'Nothing planned for this day yet') : `${openCount} open${viewDate === today() ? ' for today' : ` on ${prettyDate(viewDate)}`}`}</Text>

      <View style={S.card}>
        <Field label="Task" value={title} onChangeText={setTitle} placeholder="Example: Walk 10k steps" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DateTimeField label="Date" mode="date" value={taskDate} onChange={(v) => v && setTaskDate(v)} />
          <DateTimeField label="Due time (optional)" mode="time" value={time} onChange={setTime} clearable placeholder="No time" />
        </View>
        <Text style={S.label}>Priority</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {PRIORITIES.map((p) => <Chip key={p} label={p[0].toUpperCase() + p.slice(1)} active={priority === p} onPress={() => setPriority(p)} />)}
        </View>
        {showMore ? (
          <>
            <Field label="Category (optional)" value={category} onChangeText={setCategory} placeholder="General" />
            <Text style={S.label}>Repeat</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {RECURRENCES.map((r) => <Chip key={r} label={RECURRENCE_LABEL[r]} active={recurrence === r} onPress={() => setRecurrence(r)} />)}
            </View>
          </>
        ) : (
          <TouchableOpacity onPress={() => setShowMore(true)} style={{ marginBottom: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>+ Category & repeat</Text>
          </TouchableOpacity>
        )}
        {time ? <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>⏰ You\u2019ll get a reminder at {time} on {prettyDate(taskDate)}.</Text> : null}
        <Button title={saving ? 'Saving...' : 'Add Task'} onPress={add} disabled={saving} />
      </View>

      <HabitsToday date={viewDate} style={{ marginBottom: 12 }} />

      {sorted.map((t) => (
        <View key={t._id} style={[S.card, { paddingVertical: 13 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ marginRight: 12 }}>
              <AnimatedCheck checked={t.completed} onChange={() => toggle(t)} size={28} color={colors.success} borderColor={colors.border} label={`${t.completed ? 'Mark not done' : 'Mark done'}: ${t.title}`} />
            </View>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setEditing({ ...t })}>
              <Text style={{ fontWeight: '700', color: colors.ink, textDecorationLine: t.completed ? 'line-through' : 'none' }}>{t.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                {!!t.time && <Text style={{ fontSize: 12, color: colors.muted }}>⏰ {t.time}</Text>}
                {t.pending ? <Text style={{ fontSize: 12, color: colors.muted }}>⏳ waiting to sync</Text> : null}
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: PRIORITY_COLOR[t.priority] }} />
                <Text style={{ fontSize: 12, color: colors.muted }}>{t.category}</Text>
                {t.seriesId ? <Text style={{ fontSize: 12, color: colors.muted }}>· 🔁 {RECURRENCE_LABEL[t.recurrence]}</Text> : null}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => requestDelete(t)} hitSlop={10} style={{ paddingLeft: 8 }}>
              <Text style={S.delete}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(15,18,35,0.45)', justifyContent: 'center', padding: 20 }}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '85%' }} contentContainerStyle={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 22, padding: 20 }}>
            {editing && (
              <>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 14 }}>Edit task</Text>
                <Field label="Title" value={editing.title} onChangeText={(v) => setEditing({ ...editing, title: v })} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <DateTimeField label="Date" mode="date" value={editing.date} onChange={(v) => v && setEditing({ ...editing, date: v })} />
                  <DateTimeField label="Due time" mode="time" value={editing.time} onChange={(v) => setEditing({ ...editing, time: v })} clearable placeholder="No time" />
                </View>
                <Field label="Category" value={editing.category} onChangeText={(v) => setEditing({ ...editing, category: v })} />
                <Text style={S.label}>Priority</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{PRIORITIES.map((p) => <Chip key={p} label={p[0].toUpperCase() + p.slice(1)} active={editing.priority === p} onPress={() => setEditing({ ...editing, priority: p })} />)}</View>
                <Text style={S.label}>Repeat</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{RECURRENCES.map((r) => <Chip key={r} label={RECURRENCE_LABEL[r]} active={editing.recurrence === r} onPress={() => setEditing({ ...editing, recurrence: r })} />)}</View>

                <View style={{ height: 8 }} />
                {editing.seriesId ? (
                  <>
                    <Button title="Save (this occurrence only)" onPress={() => saveEdit(editing, 'this')} />
                    <View style={{ height: 8 }} />
                    <Button title="Save (this and following)" onPress={() => saveEdit(editing, 'following')} />
                    <View style={{ height: 8 }} />
                    <TouchableOpacity onPress={() => { setEditing(null); stopSeries(editing); }} style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Stop repeating</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Button title="Save changes" onPress={() => saveEdit(editing, 'this')} />
                )}
                <TouchableOpacity onPress={() => setEditing(null)} style={{ paddingVertical: 12, alignItems: 'center' }}>
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

// A crash in this tab shows a friendly retry screen (and is reported to Sentry) instead of closing the app.
export { ScreenError as ErrorBoundary } from '../../components/ScreenError';
