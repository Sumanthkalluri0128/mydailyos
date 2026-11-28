import { useCallback, useEffect, useState } from 'react';
import { StreakFlame } from '../motion/StreakFlame';
import { Modal, RefreshControl, Text, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { today } from '../config/api';
import { write, newClientId, useOffline, read } from '../utils/offline';
import { Button, Field, Screen, useThemedStyles } from '../components/UI';
import { useNotifications } from '../components/Notifications';
import { successHaptic, tapHaptic } from '../utils/haptics';
import { refreshAnchorsNow, ensureNotificationSetup } from '../utils/notifications';
import { DateTimeField } from '../components/DateTimeField';

type Habit = { _id: string; name: string; target: number; unit: string; frequency: string; anchor?: { text: string; time: string } };
type Stats = { currentStreak: number; bestStreak: number; totalCompleted: number; completionRate: number };

export default function Habits() {
  const { error, warning, success, undoableDelete } = useNotifications();
  const { S, colors } = useThemedStyles();
  const { syncVersion } = useOffline();
  const [h, setH] = useState<Habit[]>([]);
  const [l, setL] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [name, setName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const date = today();

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([read<any>('/api/habits'), read<any>(`/api/habits/logs?date=${date}`)]);
      setH(a.habits || []);
      setL(b.logs || []);
      const entries = await Promise.all((a.habits || []).map(async (habit: Habit) => {
        try { return [habit._id, (await read<any>(`/api/habits/${habit._id}/stats`)).stats] as const; }
        catch { return [habit._id, null] as const; }
      }));
      setStats(Object.fromEntries(entries.filter(([, s]) => s)));
    } catch (e: any) { error('Something went wrong', e.message); } finally { setRefreshing(false); }
  }, [date, error]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { refreshAnchorsNow(); }, [h, l]); // re-plan anchor reminders when habits or today's ticks change
  useEffect(() => { if (syncVersion > 0) load(); }, [syncVersion]);

  const add = async () => {
    if (!name.trim()) return warning('Enter habit name', 'Give your habit a name.');
    try {
      const r = await write('POST', '/api/habits', { name: name.trim(), frequency: 'daily', target: 1, unit: 'times', clientId: newClientId('hb') }, `Habit: ${name.trim()}`);
      setName('');
      success(r.queued ? 'Saved offline' : 'Saved', r.queued ? 'Will sync once you\u2019re back online.' : 'Habit created.');
      load();
    } catch (e: any) { error('Something went wrong', e.message); }
  };

  const toggle = async (x: Habit, done: boolean) => {
    if (!done) successHaptic(); else tapHaptic();
    try {
      await write('POST', '/api/habits/logs', { habitId: x._id, date, completedValue: done ? 0 : x.target }, `Habit: ${x.name}`, { habitName: x.name, target: x.target, unit: x.unit });
      load();
    } catch (e: any) { error('Could not update', e.message); }
  };

  const removeHabit = (x: Habit) => {
    setH((prev) => prev.filter((y) => y._id !== x._id));
    undoableDelete(`Removed "${x.name}"`, async () => {
      try { await write('DELETE', `/api/habits/${x._id}`, undefined, 'Delete habit'); } catch (e: any) { error('Delete failed', e.message); load(); }
    }, () => load());
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await write('PUT', `/api/habits/${editing._id}`, { name: editing.name, target: editing.target, unit: editing.unit, anchor: { text: editing.anchor?.text || '', time: editing.anchor?.time || '' } }, `Habit: ${editing.name}`);
      if (editing.anchor?.time) await ensureNotificationSetup().catch(() => {});
      setEditing(null);
      success('Updated', 'Habit updated.');
      load();
    } catch (e: any) { error('Save failed', e.message); }
  };

  return (
    <Screen buddyWho="jinwoo" buddy="habit" buddySays="Keep the streak!" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Habits</Text>
      <Text style={S.sub}>Build consistency every day.</Text>
      <View style={S.card}>
        <Field label="Habit" value={name} onChangeText={setName} placeholder="10k steps" />
        <Button title="Add Habit" onPress={add} />
      </View>
      {h.map(x => {
        const z = l.find(y => String(y.habitId) === String(x._id));
        const done = !!z?.completed;
        const s = stats[x._id];
        return (
          <View key={x._id} style={S.card}>
            <View style={S.row}>
              <TouchableOpacity
                onPress={() => toggle(x, done)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={`${x.name}: ${done ? 'done, tap to undo' : 'tap to mark done'}`}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.success : colors.chipBg, borderWidth: done ? 0 : 1.5, borderColor: colors.border }}
              >
                <Text style={{ fontSize: 17, color: done ? '#fff' : 'transparent' }}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, marginLeft: 12 }} onPress={() => setEditing({ ...x })}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{x.name}</Text>
                <Text style={S.muted}>{done ? x.target : 0} / {x.target} {x.unit}</Text>
                {!!x.anchor?.text && <Text style={S.muted}>⚓ After {x.anchor.text.replace(/^after\s+/i, '')}{x.anchor.time ? ` · ${x.anchor.time}` : ''}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeHabit(x)}><Text style={S.delete}>Delete</Text></TouchableOpacity>
            </View>
            {s && (
              <View style={{ flexDirection: 'row', marginTop: 12, gap: 18 }}>
                <View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><StreakFlame streak={s.currentStreak} compact bare /><Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>{s.currentStreak}d</Text></View><Text style={{ fontSize: 12, color: colors.muted }}>Streak</Text></View>
                <StatChip emoji="🏆" value={`${s.bestStreak}d`} label="Best" color={colors} />
                <StatChip emoji="📈" value={`${s.completionRate}%`} label="30d rate" color={colors} />
              </View>
            )}
          </View>
        );
      })}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(15,18,35,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 22, padding: 20 }}>
            {editing && (
              <>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 14 }}>Edit habit</Text>
                <Field label="Name" value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Field label="Target" value={String(editing.target)} onChangeText={(v) => setEditing({ ...editing, target: Number(v) || 1 })} keyboardType="numeric" /></View>
                  <View style={{ flex: 1 }}><Field label="Unit" value={editing.unit} onChangeText={(v) => setEditing({ ...editing, unit: v })} /></View>
                </View>
                <Field label="Anchor: after… (optional)" value={editing.anchor?.text || ''} onChangeText={(v) => setEditing({ ...editing, anchor: { text: v.slice(0, 80), time: editing.anchor?.time || '' } })} placeholder="brushing my teeth" />
                <DateTimeField label="Remind me at (optional)" mode="time" value={editing.anchor?.time || ''} onChange={(v) => setEditing({ ...editing, anchor: { text: editing.anchor?.text || '', time: v || '' } })} />
                <Button title="Save" onPress={saveEdit} />
                <TouchableOpacity onPress={() => setEditing(null)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function StatChip({ emoji, value, label, color }: { emoji: string; value: string; label: string; color: any }) {
  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '800', color: color.ink }}>{emoji} {value}</Text>
      <Text style={{ fontSize: 12, color: color.muted }}>{label}</Text>
    </View>
  );
}
