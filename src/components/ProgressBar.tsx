import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../utils/theme';

type Props = {
  label: string;
  value: number;
  target: number;
  valueText: string;      // e.g. "1,240 kcal"
  targetText: string;     // e.g. "1,800 kcal"
  color: string;
  overIsBad?: boolean;    // calories: going past the target turns the bar red
  hint?: string;          // small line under the bar
  height?: number;
};

/** Labelled horizontal bar: "Calories  1,240 / 1,800 kcal  [=====-----]  69%  ·  560 left". */
export function ProgressBar({ label, value, target, valueText, targetText, color, overIsBad, hint, height = 12 }: Props) {
  const { colors: c } = useTheme();
  const ratio = target > 0 ? value / target : 0;
  const pct = Math.round(ratio * 100);
  const fill = Math.max(0, Math.min(1, ratio));
  const over = ratio > 1;
  const barColor = over && overIsBad ? c.danger : color;
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink }}>{label}</Text>
        <Text style={{ fontSize: 12, color: c.muted }}>
          <Text style={{ fontWeight: '800', color: c.ink }}>{valueText}</Text> / {targetText}
        </Text>
      </View>
      <View
        accessible accessibilityRole="progressbar" accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.min(100, pct) }}
        style={{ height, borderRadius: height / 2, backgroundColor: c.border, overflow: 'hidden' }}
      >
        <View style={{ width: `${fill * 100}%`, height: '100%', borderRadius: height / 2, backgroundColor: barColor, minWidth: fill > 0 ? height : 0 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: over && overIsBad ? c.danger : c.muted }}>{pct}%</Text>
        {!!hint && <Text style={{ fontSize: 12, color: c.muted }}>{hint}</Text>}
      </View>
    </View>
  );
}
