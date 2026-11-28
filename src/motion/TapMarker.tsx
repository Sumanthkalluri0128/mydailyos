// Shows a dot + ring exactly where you touch the screen. Wrap the app once: <TapMarker>…</TapMarker>
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, GestureResponderEvent, StyleSheet, View } from 'react-native';
import { useTheme } from '../utils/theme';

function Ripple({ x, y, color }: { x: number; y: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [v]);
  const fade = v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.8, 0] });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y }}>
      <Animated.View style={{ position: 'absolute', left: -28, top: -28, width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: color, opacity: fade, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] }) }] }} />
      <Animated.View style={{ position: 'absolute', left: -7, top: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: color, opacity: fade, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.1] }) }] }} />
    </View>
  );
}

export function TapMarker({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const [taps, setTaps] = useState<{ id: number; x: number; y: number }[]>([]);
  const next = useRef(1);
  // onTouchStart bubbles up from every button, so one listener here sees all presses without stealing them.
  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    const id = next.current++;
    setTaps((t) => [...t.slice(-4), { id, x: pageX, y: pageY }]);
    setTimeout(() => setTaps((t) => t.filter((x) => x.id !== id)), 700);
  }, []);
  return (
    <View style={{ flex: 1 }} onTouchStart={onTouchStart}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {taps.map((t) => <Ripple key={t.id} x={t.x} y={t.y} color={colors.primary} />)}
      </View>
    </View>
  );
}
