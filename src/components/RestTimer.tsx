import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, Vibration, View } from 'react-native';
import { useTheme } from '../utils/theme';
import { TimerRing } from '../motion/Press';

/** Rest timer for strength sets: pick a duration, it counts down and buzzes when done. */
export function RestTimer() {
  const { colors: c } = useTheme();
  const [left, setLeft] = useState(0);
  const [total, setTotal] = useState(0);
  const endsAt = useRef(0);

  useEffect(() => {
    if (!left) return;
    const t = setInterval(() => {
      const r = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setLeft(r);
      if (r === 0) Vibration.vibrate([0, 400, 150, 400]);
    }, 250);
    return () => clearInterval(t);
  }, [left > 0]);

  const start = (s: number) => { endsAt.current = Date.now() + s * 1000; setTotal(s); setLeft(s); };
  return (
    <View style={{ backgroundColor: c.chipBg, borderRadius: 16, padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '800', color: c.ink }}>⏱ Rest timer</Text>
        <TimerRing totalSec={total} remainingSec={left} running={left > 0} size={72} stroke={6} color={c.primary} track={c.border}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: left ? c.primary : c.muted }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text>
        </TimerRing>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {[30, 60, 90, 120].map((s) => (
          <TouchableOpacity key={s} onPress={() => start(s)} style={{ flex: 1, backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: c.ink, fontSize: 12 }}>{({ 30: '30s', 60: '1 min', 90: '1:30', 120: '2 min' } as Record<number, string>)[s]}</Text>
          </TouchableOpacity>
        ))}
        {left > 0 && <TouchableOpacity onPress={() => { setLeft(0); setTotal(0); }} style={{ paddingHorizontal: 10, justifyContent: 'center' }}><Text style={{ color: c.danger, fontWeight: '800', fontSize: 12 }}>Stop</Text></TouchableOpacity>}
      </View>
    </View>
  );
}
