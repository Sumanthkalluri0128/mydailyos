// Chai / coffee cup counter. Calories come from the server (catalogue milk + sugar), never typed in.
import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import Buddy from '../motion/Buddy';
import { useNotifications } from './Notifications';
import { read, write, newClientId } from '../utils/offline';
import { today } from '../config/api';

const MILKS: [string, string][] = [['full', 'Full-cream'], ['toned', 'Toned'], ['soy', 'Soy'], ['none', 'Black']];
const SIZES: [string, string][] = [['cutting', 'Cutting'], ['regular', 'Cup'], ['mug', 'Mug']];
type Calc = { ok: boolean; message?: string; kcal: number; perCupKcal: number; sugarKcal: number; label: string };

export function ChaiCounter({ onLogged }: { onLogged: () => void }) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [drink, setDrink] = useState('tea');
  const [cups, setCups] = useState(1);
  const [sugar, setSugar] = useState(1);
  const [milk, setMilk] = useState('toned');
  const [size, setSize] = useState('regular');
  const [calc, setCalc] = useState<Calc | null>(null);
  const [week, setWeek] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    read<any>(`/api/food-logs/chai/preview?cups=${cups}&sugarSpoons=${sugar}&milk=${milk}&cupSize=${size}&drink=${drink}`).then((j) => live && setCalc(j.calc)).catch(() => live && setCalc(null));
    return () => { live = false; };
  }, [cups, sugar, milk, size, drink]);
  const loadWeek = () => read<any>(`/api/food-logs/chai/weekly?end=${today()}`).then((j) => setWeek(j.note || '')).catch(() => {});
  useEffect(() => { loadWeek(); }, []);
  const log = async () => {
    setBusy(true);
    try {
      const r = await write('POST', '/api/food-logs/chai', { date: today(), mealType: 'snacks', cups, sugarSpoons: sugar, milk, cupSize: size, drink, clientId: newClientId('chai') }, 'Chai');
      success(r.queued ? 'Queued' : 'Logged', r.queued ? 'Your chai will be added when you are online.' : `${r.data?.calc?.label || 'Chai'}: ${r.data?.calc?.kcal ?? calc?.kcal} kcal.`);
      onLogged(); loadWeek();
    } catch (e: any) { error('Could not log that', e.message); } finally { setBusy(false); }
  };
  const stepBtn = (label: string, a11y: string, fn: () => void) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y} onPress={fn} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: colors.primary, fontWeight: '800' }}>{label}</Text></TouchableOpacity>;
  return (
    <View style={S.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Buddy scene="drink" size={44} /><View style={{ marginLeft: 8, flex: 1 }}><Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>Chai and coffee counter</Text><Text style={S.muted}>Cups, sugar and milk. Calories are worked out for you.</Text></View></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {[['tea', '🍵 Chai'], ['coffee', '☕ Coffee']].map(([id, l]) => <Chip key={id} small label={l} active={drink === id} onPress={() => setDrink(id)} />)}
        {SIZES.map(([id, l]) => <Chip key={id} small label={l} active={size === id} onPress={() => setSize(id)} />)}
      </View>
      <View style={[S.row, { marginTop: 6 }]}>
        <Text style={{ color: colors.ink, flex: 1 }}>Cups</Text>
        {stepBtn('−', 'One cup less', () => setCups(Math.max(1, cups - 1)))}<Text style={{ fontWeight: '800', color: colors.ink, minWidth: 28, textAlign: 'center' }} accessibilityLiveRegion="polite">{cups}</Text>{stepBtn('＋', 'One cup more', () => setCups(Math.min(20, cups + 1)))}
      </View>
      <View style={S.row}>
        <Text style={{ color: colors.ink, flex: 1 }}>Sugar spoons per cup</Text>
        {stepBtn('−', 'Less sugar', () => setSugar(Math.max(0, sugar - 0.5)))}<Text style={{ fontWeight: '800', color: colors.ink, minWidth: 28, textAlign: 'center' }} accessibilityLiveRegion="polite">{sugar}</Text>{stepBtn('＋', 'More sugar', () => setSugar(Math.min(6, sugar + 0.5)))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{MILKS.map(([id, l]) => <Chip key={id} small label={l} active={milk === id} onPress={() => setMilk(id)} />)}</View>
      {calc?.ok && <Text style={{ marginTop: 8, color: colors.ink }}><Text style={{ fontWeight: '800' }}>{calc.kcal} kcal</Text> ({calc.perCupKcal} per cup{calc.sugarKcal ? `, ${calc.sugarKcal} from sugar` : ''})</Text>}
      {calc && !calc.ok && <Text style={S.muted}>{calc.message}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={busy || !calc?.ok} onPress={log} style={[S.button, { opacity: busy || !calc?.ok ? 0.5 : 1 }]}><Text style={S.buttonText}>Log {cups} cup{cups === 1 ? '' : 's'}</Text></TouchableOpacity>
      {!!week && <Text style={[S.muted, { marginTop: 6 }]}>This week: {week}</Text>}
    </View>
  );
}
