// Skeletons + tab transitions. Replaces components/Skeleton.tsx (same Skeleton/HomeSkeleton API).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../utils/theme';
import { DUR, EASE, useReduceMotion } from './motion';

// ONE shared pulse for every skeleton on screen (ref-counted) instead of a loop per block: cheaper and perfectly in sync.
const pulse = new Animated.Value(0);
let users = 0, loop: Animated.CompositeAnimation | null = null;
function usePulse() {
  useEffect(() => {
    if (users++ === 0) {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])); loop.start();
    }
    return () => { if (--users === 0) { loop?.stop(); pulse.setValue(0); } };
  }, []);
  return pulse;
}

export function Skeleton({ height = 16, width = '100%', radius = 12, style }: { height?: number; width?: number | string; radius?: number; style?: ViewStyle }) {
  const { colors: c } = useTheme();
  const reduce = useReduceMotion();
  const p = usePulse();
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{ height, width: width as any, borderRadius: radius, backgroundColor: c.chipBg, opacity: reduce ? 0.7 : p.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }) }, style]} />;
}

export function HomeSkeleton() {
  return (
    <View style={{ padding: 20, gap: 14 }} accessibilityLabel="Loading your day" accessibilityRole="progressbar">
      <Skeleton height={14} width={90} /><Skeleton height={32} width={220} />
      <Skeleton height={250} radius={28} />
      <View style={{ flexDirection: 'row', gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={74} width={'23%'} radius={18} />)}</View>
      <Skeleton height={190} radius={22} />
    </View>
  );
}

/** Wrap a tab screen's root: replays a fade + rise every time the tab gains focus (tabs use animation:'none', so this adds the life). */
export function TabFade({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(1)).current;
  useFocusEffect(useCallback(() => {
    if (reduce) return;
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: DUR.reveal * 0.6, easing: EASE.out, useNativeDriver: true });
    a.start(); return () => a.stop();
  }, [reduce, v]));
  return <Animated.View style={[{ flex: 1, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }, style]}>{children}</Animated.View>;
}

/** Fade + rise a block in, staggered by index (45ms apart): <Stagger i={2}><Card/></Stagger> */
export function Stagger({ i = 0, children }: { i?: number; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => { if (!reduce) Animated.timing(v, { toValue: 1, duration: 420, delay: Math.min(i, 8) * 45, easing: EASE.out, useNativeDriver: true }).start(); }, [i, reduce, v]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>{children}</Animated.View>;
}

/** Skeleton -> content swap that never flashes: skeleton only after `delay` ms, kept >= `min` ms, then content cross-fades in. */
export function Reveal({ loading, skeleton, children, delay = 120, min = 350 }: { loading: boolean; skeleton: React.ReactNode; children: React.ReactNode; delay?: number; min?: number }) {
  const [showSkel, setShowSkel] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (loading) t = setTimeout(() => { since.current = Date.now(); setShowSkel(true); }, delay);
    else if (showSkel) t = setTimeout(() => setShowSkel(false), Math.max(0, min - (Date.now() - since.current)));
    return () => clearTimeout(t);
  }, [loading, showSkel, delay, min]);
  if (loading && !showSkel) return null;
  if (showSkel) return <>{skeleton}</>;
  return <Stagger>{children}</Stagger>;
}
