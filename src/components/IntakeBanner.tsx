// A short "go a little lighter" warning for the screens where you decide what to eat (Food, Meal planner).
// It reads the same advice the meal planner plans with, so the number you are warned about is the number you get planned.
import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { read } from '../utils/offline';
import { today } from '../config/api';
import { useThemedStyles } from './UI';

type Advice = { level: 'watch' | 'reduce' | 'high'; headline: string; detail: string; todayTarget: number; skipCut: boolean };

export function IntakeBanner({ showPlanLink = true }: { showPlanLink?: boolean }) {
  const { colors } = useThemedStyles();
  const [a, setA] = useState<Advice | null>(null);
  useEffect(() => { let on = true; read<any>(`/api/plan/over-days?today=${today()}&tz=${new Date().getTimezoneOffset()}`).then((d) => on && setA(d?.advice || null)).catch(() => {}); return () => { on = false; }; }, []);
  if (!a) return null;
  const hot = a.level !== 'watch';
  return (
    <View accessibilityRole="alert" style={{ marginBottom: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: hot ? '#e5484d88' : colors.border, backgroundColor: hot ? '#e5484d14' : colors.primarySoft, flexDirection: 'row', gap: 10 }}>
      <Text style={{ fontSize: 22 }}>{hot ? '⚠️' : '💡'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '800', color: colors.ink }}>{a.headline}</Text>
        <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>{a.skipCut ? a.detail : `Suggested today: about ${a.todayTarget.toLocaleString()} kcal. ${a.detail}`}</Text>
        {showPlanLink && <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/plan' as any)} style={{ marginTop: 6 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Plan lighter meals →</Text></TouchableOpacity>}
      </View>
    </View>
  );
}
