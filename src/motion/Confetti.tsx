import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useReduceMotion } from './motion';

const COLORS = ['#6847E8', '#E8476F', '#2587D9', '#20A46B', '#FFB020', '#FFFFFF'];

/** Native-driver confetti burst. Place inside a positioned parent; bump `fire` (e.g. a counter) to play it. */
export function Confetti({ fire, count = 28, power = 150, colors = COLORS }: { fire: number; count?: number; power?: number; colors?: string[] }) {
  const reduce = useReduceMotion();
  const ps = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, d = power * (0.5 + Math.random() * 0.7);
    return { v: new Animated.Value(0), dx: Math.cos(a) * d, up: Math.sin(a) * d, fall: 90 + Math.random() * 80,
      rot: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360), w: 6 + Math.random() * 5, h: 4 + Math.random() * 4,
      c: colors[i % colors.length], ms: 1000 + Math.random() * 500 };
  }), [count, power, colors]);
  useEffect(() => {
    if (!fire || reduce) return;
    ps.forEach((p) => p.v.setValue(0));
    Animated.parallel(ps.map((p) => Animated.timing(p.v, { toValue: 1, duration: p.ms, easing: Easing.out(Easing.quad), useNativeDriver: true }))).start();
  }, [fire]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fire) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, overflow: 'visible' }}>
      {ps.map((p, i) => (
        <Animated.View key={i} style={{ position: 'absolute', width: p.w, height: p.h, backgroundColor: p.c, borderRadius: 1.5,
          opacity: p.v.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
            { translateY: p.v.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, p.up, p.up + p.fall] }) },
            { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot}deg`] }) },
          ] }} />
      ))}
    </View>
  );
}
