// "− 1 serving +": the quick way to say how many servings. Half-serving steps, never below half a serving.
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';

export const SERVING_STEP = 0.5, SERVING_MIN = 0.5, SERVING_MAX = 20;
export const clampServings = (n: number) => Math.min(SERVING_MAX, Math.max(SERVING_MIN, Math.round(n * 2) / 2));
export const servingsLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} serving${n === 1 ? '' : 's'}`;

export function ServingsStepper({ value, onChange, label = 'Servings', compact = false }: { value: number; onChange: (n: number) => void; label?: string; compact?: boolean }) {
  const { colors } = useThemedStyles();
  const size = compact ? 34 : 44;
  const btn = (txt: string, a11y: string, next: number, off: boolean) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y} disabled={off} onPress={() => onChange(clampServings(next))}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border, opacity: off ? 0.4 : 1 }}>
      <Text style={{ color: colors.primary, fontSize: compact ? 18 : 22, fontWeight: '800', marginTop: -1 }}>{txt}</Text>
    </TouchableOpacity>
  );
  return (
    <View accessible accessibilityLabel={`${label}: ${servingsLabel(value)}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
      {btn('−', `Fewer ${label.toLowerCase()}`, value - SERVING_STEP, value <= SERVING_MIN)}
      <Text accessibilityLiveRegion="polite" style={{ minWidth: compact ? 74 : 92, textAlign: 'center', color: colors.ink, fontWeight: '800', fontSize: compact ? 12.5 : 15 }}>{servingsLabel(value)}</Text>
      {btn('+', `More ${label.toLowerCase()}`, value + SERVING_STEP, value >= SERVING_MAX)}
    </View>
  );
}
