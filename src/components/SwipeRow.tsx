import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, Text, View } from 'react-native';
import { useTheme } from '../utils/theme';

/**
 * Swipe a row: right → "Move", left → "Delete". The visible buttons stay on the row, so this is a shortcut, never the only way.
 * Only claims the gesture when the finger moves mostly sideways, so vertical scrolling is unaffected.
 */
export function SwipeRow({ children, onSwipeRight, onSwipeLeft, rightLabel = 'Move', leftLabel = 'Delete' }: {
  children: React.ReactNode; onSwipeRight?: () => void; onSwipeLeft?: () => void; rightLabel?: string; leftLabel?: string;
}) {
  const { colors: c } = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const cb = useRef({ onSwipeRight, onSwipeLeft });
  cb.current = { onSwipeRight, onSwipeLeft };
  const THRESHOLD = 90;

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (_, g) => {
      const allowed = (g.dx > 0 && cb.current.onSwipeRight) || (g.dx < 0 && cb.current.onSwipeLeft);
      x.setValue(allowed ? Math.max(-140, Math.min(140, g.dx)) : 0);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx > THRESHOLD) cb.current.onSwipeRight?.();
      else if (g.dx < -THRESHOLD) cb.current.onSwipeLeft?.();
      Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  }), [x]);

  return (
    <View style={{ position: 'relative' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, paddingHorizontal: 16 }}>
        <Text style={{ color: c.primary, fontWeight: '800' }}>{onSwipeRight ? `⇄ ${rightLabel}` : ''}</Text>
        <Text style={{ color: c.danger, fontWeight: '800' }}>{onSwipeLeft ? `${leftLabel} 🗑` : ''}</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>{children}</Animated.View>
    </View>
  );
}
