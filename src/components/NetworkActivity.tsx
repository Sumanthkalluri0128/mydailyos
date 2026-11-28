import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { ActivityIndicator, Animated, Easing, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActivity, subscribe } from '../utils/netActivity';
import { useTheme } from '../utils/theme';

/**
 * Always answers "is something running?". Nothing for fast requests; after 0.7 s a thin moving bar and a small pill ("Saving..."),
 * after 5 s it says the server is slow but the entry is safe, and while the free server is waking up it says so.
 * It never blocks a tap (pointerEvents none): the screen stays usable underneath.
 */
export function NetworkActivity() {
  const a = useSyncExternalStore(subscribe, getActivity, getActivity);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const active = a.phase !== 'idle';

  useEffect(() => {
    if (!active) return undefined;
    slide.setValue(0);
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, slide]);

  if (!active) return null;
  const warn = a.phase === 'slow' || a.phase === 'waking';
  const tint = warn ? c.warnInk : c.primary;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 9000 }} accessibilityLiveRegion="polite">
      <View style={{ height: 3, overflow: 'hidden', backgroundColor: warn ? c.warnSoft : c.primarySoft }}>
        <Animated.View style={{ width: '35%', height: 3, borderRadius: 3, backgroundColor: tint,
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-150, 420] }) }] }} />
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 84, alignItems: 'center' }}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={a.message}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, maxWidth: 420, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
          <ActivityIndicator size="small" color={tint} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: warn ? c.warnInk : c.ink, flexShrink: 1 }}>{a.message}</Text>
        </View>
      </View>
    </View>
  );
}
