// Home "Eaten" card, opened: today's meals as a short list, with the portion editor right there (no trip to the food page).
// Edits save straight away and show the same 5 s Undo toast as everywhere else.
import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { today } from '../../config/api';
import { read, write } from '../../utils/offline';
import { useThemedStyles } from '../UI';
import { useNotifications } from '../Notifications';
import { PortionEdit } from '../PortionEdit';

const MEALS: [string, string][] = [['breakfast', '🌅 Breakfast'], ['lunch', '☀️ Lunch'], ['dinner', '🌙 Dinner'], ['snacks', '🍎 Snacks']];
const kcal = (l: any) => Math.round(Number(l.nutritionTotal?.calories) || 0);

export function EatenSheet({ visible, onChanged, onClose }: { visible: boolean; onChanged?: () => void; onClose?: () => void }) {
  const { S, colors } = useThemedStyles();
  const { error, undoableDelete } = useNotifications();
  const [logs, setLogs] = useState<any[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setLogs((await read<any>(`/api/food-logs?date=${today()}`)).logs || []); } catch { setLogs([]); }
  }, []);
  useEffect(() => { if (visible) { setEditId(null); load(); } }, [visible, load]);

  const save = async (x: any, quantity: number) => {
    setBusy(true);
    try {
      const before = Number(x.consumedQuantity);
      await write('PATCH', `/api/food-logs/${x._id}`, { quantity }, `Change ${x.foodName}`);
      setEditId(null);
      onClose?.();   // the sheet is a modal and would cover the Undo toast, so it closes after a save
      undoableDelete(`${x.foodName} is now ${quantity} ${x.servingUnit}`, () => {}, async () => {
        try { await write('PATCH', `/api/food-logs/${x._id}`, { quantity: before }, `Change ${x.foodName}`); } catch { /* shown on reload */ }
        await load(); onChanged?.();
      });
      await load(); onChanged?.();
    } catch (e: any) { error('Could not change the amount', e.message); } finally { setBusy(false); }
  };

  if (logs === null) return <Text style={S.muted}>Loading…</Text>;
  if (!logs.length) return <Text style={S.muted}>Nothing logged yet today. A small snack or a full meal, whatever you ate, goes here.</Text>;
  return (
    <View style={{ gap: 12 }}>
      {MEALS.map(([id, label]) => {
        const rows = logs.filter((l) => l.mealType === id);
        if (!rows.length) return null;
        return (
          <View key={id} accessibilityLabel={label}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{label}</Text>
              <Text style={S.muted}>{rows.reduce((s, l) => s + kcal(l), 0).toLocaleString()} kcal</Text>
            </View>
            {rows.map((x) => (
              <View key={x._id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 50 }}>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: colors.ink }}>{x.foodName}</Text><Text style={S.muted}>{x.consumedQuantity} {x.servingUnit} · {kcal(x)} kcal</Text></View>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit amount of ${x.foodName}`} accessibilityState={{ expanded: editId === x._id }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setEditId(editId === x._id ? null : x._id)}><Text style={{ color: colors.primary, fontWeight: '800' }}>✏️ Edit</Text></TouchableOpacity>
                </View>
                {editId === x._id && <PortionEdit name={x.foodName} foodId={x.foodId?._id || x.foodId} quantity={x.consumedQuantity} unit={x.servingUnit} calories={x.nutritionTotal?.calories || 0} protein={x.nutritionTotal?.protein || 0} busy={busy} onCancel={() => setEditId(null)} onSave={(q) => save(x, q)} />}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
