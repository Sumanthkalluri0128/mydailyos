import { useCallback, useEffect, useMemo, useState } from 'react';
import { BodyTrends } from '../components/BodyTrends';
import { BuddyEmpty } from '../motion/Buddy';
import { tourRef } from '../tour/anchors';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { today } from '../config/api';
import { write, newClientId, useOffline, read } from '../utils/offline';
import { Button, Field, Screen, useThemedStyles } from '../components/UI';
import { useNotifications } from '../components/Notifications';
import { ProgressChart } from '../components/ProgressChart';
import { WeightInsights } from '../components/CoachCards';
import { Chip } from '../components/Chip';
import { successHaptic } from '../utils/haptics';
import { useProfile, refreshProfile } from '../hooks/useProfile';
import { fmtWeight, parseWeightInput, weightValue } from '../utils/units';
import { WeightReveal } from '../components/WeightReveal';
import { ShowMoreButton, useShowMore } from '../components/ShowMore';
import { movingAverage } from '../utils/trend';
import { Platform } from 'react-native';
import { hcAvailable, hcRecentWeights, hcRequestWeight, hcSupport, hcWeightGranted } from '../utils/healthConnect';
import { addDays, formatDateLocal } from '../utils/dates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Scale, WeightScales } from '../components/WeightScales';

const LAST_SCALE_KEY = 'ff_last_weight_scale';

type Range = '30' | '90' | '365' | 'all';
const RANGES: { key: Range; label: string }[] = [{ key: '30', label: '30 days' }, { key: '90', label: '90 days' }, { key: '365', label: '1 year' }, { key: 'all', label: 'All' }];

// `weightKg` is CALIBRATED (main-scale terms, what every analysis uses); `rawKg` is what that scale showed.
type WeightLog = { _id: string; date: string; weightKg: number; rawKg?: number; scaleId?: string; scaleName?: string; notes?: string };
const MAIN: Scale = { id: 'main', name: 'My scale', mode: 'auto', offsetKg: 0, learnedKg: null, samples: 0 };

export default function Weight() {
  const { error, warning, success, undoableDelete } = useNotifications();
  const { S, colors } = useThemedStyles();
  const { syncVersion } = useOffline();
  const { units } = useProfile();
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [weight, setWeight] = useState('');
  const [smoothed, setSmoothed] = useState(true);
  const [range, setRange] = useState<Range>('90');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scales, setScales] = useState<Scale[]>([MAIN]);
  const [referenceId, setReferenceId] = useState('main');
  const [scaleId, setScaleId] = useState('');
  const [showScales, setShowScales] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await read<{ logs: WeightLog[]; scales?: Scale[]; referenceId?: string }>('/api/weight');
      setLogs(response.logs || []);
      if (response.scales?.length) { setScales(response.scales); setReferenceId(response.referenceId || response.scales[0].id); }
    } catch (e: any) {
      error('Unable to load weight history', e?.message || 'Please try again.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [error]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { AsyncStorage.getItem(LAST_SCALE_KEY).then((v) => { if (v) setScaleId(v); }).catch(() => {}); }, []);
  const pickScale = (id: string) => { setScaleId(id); AsyncStorage.setItem(LAST_SCALE_KEY, id).catch(() => {}); };
  const refScale = scales.find((x) => x.id === referenceId) || scales[0];
  // The scale a new weigh-in is for: the one used last (remembered on this phone), else the main scale.
  const activeScale = scales.find((x) => x.id === scaleId) || refScale;
  const offsetKg = Number(activeScale.offsetKg) || 0;
  useEffect(() => { if (syncVersion > 0) load(); }, [syncVersion]);

  const latest = logs[0];
  const first = logs[logs.length - 1];
  const change = latest && first ? Number(latest.weightKg) - Number(first.weightKg) : 0;

  // One point per day for the trend: the mean of that day's calibrated readings (two scales on one day count once).
  const uniqueLogs = useMemo(() => {
    const by = new Map<string, { sum: number; n: number; first: WeightLog }>();
    for (const log of logs) { const e = by.get(log.date); if (e) { e.sum += Number(log.weightKg); e.n += 1; } else by.set(log.date, { sum: Number(log.weightKg), n: 1, first: log }); }
    return [...by.values()].map((e) => ({ ...e.first, weightKg: Math.round((e.sum / e.n) * 100) / 100 }));
  }, [logs]);

  const trend = useMemo(() => movingAverage(uniqueLogs.map((l) => ({ date: l.date, value: Number(l.weightKg) })), 7), [uniqueLogs]);
  // Weight is a line, never bars: bars start at zero, so 78 kg and 80 kg look identical and the trend disappears.
  // `trend` is oldest → newest. The window is cut by calendar days, then shown as a smoothed line with the real weigh-ins as dots.
  const visible = useMemo(() => {
    if (range === 'all') return trend;
    const from = addDays(formatDateLocal(new Date()), -(Number(range) - 1));
    return trend.filter((p) => p.date >= from);
  }, [trend, range]);
  const notesByDate = useMemo(() => { const m: Record<string, string> = {}; for (const x of logs) if (x.notes && !m[x.date]) m[x.date] = x.notes; return m; }, [logs]);
  const line = useMemo(() => visible.map((p) => ({ date: p.date, label: p.date, note: notesByDate[p.date], value: weightValue(smoothed ? p.avg : p.value, units.weight) })), [visible, smoothed, units.weight, notesByDate]);
  const dots = useMemo(() => (smoothed ? visible.map((p) => ({ date: p.date, label: p.date, value: weightValue(p.value, units.weight) })) : undefined), [visible, smoothed, units.weight]);
  const hist = useShowMore(logs, 3);
  const histShown = hist.shown;
  const windowChange = visible.length > 1 ? weightValue(visible[visible.length - 1].value - visible[0].value, units.weight) : null;

  const add = async () => {
    const value = parseWeightInput(weight, units.weight);
    if (!value) return warning('Enter weight', `Enter a valid weight in ${units.weight}.`);
    try {
      const r = await write('POST', '/api/weight', { date: today(), weightKg: value, scaleId: activeScale.id, ...(note.trim() ? { notes: note.trim().slice(0, 300) } : {}), clientId: newClientId('wt') }, 'Weight entry');
      successHaptic();
      pickScale(activeScale.id);
      setWeight('');
      setNote('');
      success(r.queued ? 'Saved offline' : 'Saved', r.queued ? 'Will sync once you\u2019re back online.' : 'Today\u2019s weight has been synced.');
      await load();
      refreshProfile(); // calorie + water targets are worked out from the latest weight
    } catch (e: any) { error('Unable to save weight', e?.message || 'Please try again.'); }
  };

  // Pulls weigh-ins from Health Connect (smart scales, Samsung Health…) for days that have no entry yet. Each one is saved once only.
  const syncFromHealth = async () => {
    try {
      if ((await hcSupport()) !== 'ready') return warning('Health Connect not available', 'Install or update Health Connect from the Play Store, then try again.');
      if (!(await hcWeightGranted()) && !(await hcRequestWeight())) return warning('Permission needed', 'Allow FlexFit to read Weight in Health Connect to import weigh-ins.');
      const have = new Set(logs.filter((x) => (x.scaleId || 'main') === referenceId).map((x) => x.date));
      const fresh = (await hcRecentWeights(30)).filter((w) => !have.has(w.date));
      if (!fresh.length) return success('Up to date', 'No new weigh-ins found in Health Connect.');
      for (const w of fresh) await write('POST', '/api/weight', { date: w.date, weightKg: w.kg, scaleId: referenceId, notes: 'From Health Connect', clientId: `hc-weight-${w.date}` }, 'Weight import');
      success('Imported', `${fresh.length} weigh-in${fresh.length === 1 ? '' : 's'} added from Health Connect.`);
      await load();
      refreshProfile();
    } catch (e: any) { error('Could not import', e?.message || 'Please try again.'); }
  };

  const nudge = (d: number) => { const base = weight ? Number(weight) : latest ? weightValue(Number(latest.weightKg) + offsetKg, units.weight) : 70; setWeight(Math.max(1, base + d).toFixed(1)); };

  const remove = (id: string, wKg: number) => {
    setLogs((prev) => prev.filter((x) => x._id !== id));
    undoableDelete('Removed weigh-in entry', async () => {
      try { await write('DELETE', `/api/weight/${id}`, undefined, 'Delete weight'); } catch (e: any) { error('Delete failed', e.message); load(); }
    }, () => load());
  };

  if (loading) return <SafeAreaView style={S.safe}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={colors.primary} /></View></SafeAreaView>;

  return (
    <Screen buddy="scale" buddySays="Hop on!" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Weight</Text>
      <Text style={S.sub}>Your daily weight history stays synced with your FlexFit account.</Text>

      <View style={{ backgroundColor: colors.primarySolid, borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 15 }}>
        <Text style={{ fontSize: 34 }}>⚖️</Text>
        {latest ? <WeightReveal text={fmtWeight(latest.weightKg, units.weight)} style={{ fontSize: 40, fontWeight: '800', color: '#fff', marginTop: 5 }} /> : <Text style={{ fontSize: 40, fontWeight: '800', color: '#fff', marginTop: 5 }}>--</Text>}
        <Text style={{ color: '#E5DEFF', marginTop: 2 }}>{latest ? latest.date : 'No weight recorded yet'}</Text>
        {logs.length > 1 && <WeightReveal compact text={`${change > 0 ? '+' : ''}${weightValue(change, units.weight).toFixed(1)} ${units.weight} since first recorded`} style={{ color: '#fff', marginTop: 10, fontSize: 12, fontWeight: '700' }} />}
      </View>

      <WeightInsights refreshKey={logs.length} />

      <View style={S.card}>
        <Text style={{ fontSize: 17, fontWeight: '800', marginBottom: 10, color: colors.ink }}>Record today</Text>
        <Field label={`Weight (${units.weight})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={latest ? String(weightValue(latest.weightKg, units.weight)) : '82.5'} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {[-0.5, -0.1, 0.1, 0.5].map((d) => (
            <TouchableOpacity key={d} onPress={() => nudge(d)} accessibilityRole="button" accessibilityLabel={`${d > 0 ? 'Add' : 'Subtract'} ${Math.abs(d)} ${units.weight}`}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primarySoft }}>
              <Text style={{ fontWeight: '800', color: colors.primary }}>{d > 0 ? '+' : '\u2212'}{Math.abs(d)}</Text>
            </TouchableOpacity>))}
        </View>
        {scales.length > 1 && <>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6 }}>Which scale?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
            {scales.map((x) => <Chip key={x.id} small label={x.name + (x.id === referenceId ? ' (main)' : '')} active={x.id === activeScale.id} onPress={() => pickScale(x.id)} />)}
          </View>
          {activeScale.id !== referenceId && offsetKg !== 0 && weight.trim() !== '' && parseWeightInput(weight, units.weight) ? <Text style={[S.muted, { marginBottom: 8 }]}>{activeScale.name} reads {offsetKg > 0 ? '+' : '\u2212'}{weightValue(Math.abs(offsetKg), units.weight).toFixed(1)} {units.weight} vs {refScale.name}, so this counts as {weightValue((parseWeightInput(weight, units.weight) as number) - offsetKg, units.weight).toFixed(1)} {units.weight} in your trend.</Text> : null}
        </>}
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6 }}>What might explain today's number? (optional)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {['Salty dinner', 'Period', 'Travel', 'Alcohol', 'Sick', 'Late meal', 'Hard workout'].map((n) => (
            <Chip key={n} small label={n} active={note.split(', ').includes(n)} onPress={() => setNote((cur) => { const parts = cur ? cur.split(', ').filter(Boolean) : []; return (parts.includes(n) ? parts.filter((x) => x !== n) : [...parts, n]).join(', '); })} />
          ))}
        </View>
        <Field label="Note" value={note} onChangeText={setNote} placeholder="e.g. Salty dinner, Travel" />
        <View ref={tourRef('weight-add')} testID="tour-weight-add" collapsable={false}><Button title="Save / Update Today" onPress={add} /></View>
        <TouchableOpacity onPress={() => setShowScales((v) => !v)} accessibilityRole="button" style={{ paddingVertical: 10, alignItems: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>{showScales ? 'Hide scales' : scales.length > 1 ? 'Manage scales' : 'Using a different scale? Add it'}</Text></TouchableOpacity>
        {Platform.OS === 'android' && hcAvailable() && (
          <TouchableOpacity onPress={syncFromHealth} accessibilityRole="button" style={{ paddingVertical: 12, alignItems: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>⟳ Import weigh-ins from Health Connect</Text></TouchableOpacity>
        )}
      </View>

      {showScales && <WeightScales scales={scales} referenceId={referenceId} onChanged={async () => { await load(); refreshProfile(); }} onPick={pickScale} />}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
        <Chip label="7-day trend" active={smoothed} onPress={() => setSmoothed(true)} small />
        <Chip label="Actual entries" active={!smoothed} onPress={() => setSmoothed(false)} small />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        {RANGES.map((r) => <Chip key={r.key} label={r.label} active={range === r.key} onPress={() => setRange(r.key)} small />)}
      </View>
      <ProgressChart weightValues kind="line" raw={dots} title={smoothed ? 'Weight trend (7-day average)' : 'Weight (actual entries)'} unit={` ${units.weight}`} data={line} emptyText={range === 'all' ? 'Your weight trend will appear here after your first entry.' : 'No weigh-ins in this period — try a longer range.'} />
      {windowChange !== null && <View style={{ marginTop: -6, marginBottom: 10 }}><WeightReveal compact text={`${windowChange > 0 ? '+' : ''}${windowChange.toFixed(1)} ${units.weight} over this period · ${visible.length} weigh-in${visible.length === 1 ? '' : 's'}`} style={S.muted} /></View>}

      <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 12, color: colors.ink }}>History</Text>
      {logs.length ? <>{histShown.map((x) => (
        <View style={[S.item, S.between]} key={x._id}>
          <View style={{ flexShrink: 1 }}><Text style={{ fontWeight: '800', color: colors.ink }}>{x.date}{scales.length > 1 ? ` \u00B7 ${x.scaleName || 'Scale'}` : ''}</Text>{scales.length > 1 && x.rawKg != null && Math.abs(x.rawKg - x.weightKg) >= 0.05 ? <Text style={S.muted}>counts as {fmtWeight(x.weightKg, units.weight)}</Text> : null}{x.notes ? <Text style={S.muted}>{x.notes}</Text> : null}</View>
          <View style={{ alignItems: 'flex-end' }}><WeightReveal compact reaction={false} text={fmtWeight(x.rawKg ?? x.weightKg, units.weight)} style={{ fontSize: 17, fontWeight: '800', color: colors.primary }} /><TouchableOpacity onPress={() => remove(x._id, x.weightKg)}><Text style={S.delete}>Delete</Text></TouchableOpacity></View>
        </View>
      ))}<ShowMoreButton hidden={hist.hidden} open={hist.open} onPress={hist.toggle} noun="entries" /></> : <View style={S.card}><BuddyEmpty scene="scale" title="No weight history yet" text="Step on the scale and log it." /></View>}
      <BodyTrends />
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/photos' as any)} style={[S.card, { flexDirection: 'row', alignItems: 'center' }]}><Text style={{ fontSize: 20 }}>📷</Text><Text style={{ flex: 1, marginLeft: 10, fontWeight: '800', color: colors.ink }}>Progress photos (private, on this phone)</Text><Text style={{ color: colors.muted, fontSize: 22 }}>›</Text></TouchableOpacity>
    </Screen>
  );
}
