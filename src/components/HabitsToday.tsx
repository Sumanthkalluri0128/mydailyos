import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { today } from '../config/api';
import { read, write, useOffline } from '../utils/offline';
import { useTheme } from '../utils/theme';
import { successHaptic, tapHaptic } from '../utils/haptics';
import { AnimatedCheck } from '../motion/Press';
import { useNotifications } from './Notifications';

type Habit = { _id: string; name: string; target: number; unit: string; anchor?: { text?: string; time?: string } };

// Today's habits as a tick list. Used on Home (under Your Progress) and on the Tasks tab.
export function HabitsToday({ date, style }: { date?: string; style?: any }) {
  const { colors: c } = useTheme();
  const { error } = useNotifications();
  const { syncVersion } = useOffline();
  const day = date || today();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([read<any>('/api/habits'), read<any>(`/api/habits/logs?date=${day}`)]);
      setHabits(a?.habits || []);
      setLogs(b?.logs || []);
    } catch { /* keep what is on screen */ } finally { setReady(true); }
  }, [day]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (syncVersion > 0) load(); }, [syncVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDone = (h: Habit) => !!logs.find((l) => String(l.habitId) === String(h._id))?.completed;
  const doneCount = habits.filter(isDone).length;

  const toggle = async (h: Habit) => {
    const done = isDone(h);
    if (!done) successHaptic(); else tapHaptic();
    // tick straight away, then save
    setLogs((prev) => {
      const rest = prev.filter((l) => String(l.habitId) !== String(h._id));
      return [...rest, { habitId: h._id, completed: !done, completedValue: done ? 0 : h.target }];
    });
    try {
      await write('POST', '/api/habits/logs', { habitId: h._id, date: day, completedValue: done ? 0 : h.target }, `Habit: ${h.name}`, { habitName: h.name, target: h.target, unit: h.unit });
      load();
    } catch (e: any) { error('Could not update habit', e?.message || 'Please try again.'); load(); }
  };

  if (!ready) return null;

  return (
    <View style={[{ backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 24, padding: 16 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: habits.length ? 8 : 4 }}>
        <Text style={{ fontSize: 22, marginRight: 10 }}>🔥</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17.5, fontWeight: '800', color: c.ink, letterSpacing: -0.3 }}>Habits</Text>
          {habits.length > 0 && <Text style={{ fontSize: 12, fontWeight: '600', color: c.muted }}>{doneCount} of {habits.length} done {day === today() ? 'today' : 'this day'}</Text>}
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Manage habits" onPress={() => router.push('/habits' as any)} hitSlop={8}
          style={{ minHeight: 40, paddingHorizontal: 13, borderRadius: 12, backgroundColor: c.primarySoft, justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>{habits.length ? 'Manage' : '＋ Add'}</Text>
        </TouchableOpacity>
      </View>
      {habits.length === 0 && <Text style={{ fontSize: 13, color: c.muted }}>No habits yet. Add one like "10k steps" or "Stretch" to track it every day.</Text>}
      {habits.map((h) => {
        const done = isDone(h);
        return (
          <View key={h._id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: 4 }}>
            <View style={{ marginRight: 12 }}>
              <AnimatedCheck checked={done} onChange={() => toggle(h)} size={28} color={c.success} borderColor={c.border} label={`${done ? 'Mark not done' : 'Mark done'}: ${h.name}`} />
            </View>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/habits' as any)} accessibilityRole="button" accessibilityLabel={`${h.name}. Open habits`}>
              <Text style={{ fontWeight: '700', color: c.ink, textDecorationLine: done ? 'line-through' : 'none' }}>{h.name}</Text>
              {!!h.anchor?.time && <Text style={{ fontSize: 12, color: c.muted }}>⏰ {h.anchor.time}</Text>}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
