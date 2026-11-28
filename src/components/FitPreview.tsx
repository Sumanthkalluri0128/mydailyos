// "Will this fit?" for the food you are about to log: what it does to today and to the week. Nothing is saved.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from './UI';
import { post, today } from '../config/api';

type Fit = { status: 'fits' | 'tight' | 'over'; leftAfter: number; proteinAfter: number; proteinTarget: number | null; week: { weekLeft: number; perDayAfter: number | null; absorbed: boolean } | null; message: string; proteinLine?: string };

export function FitPreview({ foodId, quantity }: { foodId: string; quantity: number }) {
  const { S, colors } = useThemedStyles();
  const [fit, setFit] = useState<Fit | null>(null);
  useEffect(() => {
    if (!foodId || !(quantity > 0)) { setFit(null); return; }
    let alive = true;
    const t = setTimeout(() => { post<Fit>('/api/foods/fit', { foodId, quantity, date: today() }).then((r) => alive && setFit(r)).catch(() => alive && setFit(null)); }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [foodId, quantity]);
  if (!fit) return null;
  const color = fit.status === 'fits' ? colors.success : fit.status === 'tight' ? colors.primary : colors.muted;
  return (
    <View style={{ marginBottom: 10, padding: 12, borderRadius: 14, backgroundColor: colors.chipBg }} accessibilityRole="summary">
      <Text style={{ fontWeight: '800', color }}>{fit.status === 'fits' ? '✓ Fits today' : fit.status === 'tight' ? '◐ Fits, just' : '↗ A bit over today'}</Text>
      <Text style={[S.muted, { marginTop: 2, color: colors.ink }]}>{fit.message}</Text>
      {!!fit.proteinLine && <Text style={[S.muted, { marginTop: 2 }]}>{fit.proteinLine}</Text>}
      {fit.week && <Text style={[S.muted, { marginTop: 4 }]}>This week: {fit.week.weekLeft.toLocaleString()} kcal left{fit.week.perDayAfter !== null ? ` (about ${fit.week.perDayAfter.toLocaleString()} a day for the rest of the week)` : ''}.</Text>}
    </View>
  );
}
