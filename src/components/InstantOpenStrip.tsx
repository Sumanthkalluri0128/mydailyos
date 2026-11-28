// Shown while Home is painted from the last saved copy: the day's character and "updated X min ago".
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Buddy from '../motion/Buddy';
import { useTheme } from '../utils/theme';
import { ageLabel, freshness } from '../utils/freshness';

export function InstantOpenStrip({ at, refreshing }: { at: number | null; refreshing?: boolean }) {
  const { colors: c } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const label = at ? ageLabel(at, now) : '';
  if (!label) return null;
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`Your last saved day, updated ${label}${refreshing ? ', refreshing' : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.primarySoft, borderLeftWidth: freshness(at, now) === 'old' ? 4 : 0, borderLeftColor: c.primary }}>
      <Buddy scene="wave" size={40} talk={false} />
      <Text style={{ flex: 1, color: c.ink, fontSize: 13 }}><Text style={{ fontWeight: '800' }}>Your last saved day</Text> · updated {label}{refreshing ? ' · refreshing…' : ''}</Text>
    </View>
  );
}
