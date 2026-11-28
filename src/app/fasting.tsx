import { useShowMore, ShowMoreButton } from '../components/ShowMore';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { post, del } from '../config/api';
import { Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { useNotifications } from '../components/Notifications';
import { successHaptic } from '../utils/haptics';
import { prettyDate } from '../utils/dates';
import { read } from '../utils/offline';

const PLANS = [{ h: 12, n: '12:12' }, { h: 14, n: '14:10' }, { h: 16, n: '16:8' }, { h: 18, n: '18:6' }, { h: 20, n: '20:4' }];
const hm = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };

export default function Fasting() {
  const { error, success, undoableDelete } = useNotifications();
  const { S, colors } = useThemedStyles();
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const pastFasts = useShowMore(history, 5); // the list can be long: show the newest few, one tap for the rest
  const [target, setTarget] = useState(16);
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const r = await read<any>('/api/fasting'); setCurrent(r.current); setHistory(r.history || []); if (r.current) setTarget(r.current.targetHours); }
    catch (e: any) { error('Could not load', e.message); } finally { setRefreshing(false); }
  }, [error]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const act = async (path: string, body?: any) => {
    try {
      await post(path, body || {});
      successHaptic(); await load();
    } catch (e: any) { error('Something went wrong', e.message); }
  };

  const elapsed = current ? now - new Date(current.startedAt).getTime() : 0;
  const goalMs = target * 3600_000;
  const pct = Math.min(100, Math.round((elapsed / goalMs) * 100));
  const done = elapsed >= goalMs;
  const stage = elapsed < 4 * 3600_000 ? 'Digesting' : elapsed < 12 * 3600_000 ? 'Fuel switching' : elapsed < 16 * 3600_000 ? 'Fat burning' : 'Deep fast';

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <Text style={S.title}>Fasting</Text>
      <Text style={S.sub}>Intermittent fasting timer.</Text>

      <View style={{ backgroundColor: current ? (done ? '#157A4E' : colors.primary) : colors.card, borderRadius: 24, padding: 22, marginBottom: 14, elevation: 2 }}>
        {current ? (
          <>
            <Text style={{ color: '#DCD4FF', fontSize: 12, fontWeight: '800' }}>{done ? 'GOAL REACHED 🎉' : 'FASTING'} · {stage.toUpperCase()}</Text>
            <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 4 }}>{hm(elapsed)}</Text>
            <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.28)', marginTop: 14, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#fff', borderRadius: 7 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{pct}%</Text>
              <Text style={{ color: '#E8E3FF' }}>{done ? `+${hm(elapsed - goalMs)} over` : `${hm(goalMs - elapsed)} to go`} · goal {target}h</Text>
            </View>
            <TouchableOpacity onPress={() => act('/api/fasting/end')} style={{ backgroundColor: '#fff', padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 16 }}>
              <Text style={{ fontWeight: '800', color: colors.primary }}>End fast</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>Choose a fasting window</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
              {PLANS.map((p) => <Chip key={p.h} label={`${p.n} (${p.h}h)`} active={target === p.h} onPress={() => setTarget(p.h)} />)}
            </View>
            <TouchableOpacity onPress={() => act('/api/fasting/start', { targetHours: target })} style={[S.button, { marginTop: 10 }]}>
              <Text style={S.buttonText}>Start {target}-hour fast</Text>
            </TouchableOpacity>
            <Text style={[S.muted, { marginTop: 10 }]}>Fasting is not suitable for everyone (pregnancy, diabetes, eating disorders, under 18). Check with a doctor first.</Text>
          </>
        )}
      </View>

      <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 10, color: colors.ink }}>Past fasts</Text>
      {history.length ? <>{pastFasts.shown.map((f) => (
        <View style={[S.item, S.row]} key={f._id}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{f.hours} h {f.hours >= f.targetHours ? '✓' : ''}</Text>
            <Text style={S.muted}>{prettyDate(f.startedAt.slice(0, 10))} · goal {f.targetHours}h</Text>
          </View>
          <TouchableOpacity onPress={() => undoableDelete('Fast', async () => { try { await del(`/api/fasting/${f._id}`); } catch (e: any) { error('Delete failed', e.message); } }, () => load())}>
            <Text style={S.delete}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}<ShowMoreButton hidden={pastFasts.hidden} open={pastFasts.open} onPress={pastFasts.toggle} noun="fasts" /></> : <View style={S.card}><Text style={S.muted}>No completed fasts yet.</Text></View>}
    </Screen>
  );
}
