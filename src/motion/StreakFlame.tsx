// Evolving streak flame. Usage: <StreakFlame streak={currentStreak} />
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { impactHaptic, successHaptic } from '../utils/haptics';
import { useTheme } from '../utils/theme';
import { Confetti } from './Confetti';
import { SPRING, useReduceMotion } from './motion';

export const FLAME_TIERS = [
  { min: 0,   scale: 0.8,  speed: 0,   outer: '#8B8B99', inner: '#B8B8C4', glow: '#000000', glowo: 0 },
  { min: 1,   scale: 0.8,  speed: 0.7, outer: '#FF8A1F', inner: '#FFD36B', glow: '#FF8C28', glowo: 0.4 },
  { min: 3,   scale: 0.95, speed: 0.9, outer: '#FF6A1A', inner: '#FFC247', glow: '#FF781E', glowo: 0.5 },
  { min: 7,   scale: 1.1,  speed: 1.1, outer: '#FF4D1A', inner: '#FFB02E', glow: '#FF5A1E', glowo: 0.65 },
  { min: 14,  scale: 1.25, speed: 1.3, outer: '#FF3B3B', inner: '#FF9D2E', glow: '#FF3C3C', glowo: 0.75 },
  { min: 30,  scale: 1.4,  speed: 1.5, outer: '#D63AFF', inner: '#FF8AD8', glow: '#BE46FF', glowo: 0.85 },
  { min: 100, scale: 1.55, speed: 1.8, outer: '#2D8CFF', inner: '#D6F0FF', glow: '#50AAFF', glowo: 1 },
];
export const tierOf = (n: number) => FLAME_TIERS.reduce((t, x, i) => (n >= x.min ? i : t), 0);

export function StreakFlame({ streak, label = 'day streak', compact = false, bare = false }: { streak: number; label?: string; compact?: boolean; bare?: boolean }) {
  const k = compact ? 0.4 : 1;
  const { colors: c } = useTheme();
  const reduce = useReduceMotion();
  const T = FLAME_TIERS[tierOf(streak)];
  const flicker = useRef(new Animated.Value(0)).current;
  const bump = useRef(new Animated.Value(1)).current;
  const roll = useRef(new Animated.Value(1)).current;
  const prev = useRef(streak);
  const [fire, setFire] = useState(0);

  useEffect(() => { // idle flicker: faster + more intense with each tier
    if (reduce || !T.speed) { flicker.setValue(0); return; }
    const half = 700 / T.speed;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(flicker, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [T.speed, reduce, flicker]);

  useEffect(() => {
    if (streak > prev.current) {
      const tierUp = tierOf(streak) > tierOf(prev.current);
      tierUp ? successHaptic() : impactHaptic();
      if (!reduce) {
        setFire((n) => n + 1);
        bump.setValue(1);
        Animated.sequence([
          Animated.timing(bump, { toValue: 1.4, duration: 150, useNativeDriver: true }),
          Animated.spring(bump, { toValue: 1, ...SPRING.bouncy, useNativeDriver: true }),
        ]).start();
        roll.setValue(0);
        Animated.spring(roll, { toValue: 1, ...SPRING.snappy, useNativeDriver: true }).start();
      }
    }
    prev.current = streak;
  }, [streak]); // eslint-disable-line react-hooks/exhaustive-deps

  const W = 64 * T.scale * k, H = 80 * T.scale * k;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 6 : 12 }} accessible accessibilityLabel={`${streak} ${label}`}>
      <Animated.View style={{ width: W, height: H, transform: [{ scale: bump }] }}>
        <Animated.View style={{ flex: 1, transform: [
          { translateY: H / 2 },
          { scaleY: flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) },
          { scaleX: flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) },
          { rotate: flicker.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '1.5deg'] }) },
          { translateY: -H / 2 }, // pivots the flicker around the base of the flame
        ] }}>
          <Svg width={W} height={H} viewBox="-16 -10 96 100" style={{ overflow: 'visible' }}>
            <Defs><RadialGradient id="g" cx="50%" cy="55%" r="50%"><Stop offset="0" stopColor={T.glow} stopOpacity={T.glowo} /><Stop offset="1" stopColor={T.glow} stopOpacity={0} /></RadialGradient></Defs>
            <Circle cx="32" cy="48" r="46" fill="url(#g)" />
            <Path fill={T.outer} d="M32 2C34 18 52 28 52 50C52 66 43 78 32 78C21 78 12 66 12 50C12 40 18 34 22 28C24 36 28 38 30 36C28 24 28 12 32 2Z" />
            <Path fill={T.inner} d="M32 36C34 46 42 50 42 60C42 69 37 75 32 75C27 75 22 69 22 60C22 52 28 48 32 36Z" />
          </Svg>
        </Animated.View>
        <Confetti fire={fire} count={compact ? 8 : 14} power={70 * k} colors={[T.inner, T.outer, '#FFD36B']} />
      </Animated.View>
      {!bare && <View>
        <Animated.Text style={{ fontSize: compact ? 15 : 30, fontWeight: '900', color: c.ink, opacity: roll,
          transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>{streak}</Animated.Text>
        <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      </View>}
    </View>
  );
}
