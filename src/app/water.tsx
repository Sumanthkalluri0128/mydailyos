import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { today } from '../config/api';
import { write, newClientId, useOffline, read } from '../utils/offline';
import { Button, Field, Screen, useThemedStyles } from '../components/UI';
import { useNotifications } from '../components/Notifications';
import { successHaptic } from '../utils/haptics';
import { useProfile } from '../hooks/useProfile';
import { fmtVolume, fmtWeight, parseVolumeInput, volumeValue, waterPresets } from '../utils/units';
import { resolveTargets } from '../utils/energy';
import { OilCard } from '../components/OilCard';
import { useWaterBoost } from '../utils/weatherStore';
import { WeatherWaterCard } from '../components/WeatherWaterCard';
import { markDoneToday, refreshWaterNudges, rememberWaterGoal } from '../utils/notifications';

export default function Water() {
  const { error, warning, success, undoableDelete } = useNotifications();
  const { S, colors } = useThemedStyles();
  const { syncVersion } = useOffline();
  const { units, goals, profile } = useProfile();
  const [l, setL] = useState<any[]>([]);
  const [a, setA] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try { setL((await read<any>(`/api/water?date=${today()}`)).logs || []); }
    catch (e: any) { error('Something went wrong', e.message); }
    finally { setRefreshing(false); setLoaded(true); }
  }, [error]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (syncVersion > 0) load(); }, [syncVersion]);

  const total = l.reduce((s, x) => s + Number(x.amountMl || 0), 0);
  // Target follows body weight (~35 ml per kg). Falls back to the saved goal until a weight is known.
  const weightKg = profile?.currentWeightKg || null;
  const boost = useWaterBoost(resolveTargets(profile as any)?.waterMl ?? 3000);
  const target = boost.goalMl; // after the optional hot-day rule
  const pct = Math.round((total / target) * 100);
  // Goal met -> no more water nudges today (and back on if an entry is deleted).
  useEffect(() => { if (loaded) markDoneToday('water', total >= target && target > 0); }, [total, target, loaded]);
  const left = Math.max(0, target - total);
  // "No water in the last hour" reminders hang off the LAST entry: whenever the entries change, re-plan the chain from the new last time.
  const waterSig = useRef('');
  useEffect(() => {
    if (!loaded) return;
    rememberWaterGoal(target);
    const times = l.map((x) => new Date(x.createdAt).getTime()).filter((t) => Number.isFinite(t));
    const last = times.length ? Math.max(...times) : 0;
    const sig = `${last}|${total}|${target}`;
    if (sig === waterSig.current) return;
    waterSig.current = sig;
    refreshWaterNudges({ lastLogAt: last ? new Date(last) : null, totalMl: total, goalMl: target });
  }, [l, loaded, total, target]);

  // The glass shows up the moment you tap, the server confirms in the background, and if it fails the glass is taken back with a message.
  // Nothing waits on the network, so the screen never freezes (and a slow or waking server shows the "Saving..." pill instead).
  const logAmount = async (ml: number, label: string) => {
    successHaptic();
    const clientId = newClientId('w');
    const tempId = `pending:${clientId}`;
    setL((prev) => [...prev, { _id: tempId, amountMl: ml, createdAt: new Date().toISOString(), pending: true }]);
    setA('');
    try {
      const r = await write('POST', '/api/water', { date: today(), amountMl: ml, clientId }, `Water ${label}`);
      success(r.queued ? 'Saved offline' : 'Saved', r.queued ? 'Will sync once you\u2019re back online.' : `${label} logged.`);
      load(); // swaps the pending glass for the saved one
    } catch (e: any) {
      setL((prev) => prev.filter((x) => x._id !== tempId));
      error('Could not save', `${label} was not saved. ${e.message || 'Please try again.'}`);
    }
  };

  const add = async () => {
    const ml = parseVolumeInput(a, units.volume);
    if (!ml) return warning('Enter amount', `Enter a valid amount in ${units.volume}.`);
    await logAmount(ml, fmtVolume(ml, units.volume));
  };

  const remove = (id: string, amountMl: number) => {
    setL((prev) => prev.filter((x) => x._id !== id));
    undoableDelete(`Removed ${fmtVolume(amountMl, units.volume)}`, async () => {
      try { await write('DELETE', `/api/water/${id}`, undefined, 'Delete water'); } catch (e: any) { error('Delete failed', e.message); load(); }
    }, () => load());
  };

  return (
    <Screen buddyWho="naruto" buddy="drink" buddySays="Sip time!" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Water</Text>
      <Text style={S.sub}>Hydration for today.</Text>
      <View style={{ backgroundColor: '#2587D9', borderRadius: 24, padding: 22, marginBottom: 15 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ color: '#DCEFFF', fontSize: 12, fontWeight: '800' }}>DRUNK TODAY</Text>
            <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff', marginTop: 2 }}>{fmtVolume(total, units.volume)}</Text>
          </View>
          <Text style={{ fontSize: 34 }}>💧</Text>
        </View>
        <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.min(100, pct) }} style={{ height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.28)', marginTop: 16, overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 8, backgroundColor: '#fff', minWidth: total > 0 ? 16 : 0 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{pct}%</Text>
          <Text style={{ color: '#DCEFFF', fontSize: 13 }}>{left > 0 ? `${fmtVolume(left, units.volume)} to go` : 'Goal reached 🎉'}</Text>
        </View>
      </View>
      <View style={S.card}>
        <Text style={S.label}>Daily target</Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{fmtVolume(target, units.volume)}</Text>
        <Text style={[S.muted, { marginTop: 4 }]}>
          {!!weightKg
            ? 'Based on your weight (35 ml per kg). It updates when you log a new weight.'
            : 'Add your weight in Profile and this target will be worked out for you (35 ml per kg).'}
        </Text>
      </View>
      {!!boost.reason && <View style={S.card}><Text accessibilityLiveRegion="polite" style={{ color: colors.ink }}>☀️ {boost.reason}</Text></View>}
      <WeatherWaterCard reason={boost.reason} />
      <View style={S.card}>
        <Text style={S.label}>One tap</Text>
        <View style={S.row}>
          {waterPresets(units.volume).map((v) => (
            <TouchableOpacity key={v} onPress={() => logAmount(v, fmtVolume(v, units.volume))} style={{ padding: 10, backgroundColor: colors.chipBg, borderRadius: 12, marginRight: 8 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{volumeValue(v, units.volume)} {units.volume}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field label={`Custom amount (${units.volume})`} value={a} onChangeText={setA} keyboardType="numeric" placeholder={units.volume === 'oz' ? '12' : '250'} />
        <Button title="Add Water" onPress={add} />
      </View>
      {l.map((x) => (
        <View style={[S.item, S.between, x.pending ? { opacity: 0.6 } : null]} key={x._id}>
          <Text style={{ color: colors.ink }}>💧 {fmtVolume(x.amountMl, units.volume)}</Text>
          {x.pending ? <Text style={S.muted}>{'Saving\u2026'}</Text> : <TouchableOpacity onPress={() => remove(x._id, x.amountMl)}><Text style={S.delete}>Delete</Text></TouchableOpacity>}
        </View>
      ))}
      <OilCard />
    </Screen>
  );
}
