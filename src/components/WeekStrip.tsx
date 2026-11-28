import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../utils/theme';

/** Seven small bars: calories logged each day this week (today highlighted). */
export function WeekStrip({ days, target }: { days: { date: string; calories: number }[]; target?: number }) {
  const { colors: c } = useTheme();
  if (!days?.length) return null;
  const max = Math.max(...days.map((d) => d.calories), target || 0, 1);
  return (
    <View accessible accessibilityLabel={`Calories each day this week: ${days.map((d) => `${d.date} ${d.calories}`).join(', ')}`} style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, marginVertical: 10 }}>
      {days.map((d) => {
        const h = d.calories ? Math.max(8, Math.round((d.calories / max) * 64)) : 4;
        const over = !!target && d.calories > target * 1.1;
        const day = new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });
        return (
          <View key={d.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View style={{ width: '70%', height: h, borderRadius: 6, backgroundColor: over ? '#E0A43A' : c.primary, opacity: d.calories ? 1 : 0.25 }} />
            <Text style={{ fontSize: 12, color: c.muted, marginTop: 4, fontWeight: '700' }}>{day}</Text>
          </View>
        );
      })}
    </View>
  );
}
