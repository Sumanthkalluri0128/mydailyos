// Home hero: ONE wide anime scene per day with its quote already painted on the right (no text is drawn over the artwork).
// Top-left: date + greeting. Below: the coach's "next step" card on the left, so the character and the quote on the right stay visible.
// The picture is anchored to the RIGHT edge, so when the card is taller than the picture the left (backdrop) is what gets cropped, never the quote.
// Starts on today's scene and switches to the next one every SCENE_MS while the app is open.
import React, { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { BuddyScene } from '../../motion/Buddy';
import { tourRef } from '../../tour/anchors';
import { HERO_SCENES, heroSceneOfDay } from './heroScenes';

// The scene changes every SCENE_MS while the app is open (starts from today's scene, then walks through the set).
export const SCENE_MS = 30_000;

export type HeroCoach = { scene: BuddyScene; title: string; text: string; action?: { label: string; onPress: () => void } };

const SHADOW = { textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 } as const;

export function HeroCard({ width, dateText, greeting, name, coach }: { width: number; dateText: string; greeting: string; name: string; coach: HeroCoach }) {
  const [idx, setIdx] = useState(() => HERO_SCENES.indexOf(heroSceneOfDay()));
  useEffect(() => { const t = setInterval(() => setIdx((i) => (i + 1) % HERO_SCENES.length), SCENE_MS); return () => clearInterval(t); }, []);
  const sc = HERO_SCENES[idx];
  const [h, setH] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setH(Math.round(e.nativeEvent.layout.height));
  // "cover", but pinned to the right edge
  const imgH = h ? Math.max(h, width / sc.ar) : 0;
  const imgW = imgH * sc.ar;
  return (
    <View onLayout={onLayout} style={{ width, borderRadius: 28, backgroundColor: '#1b1638', marginBottom: 12, borderWidth: 1.5, borderColor: `${sc.accent}88`, overflow: 'hidden' }}>
      {/* scene (decorative; the quote is part of the picture) */}
      {h > 0 && <Image source={sc.src} style={{ position: 'absolute', right: 0, top: (h - imgH) / 2, width: imgW, height: imgH }} resizeMode="cover" accessible={false} importantForAccessibility="no" />}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" pointerEvents="none">
        <Defs>
          <LinearGradient id="heroSide" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#0e0a24" stopOpacity="0.5" />
            <Stop offset="0.5" stopColor="#0e0a24" stopOpacity="0.18" />
            <Stop offset="1" stopColor="#0e0a24" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroSide)" />
      </Svg>

      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }}>
        <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '800', letterSpacing: 1.6, ...SHADOW }}>{dateText}</Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.6, marginTop: 2, maxWidth: '58%', ...SHADOW }} accessibilityRole="header">
          {greeting}, <Text style={{ color: sc.accent }}>{name}</Text> ☀️
        </Text>
        <View ref={tourRef('coach')} testID="tour-coach" collapsable={false}
          style={{ width: '58%', marginTop: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }}>
          <Text style={{ color: '#1f2340', fontWeight: '800', fontSize: 14 }}>{coach.title}</Text>
          <Text style={{ color: '#4a4f6a', fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>{coach.text}</Text>
          {coach.action && (
            <TouchableOpacity accessibilityRole="button" onPress={coach.action.onPress} style={{ alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#6847E8', borderRadius: 99, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{coach.action.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
