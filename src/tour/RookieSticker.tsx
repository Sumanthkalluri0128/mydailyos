// The "Rookie" sticker: an original badge (a fresh sprout on a headband), unlocked when the tour / first-week checklist is finished.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export function RookieSticker({ size = 84, label = true, ink = '#1c1f33' }: { size?: number; label?: boolean; ink?: string }) {
  return (
    <View accessible accessibilityLabel="Rookie sticker" style={{ alignItems: 'center', width: size }}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs><LinearGradient id="rkbg" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#8be28b" /><Stop offset="1" stopColor="#2fb7a0" /></LinearGradient></Defs>
        <Circle cx="60" cy="60" r="54" fill="url(#rkbg)" stroke="#fff" strokeWidth="6" />
        <Rect x="26" y="66" width="68" height="14" rx="7" fill="#1c4d7a" />
        <Path d="M34 73h52" stroke="#fff" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round" />
        <Path d="M60 66V44" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <Path d="M60 50c-14 0-22-8-22-20 14 0 22 8 22 20z" fill="#fff" /><Path d="M60 46c12 0 20-6 20-17-12 0-20 6-20 17z" fill="#e9ffe9" />
        <Path d="M92 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" />
      </Svg>
      {label && <Text style={{ fontWeight: '800', fontSize: 12, color: ink, marginTop: 2 }}>Rookie</Text>}
    </View>
  );
}
