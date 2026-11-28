// Drop-in upgrade for components/ProgressRing.tsx: sweeps in, then pops + confetti + haptic + check when the goal closes.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { successHaptic } from '../utils/haptics';
import { useTheme } from '../utils/theme';
import { Confetti } from './Confetti';
import { DUR, EASE, SPRING, useCelebrateOnce, useReduceMotion } from './motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle); // module scope: never recreate per render

type Props = { value: number; target: number; size?: number; stroke?: number; color?: string; label?: string; sublabel?: string; id?: string; onComplete?: () => void };

export function AnimatedRing({ value, target, size = 92, stroke = 10, color, label, sublabel, id, onComplete }: Props) {
  const { colors: c } = useTheme();
  const reduce = useReduceMotion();
  const ringColor = color || c.primary;
  const pct = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  const done = target > 0 && value >= target;
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const sweep = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const check = useRef(new Animated.Value(done ? 1 : 0)).current;
  const [fire, setFire] = useState(0);

  useEffect(() => {
    Animated.timing(sweep, { toValue: pct, duration: reduce ? 0 : DUR.hero, easing: EASE.out, useNativeDriver: false }).start(); // strokeDashoffset can't use the native driver
  }, [pct, reduce, sweep]);
  useEffect(() => { if (!done) check.setValue(0); }, [done, check]);

  useCelebrateOnce(id || label || 'ring', done, () => {
    successHaptic(); onComplete?.();
    if (reduce) { check.setValue(1); return; }
    setFire((n) => n + 1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.14, duration: 160, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, ...SPRING.bouncy, useNativeDriver: true }),
    ]).start();
    Animated.timing(check, { toValue: 1, duration: 380, delay: 350, easing: EASE.out, useNativeDriver: false }).start();
  });

  return (
    <View style={{ width: size, alignItems: 'center' }} accessible accessibilityLabel={`${label ?? 'Goal'}: ${Math.round(pct * 100)} percent${done ? ', complete' : ''}`}>
      <Animated.View style={{ width: size, height: size, transform: [{ scale: pop }] }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.border} strokeWidth={stroke} fill="none" />
          <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={ringColor} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${C} ${C}`} strokeDashoffset={sweep.interpolate({ inputRange: [0, 1], outputRange: [C, 0] }) as any}
            rotation={-90} originX={size / 2} originY={size / 2} />
        </Svg>
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          {done
            ? <Svg width={size * 0.34} height={size * 0.34} viewBox="0 0 24 24"><AnimatedPath check={check} color={ringColor} /></Svg>
            : <Text style={{ fontSize: 15, fontWeight: '800', color: c.ink }}>{Math.round(pct * 100)}%</Text>}
        </View>
        <Confetti fire={fire} />
      </Animated.View>
      {!!label && <Text style={{ fontSize: 12, fontWeight: '800', color: c.ink, marginTop: 8, textAlign: 'center' }}>{label}</Text>}
      {!!sublabel && <Text style={{ fontSize: 12, color: c.muted, marginTop: 2, textAlign: 'center' }}>{sublabel}</Text>}
    </View>
  );
}

const AP = Animated.createAnimatedComponent(Path);
function AnimatedPath({ check, color }: { check: Animated.Value; color: string }) {
  return <AP d="M4 12.5 L9.5 18 L20 6" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"
    strokeDasharray="24 24" strokeDashoffset={check.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) as any} />;
}
