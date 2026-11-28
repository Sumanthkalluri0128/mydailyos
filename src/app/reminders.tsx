import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { DateTimeField } from '../components/DateTimeField';
import { INTERVAL_OPTIONS, countSlots, intervalLabel, osNotificationLimit } from '../utils/reminderSchedule';
import { useNotifications } from '../components/Notifications';
import {
  applyReminders,
  cancelAllReminders,
  CustomReminder,
  DEFAULT_PREFS,
  formatFriendlyDate,
  formatFriendlyTime,
  getReminderDiagnostics,
  isValidTime,
  openBatterySettings,
  openExactAlarmSettings,
  ReminderDiagnostics,
  refreshReminders,
  sendTestNotification,
  loadPrefs,
  notificationsAvailable,
  removeCustomReminder,
  ReminderPrefs,
  ReminderRepeat,
  resyncTaskReminders,
  savePrefs,
  weekdayLabel,
} from '../utils/notifications';

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toTimeStr(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function parseFieldDate(dateStr: string): Date { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); }
function parseFieldTime(time: string): Date { const [h, m] = time.split(':').map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return d; }

/**
 * A tappable field that opens the OS's native date or time picker — the
 * same picker you'd get setting up a calendar event — instead of typing
 * digits by hand.
 */
function DateTimeChip({ label, display, onPress, colors }: { label: string; display: string; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${display}`}
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 13,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: colors.card,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{display}</Text>
    </TouchableOpacity>
  );
}

function TimeField({ label, value, onChangeText, S, colors }: { label: string; value: string; onChangeText: (s: string) => void; S: any; colors: any }) {
  const valid = isValidTime(value);
  return (
    <View style={{ marginBottom: 13 }}>
      <Text style={S.label}>{label}</Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: valid ? colors.border : colors.danger,
          borderRadius: 13,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: colors.card,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="HH:mm"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          returnKeyType="done"
          style={{ fontSize: 15, color: colors.ink }}
        />
      </View>
      {!valid && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>Use 24h format, e.g. 09:00 or 18:30.</Text>}
    </View>
  );
}

function Row({ title, subtitle, value, onValueChange, colors }: { title: string; subtitle: string; value: boolean; onValueChange: (v: boolean) => void; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontWeight: '800', fontSize: 15, color: colors.ink }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}

function IntervalChips({ value, onChange, colors, options = INTERVAL_OPTIONS }: { value: number; onChange: (m: number) => void; colors: any; options?: { min: number; label: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
      {options.map((o) => (
        <TouchableOpacity key={o.min} onPress={() => onChange(o.min)} accessibilityRole="button" accessibilityState={{ selected: value === o.min }}
          style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, marginRight: 8, marginBottom: 8, backgroundColor: value === o.min ? colors.primary : colors.chipBg }}>
          <Text style={{ color: value === o.min ? '#fff' : colors.ink, fontWeight: '700' }}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** "Between 09:00 and 18:00, every 2 hr" — the shared editor for motivation quotes and task nudges. */
function WindowEditor({ start, end, everyMin, onStart, onEnd, onEvery, colors, S, noun }: { start: string; end: string; everyMin: number; onStart: (v: string) => void; onEnd: (v: string) => void; onEvery: (m: number) => void; colors: any; S: any; noun: string }) {
  const n = countSlots(start, end, everyMin);
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <DateTimeField label={everyMin ? 'From' : 'At'} mode="time" value={start} onChange={(v) => v && onStart(v)} />
        {everyMin > 0 && <DateTimeField label="Until" mode="time" value={end} onChange={(v) => v && onEnd(v)} />}
      </View>
      <Text style={S.label}>How often?</Text>
      <IntervalChips value={everyMin} onChange={onEvery} colors={colors} />
      <Text style={{ color: n === 0 ? colors.danger : colors.muted, fontSize: 12, marginBottom: 4 }}>
        {n === 0 ? 'The end time must be after the start time.' : `${n} ${noun}${n === 1 ? '' : 's'} a day · ${intervalLabel(everyMin)}${everyMin ? ` from ${formatFriendlyTime(start)} to ${formatFriendlyTime(end)}` : ` at ${formatFriendlyTime(start)}`}`}
      </Text>
    </View>
  );
}

const REPEAT_OPTIONS: { key: ReminderRepeat; label: string }[] = [
  { key: 'once', label: 'Once' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
];

/** The "add a custom reminder" form — title, note, repeat, and a real calendar-event-style date + time picker.
 * Also used for editing: pass `initial` to prefill and `submitLabel` to change the button text. */
function CustomReminderForm({ onAdd, onCancel, initial, submitLabel, S, colors }: { onAdd: (r: CustomReminder) => void; onCancel?: () => void; initial?: CustomReminder; submitLabel?: string; S: any; colors: any }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [note, setNote] = useState(initial?.note || '');
  const [repeat, setRepeat] = useState<ReminderRepeat>(initial?.repeat || 'once');
  const [date, setDate] = useState(initial ? parseFieldDate(initial.date) : new Date());
  const [time, setTime] = useState(() => {
    if (initial) return parseFieldTime(initial.time);
    const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d;
  });
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  function add() {
    if (!title.trim()) return;
    onAdd({
      id: initial?.id || `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      title: title.trim(),
      note: note.trim() || undefined,
      repeat,
      date: toDateStr(date),
      time: toTimeStr(time),
    });
    if (!initial) { setTitle(''); setNote(''); setRepeat('once'); }
  }

  return (
    <View>
      <Text style={S.label}>Title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Dentist appointment"
        placeholderTextColor={colors.muted}
        style={[S.input, { marginBottom: 10 }]}
      />
      <Text style={S.label}>Note (optional)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Shown in the notification body"
        placeholderTextColor={colors.muted}
        style={[S.input, { marginBottom: 10 }]}
      />

      <Text style={S.label}>Repeats</Text>
      <View style={[S.row, { marginBottom: 12 }]}>
        {REPEAT_OPTIONS.map((o) => (
          <TouchableOpacity
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: repeat === o.key }}
            onPress={() => setRepeat(o.key)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 10,
              marginRight: 8,
              backgroundColor: repeat === o.key ? colors.primary : colors.chipBg,
            }}
          >
            <Text style={{ color: repeat === o.key ? '#fff' : colors.ink, fontWeight: '700' }}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
        {repeat !== 'daily' && (
          <DateTimeChip
            label={repeat === 'weekly' ? 'Repeats every' : 'Date'}
            display={repeat === 'weekly' ? `Every ${weekdayLabel(toDateStr(date))}` : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            onPress={() => setPicker('date')}
            colors={colors}
          />
        )}
        <DateTimeChip
          label="Time"
          display={time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          onPress={() => setPicker('time')}
          colors={colors}
        />
      </View>

      {picker && (
        <DateTimePicker
          value={picker === 'date' ? date : time}
          mode={picker}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_event, selected) => {
            if (Platform.OS === 'android') setPicker(null); // Android's dialog dismisses itself
            if (!selected) return;
            if (picker === 'date') setDate(selected); else setTime(selected);
          }}
        />
      )}
      {Platform.OS === 'ios' && picker && (
        <TouchableOpacity onPress={() => setPicker(null)} style={{ alignSelf: 'flex-end', padding: 8, marginBottom: 4 }}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Done</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={add}
        disabled={!title.trim()}
        style={{
          backgroundColor: title.trim() ? colors.primary : colors.chipBg,
          padding: 12,
          borderRadius: 13,
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <Text style={{ color: title.trim() ? '#fff' : colors.muted, fontWeight: '800' }}>{submitLabel || '+ Add reminder'}</Text>
      </TouchableOpacity>
      {onCancel && (
        <TouchableOpacity onPress={onCancel} style={{ padding: 10, alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CustomReminderCard({ reminder, onDelete, onEdit, colors }: { reminder: CustomReminder; onDelete: () => void; onEdit: () => void; colors: any }) {
  const when =
    reminder.repeat === 'once'
      ? `${formatFriendlyDate(reminder.date)} at ${formatFriendlyTime(reminder.time)}`
      : reminder.repeat === 'daily'
      ? `Every day at ${formatFriendlyTime(reminder.time)}`
      : `Every ${weekdayLabel(reminder.date)} at ${formatFriendlyTime(reminder.time)}`;

  return (
    <TouchableOpacity onPress={onEdit} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ fontWeight: '800', fontSize: 14, color: colors.ink }}>{reminder.title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{when}</Text>
        {!!reminder.note && <Text style={{ color: colors.muted, fontSize: 12, marginTop: 1 }}>{reminder.note}</Text>}
      </View>
      <TouchableOpacity onPress={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: 6 }} accessibilityLabel={`Delete reminder ${reminder.title}`}>
        <Text style={{ color: colors.danger, fontWeight: '700' }}>Delete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function Reminders() {
  const { success, error, warning } = useNotifications();
  const { S, colors } = useThemedStyles();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [diag, setDiag] = useState<ReminderDiagnostics | null>(null);
  const refreshDiag = useCallback(() => { getReminderDiagnostics().then(setDiag).catch(() => {}); }, []);
  useEffect(() => {
    refreshDiag();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refreshDiag(); }); // coming back from Settings
    return () => sub.remove();
  }, [refreshDiag]);

  useEffect(() => {
    loadPrefs().then((p) => {
      setPrefs(p);
      setReady(true);
    });
  }, []);

  function set<K extends keyof ReminderPrefs>(key: K, value: ReminderPrefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    if (prefs.waterEnabled && prefs.waterStart >= prefs.waterEnd) return warning('Check water window', 'Start time must be before end time.');
    if (prefs.tasksEnabled && prefs.tasksEveryMin > 0 && prefs.tasksStart >= prefs.tasksEnd) return warning('Check task nudge window', 'Start time must be before end time.');
    if (prefs.motivationEnabled && prefs.motivationEveryMin > 0 && prefs.motivationStart >= prefs.motivationEnd) return warning('Check motivation window', 'Start time must be before end time.');

    setSaving(true);
    try {
      await savePrefs(prefs);
      await applyReminders(prefs);
      await resyncTaskReminders();
      success('Reminders saved', 'They\u2019ll fire at the times you set, even if the app is closed.');
      refreshDiag();
    } catch (e: any) {
      error('Could not schedule reminders', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addCustom(r: CustomReminder) {
    const next = { ...prefs, customReminders: [...prefs.customReminders, r] };
    setPrefs(next);
    await savePrefs(next);
    success('Reminder added', 'It\u2019s already scheduled — no need to tap Save for this one.');
    try {
      await applyReminders(next);
    } catch (e: any) {
      error('Could not schedule reminder', e.message);
    }
  }

  async function updateCustom(r: CustomReminder) {
    const next = { ...prefs, customReminders: prefs.customReminders.map((x) => (x.id === r.id ? r : x)) };
    setPrefs(next);
    await savePrefs(next);
    setEditingId(null);
    success('Reminder updated', 'The new date, time or repeat is already scheduled.');
    try {
      await applyReminders(next);
    } catch (e: any) {
      error('Could not reschedule reminder', e.message);
    }
  }

  async function deleteCustom(id: string) {
    const next = { ...prefs, customReminders: prefs.customReminders.filter((r) => r.id !== id) };
    setPrefs(next);
    await savePrefs(next);
    try {
      await removeCustomReminder(id);
    } catch {
      // best-effort — the id is gone from prefs either way
    }
  }

  async function turnAllOff() {
    setSaving(true);
    try {
      const next = { ...prefs, tasksEnabled: false, waterEnabled: false, motivationEnabled: false, mealEnabled: false, tiffinEnabled: false, workoutEnabled: false, taskDueRemindersEnabled: false };
      setPrefs(next);
      await savePrefs(next);
      await cancelAllReminders();
      success('Reminders off', 'All scheduled reminders were cancelled.');
    } catch (e: any) {
      error('Something went wrong', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <Screen>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={S.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={S.title}>Reminders</Text>
      <Text style={S.sub}>Local notifications that fire on schedule — even if FlexFit is fully closed.</Text>

      {!notificationsAvailable && (
        <View style={[S.card, { backgroundColor: colors.warnSoft, borderColor: colors.warnBorder, borderWidth: 1 }]}>
          <Text style={{ fontWeight: '800', fontSize: 13, color: colors.warnInk, marginBottom: 4 }}>
            Not available in Expo Go on Android
          </Text>
          <Text style={{ fontSize: 12, color: colors.warnInk, lineHeight: 17 }}>
            Since SDK 53, Expo Go on Android can't schedule local notifications. You can still set your
            preferences below, but run this app with a development build (`npx expo run:android` or an EAS dev
            build) to actually receive reminders. iOS Expo Go and dev builds on either platform work fine.
          </Text>
        </View>
      )}

      <View style={S.card}>
        <Row
          title="Task nudges"
          subtitle="Repeating reminders of what's still open, e.g. every 2 hours from 9 to 6."
          value={prefs.tasksEnabled}
          onValueChange={(v) => set('tasksEnabled', v)}
          colors={colors}
        />
        {prefs.tasksEnabled && (
          <WindowEditor noun="nudge" start={prefs.tasksStart} end={prefs.tasksEnd} everyMin={prefs.tasksEveryMin} colors={colors} S={S}
            onStart={(v) => set('tasksStart', v)} onEnd={(v) => set('tasksEnd', v)} onEvery={(m) => set('tasksEveryMin', m)} />
        )}
      </View>

      <View style={S.card}>
        <Row
          title="Task due-time reminders"
          subtitle="A notification for each task at its own due time, with Mark done / Snooze buttons."
          value={prefs.taskDueRemindersEnabled}
          onValueChange={(v) => set('taskDueRemindersEnabled', v)}
          colors={colors}
        />
        {prefs.taskDueRemindersEnabled && (
          <>
            <Text style={S.label}>Remind me</Text>
            <View style={[S.row, { marginBottom: 4 }]}>
              {[0, 5, 10, 30].map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => set('taskReminderLeadMinutes', m)}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, marginRight: 8, backgroundColor: prefs.taskReminderLeadMinutes === m ? colors.primary : colors.chipBg }}
                >
                  <Text style={{ color: prefs.taskReminderLeadMinutes === m ? '#fff' : colors.ink, fontWeight: '700' }}>{m === 0 ? 'On time' : `${m}m early`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={S.card}>
        <Row
          title="Quiet hours"
          subtitle="No water, task or motivation nudges inside this window. Your own custom reminders and task due times still fire."
          value={prefs.quietEnabled}
          onValueChange={(v) => set('quietEnabled', v)}
          colors={colors}
        />
        {prefs.quietEnabled && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <DateTimeField label="Quiet from" mode="time" value={prefs.quietStart} onChange={(v) => v && set('quietStart', v)} />
            <DateTimeField label="Until" mode="time" value={prefs.quietEnd} onChange={(v) => v && set('quietEnd', v)} />
          </View>
        )}
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 8, marginBottom: 6 }}>Most nudges per day</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[4, 6, 8, 12, 0].map((n) => <Chip key={n} small label={n === 0 ? 'No limit' : String(n)} active={prefs.maxPerDay === n} onPress={() => set('maxPerDay', n)} />)}
        </View>
        <Row
          title="Skip when done"
          subtitle="Stop water nudges once today's goal is met, and task nudges once every task is done. They come back tomorrow."
          value={prefs.smartSkip}
          onValueChange={(v) => set('smartSkip', v)}
          colors={colors}
        />
      </View>

      <View style={S.card}>
        <Row
          title="Missed-meal reminders"
          subtitle="Each meal has its own reminder that fires only if THAT meal is still not logged. Log it, or tap Skipped it, and it stays quiet for today."
          value={prefs.mealEnabled}
          onValueChange={(v) => set('mealEnabled', v)}
          colors={colors}
        />
        {prefs.mealEnabled && (
          <View style={{ marginTop: 6 }}>
            {(['breakfast', 'lunch', 'dinner', 'snacks'] as const).map((m) => (
              <View key={m} style={{ marginBottom: 6 }}>
                <Row
                  title={m === 'snacks' ? 'Snacks' : m[0].toUpperCase() + m.slice(1)}
                  subtitle={prefs.mealsOn[m] ? `Remind me at ${prefs.mealTimes[m]} if ${m === 'snacks' ? 'no snack' : m} isn't logged` : 'Off'}
                  value={prefs.mealsOn[m]}
                  onValueChange={(v) => set('mealsOn', { ...prefs.mealsOn, [m]: v })}
                  colors={colors}
                />
                {prefs.mealsOn[m] && (
                  <DateTimeField label={`Remind me for ${m} at`} mode="time" value={prefs.mealTimes[m]} onChange={(v) => v && set('mealTimes', { ...prefs.mealTimes, [m]: v })} />
                )}
              </View>
            ))}
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 4, marginBottom: 6 }}>Ask again if still missing</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[0, 30, 45, 60].map((n) => <Chip key={n} small label={n === 0 ? 'Never' : `after ${n} min`} active={prefs.mealFollowUpMin === n} onPress={() => set('mealFollowUpMin', n)} />)}
            </View>
          </View>
        )}
      </View>

      <View style={S.card}>
        <Row
          title="Plan tomorrow's lunch"
          subtitle="One gentle reminder in the evening. It stays quiet if tomorrow's lunch is already planned, and never fires in quiet hours."
          value={prefs.tiffinEnabled}
          onValueChange={(v) => set('tiffinEnabled', v)}
          colors={colors}
        />
        {prefs.tiffinEnabled && (
          <DateTimeField label="Remind me at" mode="time" value={prefs.tiffinTime} onChange={(v) => v && set('tiffinTime', v)} />
        )}
      </View>

      <View style={S.card}>
        <Row
          title="Planned workouts"
          subtitle="One reminder at your chosen time on each day (the next 7) that has a workout in your plan. It stops once the workout is done or skipped, and is not moved by quiet hours."
          value={prefs.workoutEnabled}
          onValueChange={(v) => set('workoutEnabled', v)}
          colors={colors}
        />
        {prefs.workoutEnabled && (
          <DateTimeField label="Remind me at" mode="time" value={prefs.workoutTime} onChange={(v) => v && set('workoutTime', v)} />
        )}
      </View>

      <View style={S.card}>
        <Row
          title="Water reminders"
          subtitle="Reminds you when you haven't logged water for a while (or at fixed times if you prefer)."
          value={prefs.waterEnabled}
          onValueChange={(v) => set('waterEnabled', v)}
          colors={colors}
        />
        {prefs.waterEnabled && (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <DateTimeField label="From" mode="time" value={prefs.waterStart} onChange={(v) => v && set('waterStart', v)} />
              <DateTimeField label="Until" mode="time" value={prefs.waterEnd} onChange={(v) => v && set('waterEnd', v)} />
            </View>
            <Text style={S.label}>When should I remind you?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Chip small label="If I haven't logged water" active={prefs.waterMode === 'adaptive'} onPress={() => set('waterMode', 'adaptive')} />
              <Chip small label="At fixed times" active={prefs.waterMode === 'fixed'} onPress={() => set('waterMode', 'fixed')} />
            </View>
            {prefs.waterMode === 'adaptive' ? (
              <>
                <Text style={[S.muted, { marginTop: 8 }]}>You get a reminder only when no water has been logged for this long. Logging a glass starts the clock again.</Text>
                <Text style={S.label}>No water logged for</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {[45, 60, 90, 120].map((m) => <Chip key={m} small label={m === 60 ? '1 hour' : m === 120 ? '2 hours' : `${m} min`} active={prefs.waterGapMin === m} onPress={() => set('waterGapMin', m)} />)}
                </View>
                <Text style={S.label}>Most water reminders a day</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {[4, 6, 8, 12].map((n) => <Chip key={n} small label={String(n)} active={prefs.waterMaxPerDay === n} onPress={() => set('waterMaxPerDay', n)} />)}
                </View>
              </>
            ) : (
              <>
                <Text style={S.label}>Every how many hours?</Text>
                <View style={[S.row, { marginBottom: 4 }]}>
                  {[1, 2, 3, 4].map((h) => (
                    <TouchableOpacity key={h} onPress={() => set('waterIntervalHours', h)}
                      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, marginRight: 8, backgroundColor: prefs.waterIntervalHours === h ? colors.primary : colors.chipBg }}>
                      <Text style={{ color: prefs.waterIntervalHours === h ? '#fff' : colors.ink, fontWeight: '700' }}>{h}h</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </View>

      <View style={S.card}>
        <Row
          title="Motivation to start working"
          subtitle="A different motivational quote every hour or two, between the times you choose."
          value={prefs.motivationEnabled}
          onValueChange={(v) => set('motivationEnabled', v)}
          colors={colors}
        />
        {prefs.motivationEnabled && (
          <WindowEditor noun="quote" start={prefs.motivationStart} end={prefs.motivationEnd} everyMin={prefs.motivationEveryMin} colors={colors} S={S}
            onStart={(v) => set('motivationStart', v)} onEnd={(v) => set('motivationEnd', v)} onEvery={(m) => set('motivationEveryMin', m)} />
        )}
      </View>

      <View style={S.card}>
        <Text style={{ fontWeight: '800', fontSize: 15, color: colors.ink, marginBottom: 2 }}>Custom reminders</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>
          Set up a reminder like a calendar event — pick any date and time, once or repeating.
        </Text>
        {editingId ? (
          <CustomReminderForm
            key={editingId}
            initial={prefs.customReminders.find((r) => r.id === editingId)}
            submitLabel="Save changes"
            onAdd={updateCustom}
            onCancel={() => setEditingId(null)}
            S={S}
            colors={colors}
          />
        ) : (
          <CustomReminderForm onAdd={addCustom} S={S} colors={colors} />
        )}
        {prefs.customReminders.map((r) => (
          <CustomReminderCard key={r.id} reminder={r} onDelete={() => deleteCustom(r.id)} onEdit={() => setEditingId(r.id)} colors={colors} />
        ))}
      </View>

      <View style={S.card}>
        <Text style={{ fontWeight: '800', fontSize: 15, color: colors.ink, marginBottom: 2 }}>Make sure reminders arrive</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>Phones delay or block notifications while an app is closed. Check these once.</Text>
        {diag && (
          <>
            <Text style={{ color: colors.ink, fontSize: 13, marginBottom: 4 }}>
              {diag.permission === 'granted' ? '✅ Notifications are allowed' : diag.permission === 'denied' ? '❌ Notifications are blocked for FlexFit' : '⚠️ Notification permission not granted yet'}
            </Text>
            <Text style={{ color: colors.ink, fontSize: 13, marginBottom: 4 }}>🗓️ {diag.scheduledCount} reminder{diag.scheduledCount === 1 ? '' : 's'} scheduled{Platform.OS === 'ios' ? ` (iPhone keeps at most ${diag.limit})` : ''}</Text>
            {diag.next.slice(0, 3).map((n, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12, marginLeft: 22 }}>• {n.title} — {n.when}</Text>)}
            {diag.permission !== 'granted' && (
              <TouchableOpacity onPress={() => Linking.openSettings()} style={{ marginTop: 10, backgroundColor: colors.primarySolid, padding: 11, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Open notification settings</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {Platform.OS === 'android' && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 17, marginBottom: 8 }}>
              <Text style={{ fontWeight: '800' }}>Android: </Text>allow "Alarms & reminders" so reminders fire exactly on time, and set FlexFit's battery use to "Unrestricted" so the phone doesn't stop it while closed.
            </Text>
            <TouchableOpacity onPress={() => openExactAlarmSettings().catch(() => Linking.openSettings())} style={{ backgroundColor: colors.chipBg, padding: 11, borderRadius: 12, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.ink, fontWeight: '800' }}>1 · Allow exact alarms</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openBatterySettings().catch(() => Linking.openSettings())} style={{ backgroundColor: colors.chipBg, padding: 11, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.ink, fontWeight: '800' }}>2 · Remove battery restriction</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          onPress={async () => { try { await sendTestNotification(10); success('Test scheduled', 'Close FlexFit now — a notification should arrive in about 10 seconds.'); refreshDiag(); } catch (e: any) { error('Could not send test', e.message); } }}
          style={{ marginTop: 12, padding: 11, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.primary }}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>Send a test in 10 seconds</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        disabled={saving}
        onPress={save}
        style={[S.button, saving && { opacity: 0.55 }]}
      >
        <Text style={S.buttonText}>{saving ? 'Saving…' : 'Save reminders'}</Text>
      </TouchableOpacity>

      <View style={{ height: 12 }} />
      <TouchableOpacity disabled={saving} onPress={turnAllOff} style={{ padding: 12, alignItems: 'center' }}>
        <Text style={{ color: colors.danger, fontWeight: '700' }}>Turn off all reminders</Text>
      </TouchableOpacity>
    </Screen>
  );
}
