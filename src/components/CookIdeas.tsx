// "What can I cook?" Tick what you have; ideas come from your recipes, then your foods, then the catalogue. Foods you avoid never appear.
import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemedStyles, Button } from './UI';
import { Chip } from './Chip';
import Buddy from '../motion/Buddy';
import { useNotifications } from './Notifications';
import { post, today } from '../config/api';
import { write, newClientId } from '../utils/offline';

const STAPLES = ['rice', 'dal', 'paneer', 'egg', 'chicken', 'curd', 'oats', 'potato', 'onion', 'tomato', 'besan', 'spinach', 'chickpeas', 'bread', 'milk', 'banana'];
const KEY = 'ff-pantry';

export function CookIdeas({ meal, onLogged }: { meal: string; onLogged: () => void }) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [have, setHave] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setHave(a.filter((x) => typeof x === 'string')); } catch { /* ignore */ } }).catch(() => {}); }, []);
  const save = (a: string[]) => { setHave(a); AsyncStorage.setItem(KEY, JSON.stringify(a)).catch(() => {}); };
  const toggle = (x: string) => save(have.includes(x) ? have.filter((y) => y !== x) : [...have, x]);
  const addExtra = () => { const t = extra.trim().toLowerCase().slice(0, 40); if (t && !have.includes(t)) save([...have, t]); setExtra(''); };
  const find = async () => {
    setBusy(true);
    try { setRes(await post<any>('/api/foods/cook-ideas', { have, date: today(), mealType: meal })); }
    catch (e: any) { error('Could not find ideas', e.message || 'Ideas need a connection.'); } finally { setBusy(false); }
  };
  const log = async (i: any) => {
    try {
      const r = await write('POST', '/api/food-logs', { foodId: i.foodId, date: today(), mealType: meal, quantity: i.servingSize || 1, clientId: newClientId('cook') }, i.name);
      success(r.queued ? 'Queued' : 'Added', `${i.name} to ${meal}.`); onLogged();
    } catch (e: any) { error('Could not add that', e.message); }
  };
  return (
    <View style={[S.card, { marginBottom: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Buddy scene="chef" size={44} talk={false} /><View style={{ marginLeft: 8, flex: 1 }}><Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>What can I cook?</Text><Text style={S.muted}>Tick what you have at home.</Text></View></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {[...new Set([...STAPLES, ...have])].map((x) => <Chip key={x} small label={x} active={have.includes(x)} onPress={() => toggle(x)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TextInput accessibilityLabel="Add an ingredient" style={[S.input, { flex: 1, marginBottom: 0 }]} value={extra} maxLength={40} onChangeText={setExtra} onSubmitEditing={addExtra} placeholder="Something else, e.g. cabbage" placeholderTextColor={colors.muted} returnKeyType="done" />
        <Chip small label="Add" onPress={addExtra} />
      </View>
      <View style={{ marginTop: 10 }}><Button title={busy ? 'Thinking…' : `Find meals with ${have.length} ingredient${have.length === 1 ? '' : 's'}`} disabled={busy || !have.length} onPress={find} /></View>
      {res && <Text style={[S.muted, { marginBottom: 6 }]}>Left today: {Math.round(res.remaining?.calories ?? 0)} kcal, {Math.max(0, Math.round(res.remaining?.protein ?? 0))} g protein.{res.message ? ` ${res.message}` : ''}</Text>}
      {res?.groups?.map((g: any) => (
        <View key={g.id} style={{ marginTop: 6 }}>
          <Text style={S.label}>{g.title}</Text>
          {g.items.map((i: any) => (
            <View key={`${g.id}-${i.name}`} style={[S.row, { marginBottom: 6 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{i.name}</Text>
                <Text style={S.muted}>{Math.round(i.calories)} kcal · {Math.round(i.protein)} g protein · {i.reason}{i.missing?.length ? ` · still need: ${i.missing.join(', ')}` : ''}</Text>
              </View>
              {!!i.foodId && <TouchableOpacity onPress={() => log(i)} accessibilityRole="button" accessibilityLabel={`Add ${i.name} to ${meal}`} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Add</Text></TouchableOpacity>}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
