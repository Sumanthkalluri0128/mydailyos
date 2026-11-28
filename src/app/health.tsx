import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { today } from '../config/api';
import { write, newClientId, useOffline, read } from '../utils/offline';
import { Button, Field, Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { useNotifications } from '../components/Notifications';
import { successHaptic } from '../utils/haptics';
import { useProfile } from '../hooks/useProfile';
import { useSteps } from '../hooks/useSteps';
import { StepsCard } from '../components/StepsCard';
import { ShowMoreButton, useShowMore } from '../components/ShowMore';
import { ProgressChart } from '../components/ProgressChart';
import { addDays, prettyDate } from '../utils/dates';

type Kind = 'steps' | 'sleep' | 'heartRate' | 'bloodPressure' | 'glucose' | 'body';
const TABS: { id: Kind; label: string }[] = [
  { id: 'steps', label: '👟 Steps' }, { id: 'sleep', label: '😴 Sleep' }, { id: 'heartRate', label: '❤️ Heart' },
  { id: 'bloodPressure', label: '🩺 BP' }, { id: 'glucose', label: '🩸 Glucose' }, { id: 'body', label: '📏 Body' },
];
const BODY = [{ id: 'waist', label: 'Waist' }, { id: 'chest', label: 'Chest' }, { id: 'hips', label: 'Hips' }, { id: 'arm', label: 'Arm' }, { id: 'thigh', label: 'Thigh' }, { id: 'neck', label: 'Neck (for body-fat estimate)' }];
const META: Record<string, { unit: string; hint: string; field: string }> = {
  sleep: { unit: ' h', hint: 'Hours slept last night', field: 'Hours slept' },
  heartRate: { unit: ' bpm', hint: 'Resting heart rate is best measured after sitting quietly for 5 minutes', field: 'Beats per minute' },
  bloodPressure: { unit: ' mmHg', hint: 'Top number first (systolic), then bottom (diastolic)', field: 'Systolic (top)' },
  glucose: { unit: ' mg/dL', hint: 'Blood sugar reading', field: 'mg/dL' },
  body: { unit: ' cm', hint: 'Measure at the same spot, same time of day', field: 'Centimetres' },
};

export default function Health() {
  const { error, warning, success, undoableDelete } = useNotifications();
  const { S, colors } = useThemedStyles();
  const { syncVersion } = useOffline();
  const { profile, goals } = useProfile();
  const stepper = useSteps();
  const connectHealthFlow = async () => {
    const ok = await stepper.connectHealth();
    if (ok) success('Connected', 'Steps now come from Health Connect — the same total your Samsung Health shows.');
    else warning('Not connected', 'Allow “Steps” for FlexFit in the Health Connect prompt. Also make sure Samsung Health is set to share steps with Health Connect (see the steps guide).');
  };
  const [tab, setTab] = useState<Kind>('steps');
  const [bodyPart, setBodyPart] = useState('waist');
  const [val, setVal] = useState('');
  const [val2, setVal2] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const type = tab === 'body' ? bodyPart : tab;

  const load = useCallback(async () => {
    try {
      const r = await read<any>(`/api/health-logs?type=${type}&from=${addDays(today(), -59)}&to=${today()}&limit=200`);
      setLogs(Array.isArray(r.logs) ? r.logs : []);
    } catch (e: any) { error('Could not load', e.message); } finally { setRefreshing(false); }
  }, [type, error]);
  useEffect(() => { load(); }, [load, stepper.steps]);
  useEffect(() => { if (syncVersion > 0) load(); }, [syncVersion]);

  const save = async () => {
    const n = Number(val.replace(',', '.'));
    if (!(n > 0)) return warning('Enter a value', 'Type a number first.');
    const body: any = { type, date: today(), value: n, clientId: newClientId('hl') };
    if (tab === 'bloodPressure') {
      const d = Number(val2);
      if (!(d > 0)) return warning('Missing value', 'Enter the bottom (diastolic) number too.');
      if (d >= n) return warning('Check the numbers', 'The top number must be higher than the bottom one.');
      body.value2 = d;
    }
    try {
      if (tab === 'steps') await stepper.setManual(Math.round(n));
      else await write('POST', '/api/health-logs', body, 'Health entry');
      successHaptic(); success('Saved', 'Your entry was recorded.');
      setVal(''); setVal2(''); load();
    } catch (e: any) { error('Could not save', e.message); }
  };

  const remove = (id: string) => undoableDelete('Entry', async () => {
    try { await write('DELETE', `/api/health-logs/${id}`, undefined, 'Delete entry'); } catch (e: any) { error('Delete failed', e.message); load(); }
  }, () => load());

  const series = useMemo(() => [...logs].reverse().map((l) => ({ label: l.date, date: l.date, value: Number(l.value) })), [logs]);
  const meta = META[tab] || META.body;
  const label = (l: any) => tab === 'bloodPressure' ? `${l.value}/${l.value2} mmHg` : tab === 'steps' ? `${Number(l.value).toLocaleString()} steps` : `${l.value}${meta.unit}`;
  const stepTarget = goals?.stepsTarget || 10000;

  const logHist = useShowMore(logs.slice(0, 60), 3);
  return (
    <Screen buddyWho="zoro" buddy="walk" buddySays="Let's move!" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); stepper.refresh(); }} />}>
      <Text style={S.title}>Health</Text>
      <Text style={S.sub}>Steps, sleep and vitals in one place.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {TABS.map((t) => <Chip key={t.id} label={t.label} active={tab === t.id} onPress={() => setTab(t.id)} />)}
      </ScrollView>

      {tab === 'steps' && <StepsCard steps={stepper.steps} target={stepTarget} weightKg={profile?.currentWeightKg} state={stepper.state} onEnable={stepper.enable} source={stepper.source} sourceNames={stepper.sourceNames} hcSupported={stepper.hcSupported} onConnectHealth={connectHealthFlow} onDisconnectHealth={stepper.disconnectHealth} />}
      {tab === 'body' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {BODY.map((b) => <Chip key={b.id} small label={b.label} active={bodyPart === b.id} onPress={() => setBodyPart(b.id)} />)}
        </View>
      )}

      <View style={S.card}>
        <Text style={S.label}>{tab === 'steps' ? 'Set today\'s steps (if your phone missed some)' : meta.hint}</Text>
        {tab === 'bloodPressure' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="Systolic (top)" value={val} onChangeText={setVal} keyboardType="numeric" placeholder="120" /></View>
            <View style={{ flex: 1 }}><Field label="Diastolic (bottom)" value={val2} onChangeText={setVal2} keyboardType="numeric" placeholder="80" /></View>
          </View>
        ) : (
          <Field label={tab === 'steps' ? 'Total steps today' : meta.field} value={val} onChangeText={setVal} keyboardType="decimal-pad" placeholder={tab === 'sleep' ? '7.5' : ''} />
        )}
        <Button title={tab === 'steps' ? 'Update steps' : 'Save reading'} onPress={save} />
        {tab !== 'steps' && tab !== 'body' && tab !== 'sleep' && <Text style={[S.muted, { marginTop: 10 }]}>For tracking only — not medical advice. Talk to a doctor about any reading that worries you.</Text>}
      </View>

      <ProgressChart
        title={tab === 'steps' ? 'Steps — last 60 days' : `${TABS.find((t) => t.id === tab)?.label.replace(/^\S+\s/, '') || ''} trend`}
        unit={tab === 'steps' ? '' : meta.unit} data={series} target={tab === 'steps' ? stepTarget : null}
        kind={tab === 'steps' || tab === 'sleep' ? 'bar' : 'line'} emptyText="No readings yet."
      />

      <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 10, color: colors.ink }}>History</Text>
      {logs.length ? <>{logHist.shown.map((l) => (
        <View style={[S.item, S.row]} key={l._id}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{label(l)}</Text>
            <Text style={S.muted}>{l.date === today() ? 'Today' : prettyDate(l.date)}{l.source === 'device' ? ' · from phone' : ''}</Text>
          </View>
          {tab !== 'steps' && <TouchableOpacity onPress={() => remove(l._id)}><Text style={S.delete}>Delete</Text></TouchableOpacity>}
        </View>
      ))}<ShowMoreButton hidden={logHist.hidden} open={logHist.open} onPress={logHist.toggle} noun="entries" /></> : <View style={S.card}><Text style={S.muted}>Nothing logged yet.</Text></View>}
    </Screen>
  );
}
