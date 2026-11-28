import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../utils/theme';

type Props = {
  value: number; // current
  target: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
};

/** A single goal ring (e.g. "calories today: 1,340 / 1,800"). Caps the visual fill at 100%. */
export function ProgressRing({ value, target, size = 92, stroke = 10, color, label, sublabel }: Props) {
  const { colors: c } = useTheme();
  const ringColor = color || c.primary;
  const pct = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - pct);

  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.border} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={ringColor} strokeWidth={stroke} fill="none"
            strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={dashoffset}
            strokeLinecap="round" rotation={-90} originX={size / 2} originY={size / 2}
          />
        </Svg>
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: c.ink }}>{Math.round(pct * 100)}%</Text>
        </View>
      </View>
      {!!label && <Text style={{ fontSize: 12, fontWeight: '800', color: c.ink, marginTop: 8, textAlign: 'center' }}>{label}</Text>}
      {!!sublabel && <Text style={{ fontSize: 12, color: c.muted, marginTop: 2, textAlign: 'center' }}>{sublabel}</Text>}
    </View>
  );
}
