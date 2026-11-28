// Building blocks for the Home screen: full-body character "peeks", the calorie ring, macro arc gauges and the card shell.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Pressable, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { lift, useTheme } from '../../utils/theme';
import { useReduceMotion } from '../../motion/motion';
import { WHO_LIST, dayChar, sprite, type Who } from '../../motion/chars';
import { tapHaptic } from '../../utils/haptics';

/** A different full-body character in every slot; the line-up rotates with the weekday. */
export function useCast() {
  return useMemo(() => {
    const day = new Date().getDay();
    const lead = dayChar();
    const rest = WHO_LIST.filter((w) => w !== lead);
    const k = (day * 3) % rest.length;
    const order: Who[] = [lead, ...rest.slice(k), ...rest.slice(0, k)];
    return (slot: number, scene: string, seed = 0) => sprite(order[slot % order.length], scene, seed);
  }, []);
}

/** A character that bobs in the corner of a card (decorative; the card itself is the button). */
export function Peek({ src, size = 78, style }: { src: number; size?: number; style?: ViewStyle }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce, v]);
  return (
    <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={[{ position: 'absolute', width: size, height: size, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }, style]}>
      <Image source={src} style={{ width: size, height: size }} resizeMode="contain" />
    </Animated.View>
  );
}

export function Card({ children, onPress, label, tint, style }: { children: React.ReactNode; onPress?: () => void; label?: string; tint?: string; style?: ViewStyle }) {
  const { colors: c } = useTheme();
  const base: ViewStyle = { backgroundColor: tint ? `${tint}22` : c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 24, padding: 16, overflow: 'hidden', ...lift(c, 1) };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tapHaptic(); onPress(); }} style={({ pressed }) => [base, style, pressed && { transform: [{ scale: 0.98 }] }]}>{children}</Pressable>;
}

export function IconBadge({ emoji, tint, size = 40 }: { emoji: string; tint: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size * 0.34, backgroundColor: `${tint}30`, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: size * 0.5 }}>{emoji}</Text></View>;
}

export function Bar({ pct, color, h = 8 }: { pct: number; color: string; h?: number }) {
  const { colors: c } = useTheme();
  const a = useRef(new Animated.Value(0)).current;
  const p = Math.max(0, Math.min(1, pct));
  useEffect(() => { Animated.timing(a, { toValue: p, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [p, a]);
  return <View style={{ height: h, borderRadius: 99, backgroundColor: c.chipBg, overflow: 'hidden' }}><Animated.View style={{ height: h, borderRadius: 99, backgroundColor: color, minWidth: p > 0 ? h : 0, width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /></View>;
}

const AC: any = Animated.createAnimatedComponent(Circle);

/** Calorie ring with a purple→orange sweep. */
export function CalorieRing({ size, pct, over, children }: { size: number; pct: number; over: boolean; children?: React.ReactNode }) {
  const { colors: c } = useTheme();
  const stroke = 11, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const a = useRef(new Animated.Value(0)).current;
  const p = Math.max(0, Math.min(1, pct));
  useEffect(() => { Animated.timing(a, { toValue: p, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [p, a]);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs><LinearGradient id="calGrad" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#ff7a45" /><Stop offset="0.55" stopColor="#c04bd8" /><Stop offset="1" stopColor="#6847e8" /></LinearGradient></Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.chipBg} strokeWidth={stroke} fill="none" />
        <AC cx={size / 2} cy={size / 2} r={r} stroke={over ? c.danger : 'url(#calGrad)'} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${C} ${C}`} strokeDashoffset={a.interpolate({ inputRange: [0, 1], outputRange: [C, 0] }) as any} rotation={-90} originX={size / 2} originY={size / 2} />
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}

/** 270° open arc, like the macro gauges in the design. */
export function ArcGauge({ size, pct, color }: { size: number; pct: number; color: string }) {
  const { colors: c } = useTheme();
  const stroke = 9, r = (size - stroke) / 2, C = 2 * Math.PI * r, arc = C * 0.75;
  const a = useRef(new Animated.Value(0)).current;
  const p = Math.max(0, Math.min(1, pct));
  useEffect(() => { Animated.timing(a, { toValue: p, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [p, a]);
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={`${color}33`} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${arc} ${C}`} rotation={135} originX={size / 2} originY={size / 2} />
      <AC cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={a.interpolate({ inputRange: [0, 1], outputRange: [`0 ${C}`, `${arc} ${C}`] }) as any} rotation={135} originX={size / 2} originY={size / 2} />
    </Svg>
  );
}

/** Tiny weight trend line. */
export function Spark({ points, width, color }: { points: number[]; width: number; color: string }) {
  const h = 34;
  if (points.length < 2) return <View style={{ height: h }} />;
  const lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1;
  const xy = points.map((v, i) => [2 + (i / (points.length - 1)) * (width - 4), h - 4 - ((v - lo) / span) * (h - 10)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={h}>
      <Path d={d} stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={3.2} fill={color} />
    </Svg>
  );
}
