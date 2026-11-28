// Hidden-oil tracker: oil and ghee are the biggest silent calorie source in home cooking. Quick "teaspoons today" entry.
import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { Chip } from './Chip';
import { read } from '../utils/offline';
import { del, post, today } from '../config/api';
import { newClientId } from '../utils/offline';

export function OilCard() {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const [d, setD] = useState<{ tsp: number; kcal: number; entries: { _id: string; value: number }[] } | null>(null);
  const load = useCallback(async () => { try { setD(await read<any>(`/api/plan/oil?date=${today()}`)); } catch { /* optional */ } }, []);
  useEffect(() => { load(); }, [load]);
  const add = async (tsp: number) => { try { await post('/api/health-logs', { type: 'oil', date: today(), value: tsp, clientId: newClientId('o') }); success('Added', `${tsp} tsp of oil or ghee.`); load(); } catch (e: any) { error('Could not add', e.message); } };
  const undo = async () => { const last = d?.entries?.[0]; if (!last) return; try { await del(`/api/health-logs/${last._id}`); load(); } catch (e: any) { error('Could not undo', e.message); } };
  return (
    <View style={S.card}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>🫒 Hidden oil today</Text>
      <Text style={[S.muted, { marginTop: 2 }]}>Oil and ghee in home cooking are easy to miss. 1 teaspoon is about 40 kcal.</Text>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary, marginTop: 8 }}>{d ? `${d.tsp} tsp` : '—'}{d && d.tsp > 0 ? <Text style={{ fontSize: 14, color: colors.muted }}>  ≈ {d.kcal} kcal</Text> : null}</Text>
      {d && d.tsp > 0 && <Text style={S.muted}>This is not included in your food log total. Add it to a recipe or entry if you want it counted.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {[1, 2, 3, 5].map((t) => <Chip key={t} small label={`+${t} tsp`} onPress={() => add(t)} />)}
        {d && d.entries.length > 0 && <TouchableOpacity onPress={undo} style={{ justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Undo last</Text></TouchableOpacity>}
      </View>
    </View>
  );
}
