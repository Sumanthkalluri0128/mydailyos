// ONE component for every body-weight value in the app. Hidden (blurred) by default on every load; tap to reveal with a
// dissolve + number roll-up + accent glow + light haptic + a tiny character reaction; blurs again after ~8 s or when you leave.
// Masked-text approach (no native module, so an OTA update is enough): while hidden only decoy digits are drawn, with a text-shadow blur.
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, AppState, Easing, Image, Pressable, StyleSheet, Text, View, type TextStyle, type StyleProp } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../utils/theme';
import { ACCENT, dayChar, stickerFor } from '../motion/chars';
import { tapHaptic } from '../utils/haptics';
import { a11yText, decoy, hasNumber, hideWeight, isWeightRevealed, revealWeight, rollText, runs, subscribeWeight, toggleWeight } from '../utils/weightReveal';

export const useWeightRevealed = (): boolean => useSyncExternalStore(subscribeWeight, isWeightRevealed, () => false);

function withAlpha(color: string, a: number): string {
  const al = Math.max(0, Math.min(1, a));
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (h) { const x = h[1].length === 3 ? h[1].split('').map((ch) => ch + ch).join('') : h[1]; return `rgba(${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)},${al})`; }
  const r = /^rgba?\(([^)]+)\)/i.exec(color);
  if (r) { const [R, G, B] = r[1].split(',').map((s) => s.trim()); return `rgba(${R},${G},${B},${al})`; }
  return color;
}

type Props = { text: string; style?: StyleProp<TextStyle>; from?: number; numberOfLines?: number; accent?: string; reaction?: boolean; compact?: boolean; prefix?: string };

export function WeightReveal({ text, style, from, numberOfLines, accent, reaction = true, compact = false, prefix }: Props) {
  const { colors: c } = useTheme();
  const revealed = useWeightRevealed();
  const who = useMemo(() => dayChar(), []);
  const glowColor = accent || ACCENT[who];
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  const base = typeof flat.color === 'string' ? flat.color : c.ink;

  const tv = useRef(new Animated.Value(revealed ? 1 : 0)).current;      // 0 hidden .. 1 shown (drives blur, fade and number roll)
  const [t, setT] = useState(revealed ? 1 : 0);
  const glow = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [face, setFace] = useState(false);
  const faceT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = tv.addListener(({ value }) => setT(Math.round(value * 50) / 50));
    return () => tv.removeListener(id);
  }, [tv]);
  useEffect(() => {
    Animated.timing(tv, { toValue: revealed ? 1 : 0, duration: revealed ? 750 : 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    if (revealed) {
      glow.setValue(0);
      Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: true }), Animated.timing(glow, { toValue: 0, duration: 700, useNativeDriver: true })]).start();
    }
  }, [revealed, tv, glow]);
  useEffect(() => () => { if (faceT.current) clearTimeout(faceT.current); }, []);
  // leaving the screen or the app puts the blur back
  useFocusEffect(useCallback(() => () => hideWeight(), []));
  useEffect(() => { const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') hideWeight(); }); return () => sub.remove(); }, []);

  const onPress = () => {
    tapHaptic();
    const nowShown = toggleWeight();
    if (nowShown && reaction) {
      setFace(true); pop.setValue(0);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, stiffness: 240, damping: 9 }).start();
      if (faceT.current) clearTimeout(faceT.current);
      faceT.current = setTimeout(() => setFace(false), 1700);
    } else setFace(false);
  };

  if (!hasNumber(text)) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;

  const radius = Math.round(10 * (1 - t));
  const numColor = withAlpha(base, Math.max(0, Math.min(1, (t - 0.2) / 0.5)));
  const numStyle: TextStyle = t >= 1 ? {} : { color: t <= 0.2 ? 'rgba(0,0,0,0)' : numColor, textShadowColor: withAlpha(base, 0.85), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: radius };
  const shown = t > 0 ? rollText(text, t, from) : decoy(text);
  const parts = runs(shown);
  const hiddenNow = !revealed && t <= 0;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: revealed }} hitSlop={compact ? { top: 10, bottom: 10, left: 6, right: 6 } : 6}
      accessibilityLabel={revealed ? `${prefix || ''}${a11yText(text, true)}. Hide weight` : 'Show weight'}
      accessibilityHint={revealed ? undefined : 'Reveals your weight for a few seconds'}
      style={{ minHeight: compact ? 24 : 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -6, right: -6, top: 6, bottom: 6, borderRadius: 12, backgroundColor: glowColor, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.05] }) }] }} />
      <Text accessible={false} importantForAccessibility="no" numberOfLines={numberOfLines} style={[style, { flexShrink: 1 }]}>
        {prefix}
        {parts.map((r, i) => (r.num ? <Text key={i} style={hiddenNow ? { color: 'rgba(0,0,0,0)', textShadowColor: withAlpha(base, 0.85), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 } : numStyle}>{r.t}</Text> : r.t))}
      </Text>
      {face && (
        <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ marginLeft: 6, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
          <Image source={stickerFor(who, 'wave', 1).src} style={{ width: 30, height: 30 }} resizeMode="contain" />
        </Animated.View>
      )}
    </Pressable>
  );
}
