// "Copy yesterday's lunch" / "Same as last time": shows what would be added (quantities editable) before anything is saved.
import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { read, write } from '../utils/offline';
import { successHaptic } from '../utils/haptics';

type Entry = { _id: string; foodName: string; quantity: number; servingUnit: string; calories: number };
type Resp = { found: boolean; date: string | null; kcal: number; entries: Entry[] };

export function RepeatPreview({ date, meal, mode, onClose, onDone }: { date: string; meal: string; mode: 'yesterday' | 'last'; onClose: () => void; onDone: () => void }) {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const [d, setD] = useState<Resp | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    read<Resp>(`/api/food-logs/repeat?date=${date}&meal=${meal}&mode=${mode}`).then((j) => { if (live) { setD(j); setQty(Object.fromEntries(j.entries.map((e) => [e._id, String(e.quantity)]))); } })
      .catch(() => { if (live) { error('Could not load that meal', 'Check your connection and try again.'); onClose(); } });
    return () => { live = false; };
  }, [date, meal, mode]);
  if (!d) return <View style={S.card}><Text style={S.muted}>Looking…</Text></View>;
  if (!d.found) return (
    <View style={S.card}>
      <Text style={{ color: colors.ink }}>{mode === 'yesterday' ? `You did not log ${meal} yesterday.` : `No earlier ${meal} found to repeat.`}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Close</Text></TouchableOpacity>
    </View>
  );
  const chosen = d.entries.filter((e) => !off[e._id]);
  const add = async () => {
    setBusy(true);
    try {
      const r = await write('POST', '/api/food-logs/copy', { fromDate: d.date, toDate: date, mealType: meal, ids: chosen.map((e) => e._id), edits: chosen.map((e) => ({ id: e._id, quantity: Number(qty[e._id]) })) }, `Copy ${meal}`);
      successHaptic();
      const added = r.data?.logs?.length ?? chosen.length;
      if (!r.queued && !added && r.data?.skipped) success('Already there', `That ${meal} is already added, so nothing was added twice.`);
      else success(r.queued ? 'Queued' : 'Added', r.queued ? `${meal} will be added when you're online.` : `${added} item(s) added to ${meal}.`);
      onDone();
    } catch (e: any) { error('Could not copy', e.message); } finally { setBusy(false); }
  };
  return (
    <View style={S.card} accessibilityLabel={`Repeat ${meal}`}>
      <Text style={{ fontWeight: '800', color: colors.ink }}>{mode === 'yesterday' ? `Yesterday's ${meal}` : `Your last ${meal}`} · {d.date} · {d.kcal} kcal</Text>
      {d.entries.map((e) => (
        <View key={e._id} style={[S.row, { marginTop: 8 }]}>
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: !off[e._id] }} accessibilityLabel={`Include ${e.foodName}`} onPress={() => setOff({ ...off, [e._id]: !off[e._id] })} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 20, color: colors.primary }}>{off[e._id] ? '☐' : '☑'}</Text></TouchableOpacity>
          <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }} numberOfLines={2}>{e.foodName}</Text>
          <TextInput accessibilityLabel={`Amount of ${e.foodName}`} style={[S.input, { width: 76, marginBottom: 0, minHeight: 44, paddingVertical: 8 }]} keyboardType="decimal-pad" value={qty[e._id] ?? ''} onChangeText={(v) => setQty({ ...qty, [e._id]: v })} />
          <Text style={{ width: 34, marginLeft: 6, color: colors.muted }}>{e.servingUnit}</Text>
        </View>
      ))}
      <TouchableOpacity accessibilityRole="button" disabled={busy || !chosen.length} onPress={add} style={[S.button, { opacity: busy || !chosen.length ? 0.5 : 1 }]}><Text style={S.buttonText}>Add {chosen.length} to today</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
    </View>
  );
}
