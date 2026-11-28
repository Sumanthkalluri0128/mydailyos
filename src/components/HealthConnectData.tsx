// Profile / steps area: choose which extra Health Connect data FlexFit may read. Each switch is separate; the Android permission is
// only asked for when you turn that one on, and each one is explained in plain words first.
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import Buddy from '../motion/Buddy';
import { useNotifications } from './Notifications';
import { HC_DATA, HC_TYPES, HcDataType, hcGrantedTypes, hcLoadPrefs, hcOpenSettings, hcRequestTypes, hcSavePrefs, hcSupport } from '../utils/healthConnect';
import { syncHealthConnect } from '../utils/hcSync';

export function HealthConnectData() {
  const { S, colors: c } = useThemedStyles();
  const { success, info, warning } = useNotifications();
  const [prefs, setPrefs] = useState({ sleep: false, heartRate: false, exercise: false });
  const [granted, setGranted] = useState({ sleep: false, heartRate: false, exercise: false });
  const [ready, setReady] = useState<boolean | null>(null);
  const [open, setOpen] = useState<HcDataType | null>(null);

  const load = useCallback(async () => {
    setReady((await hcSupport()) === 'ready');
    setPrefs(await hcLoadPrefs()); setGranted(await hcGrantedTypes());
  }, []);
  useEffect(() => { if (Platform.OS === 'android') load(); }, [load]);
  if (Platform.OS !== 'android' || ready === false) return null;

  const toggle = async (t: HcDataType) => {
    if (prefs[t]) { const next = { ...prefs, [t]: false }; setPrefs(next); await hcSavePrefs(next); return; }
    const g = await hcRequestTypes([t]);
    setGranted(g);
    if (!g[t]) { warning('Not allowed yet', `Android did not allow FlexFit to read ${HC_DATA[t].title.toLowerCase()}. You can change this in Health Connect.`); return; }
    const next = { ...prefs, [t]: true }; setPrefs(next); await hcSavePrefs(next);
    const r = await syncHealthConnect(true);
    success(`${HC_DATA[t].title} switched on`, t === 'exercise' ? `${r.workouts} workout${r.workouts === 1 ? '' : 's'} added.` : 'Synced from Health Connect.');
  };

  return (
    <View style={S.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Buddy scene="health" size={48} who="kakashi" talk={false} label="" />
        <Text style={{ fontWeight: '800', color: c.ink, fontSize: 16, flex: 1, marginLeft: 8 }}>More from Health Connect</Text>
      </View>
      <Text style={S.muted}>All off until you choose. FlexFit only reads, and you can switch each one off at any time.</Text>
      {HC_TYPES.map((t) => (
        <View key={t} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 10, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontWeight: '800', color: c.ink }}>{HC_DATA[t].title}</Text>
            <Chip small label={prefs[t] && granted[t] ? 'On' : 'Off'} active={prefs[t] && granted[t]} a11y={`${HC_DATA[t].title} is ${prefs[t] && granted[t] ? 'on' : 'off'}. Tap to change.`} onPress={() => toggle(t)} />
          </View>
          <TouchableOpacity onPress={() => setOpen(open === t ? null : t)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary, fontWeight: '700' }}>{open === t ? 'Hide what this lets FlexFit do' : 'What does this allow?'}</Text></TouchableOpacity>
          {open === t && <Text style={S.muted}>{HC_DATA[t].why}</Text>}
          {prefs[t] && !granted[t] && <Text style={[S.muted, { marginTop: 4 }]}>Android has not allowed this (any more). Turn it on again, or check Health Connect settings.</Text>}
        </View>
      ))}
      <TouchableOpacity onPress={() => { hcOpenSettings(); info('Health Connect', 'You can remove any permission there.'); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.muted, fontWeight: '700' }}>Open Health Connect settings</Text></TouchableOpacity>
    </View>
  );
}
