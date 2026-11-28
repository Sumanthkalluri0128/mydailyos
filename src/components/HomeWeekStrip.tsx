import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useThemedStyles } from './UI';
import { WeekStrip } from './WeekStrip';
import { read, useRefreshOnSync } from '../utils/offline';

/** "This week" calories at a glance on Home. Shows the last saved copy instantly, then refreshes. Tap for the full weekly summary. */
export function HomeWeekStrip() {
  const { S, colors } = useThemedStyles();
  const [days, setDays] = useState<any[] | null>(null);
  const [target, setTarget] = useState<number | undefined>();
  const load = () => read<any>('/api/progress/weekly').then((w) => { setDays(w.days || []); setTarget(undefined); }).catch(() => {});
  useEffect(() => { load(); }, []);
  useRefreshOnSync(load);
  if (!days || !days.some((d) => d.calories > 0)) return null;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="This week's calories. Open weekly summary" activeOpacity={0.85} onPress={() => router.push('/weekly' as any)} style={S.card}>
      <Text style={{ fontWeight: '800', color: colors.ink }}>This week</Text>
      <WeekStrip days={days} target={target} />
      <Text style={S.muted}>Calories logged each day · tap for your weekly summary ›</Text>
    </TouchableOpacity>
  );
}
