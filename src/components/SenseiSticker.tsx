// The "Meal Sensei" sticker: an original badge (a chef's hat over a ladle and a sparkle), unlocked when the Planning sensei setup is finished.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useThemedStyles } from './UI';

export function SenseiSticker({ size = 84, label = true }: { size?: number; label?: boolean }) {
  const { colors } = useThemedStyles();
  return (
    <View accessible accessibilityLabel="Meal Sensei sticker" style={{ alignItems: 'center', width: size }}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs><LinearGradient id="snbg" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#ffd37a" /><Stop offset="1" stopColor="#ff8f5a" /></LinearGradient></Defs>
        <Circle cx="60" cy="60" r="54" fill="url(#snbg)" stroke="#fff" strokeWidth="6" />
        <Circle cx="60" cy="60" r="54" fill="none" stroke="#e8743b" strokeWidth="2" strokeDasharray="4 5" />
        <Path d="M36 62c-9-3-12-16-3-21 2-9 14-12 21-5 5-7 17-5 21 4 9 1 13 13 5 19v6H36z" fill="#fff" />
        <Rect x="38" y="66" width="44" height="12" rx="3" fill="#f3efe9" />
        <Path d="M44 84h32" stroke="#6b4a2e" strokeWidth="4" strokeLinecap="round" />
        <Path d="M60 88v14" stroke="#6b4a2e" strokeWidth="4" strokeLinecap="round" /><Ellipse cx="60" cy="104" rx="8" ry="5" fill="#6b4a2e" />
        <Path d="M92 28l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" />
      </Svg>
      {label && <Text style={{ fontWeight: '800', fontSize: 12, color: colors.ink, marginTop: 2 }}>Meal Sensei</Text>}
    </View>
  );
}
