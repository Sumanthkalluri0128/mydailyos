import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Screen, useThemedStyles } from '../components/UI';
import { read, useRefreshOnSync } from '../utils/offline';
import Buddy, { type BuddyScene } from '../motion/Buddy';
import { CHARS, type Who } from '../motion/chars';
import { BadgeShelf } from '../components/simple/SimpleProgress';
import { useSimple } from '../utils/simple';

// Each character's special pose unlocks with a badge — earn the badge, get the sticker.
const STICKERS: { who: Who; scene: BuddyScene; badge: string; how: string }[] = [
  { who: 'naruto', scene: 'cheer', badge: 'tasks-1', how: 'Finish your first task' },
  { who: 'luffy', scene: 'eat', badge: 'log-7', how: 'Log 7 days in a row' },
  { who: 'zoro', scene: 'fight', badge: 'workout-3', how: 'Work out 3 days in a row' },
  { who: 'tanjiro', scene: 'drink', badge: 'water-3', how: '3-day water streak' },
  { who: 'goku', scene: 'powerup', badge: 'workout-7', how: 'Work out 7 days in a row' },
  { who: 'zenitsu', scene: 'drink', badge: 'water-7', how: '7-day water streak' },
  { who: 'killua', scene: 'task', badge: 'tasks-10', how: 'Finish 10 tasks' },
  { who: 'asta', scene: 'lift', badge: 'workouts-10', how: 'Log 10 workouts' },
  { who: 'jinwoo', scene: 'levelup', badge: 'habit-7', how: 'Complete a habit 7 days in a row' },
  { who: 'kakashi', scene: 'plan', badge: 'meals-50', how: 'Log 50 meals' },
  { who: 'bakugo', scene: 'fight', badge: 'workouts-50', how: 'Log 50 workouts' },
  { who: 'vegeta', scene: 'powerup', badge: 'water-30', how: '30-day water streak' },
  { who: 'gojo', scene: 'victory', badge: 'log-30', how: 'Log 30 days in a row' },
];

type Badge = { id: string; emoji: string; title: string; description: string; target: number; progress: number; unlocked: boolean };

export default function Achievements() {
  const { S, colors } = useThemedStyles();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [simple] = useSimple();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await read<any>('/api/progress/achievements');
      setBadges(r.badges || []);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnSync(() => load());

  if (loading) return <SafeAreaView style={S.safe}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary} /></View></SafeAreaView>;

    return (
    <Screen buddyWho="gojo" buddy="cheer" buddySays="Look at you!" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Achievements</Text>
      <Text style={S.sub}>{simple ? `${simple.badges.earnedCount} of ${simple.badges.total} badges earned` : ''}</Text>

      <BadgeShelf d={simple} />

      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 10, marginBottom: 10 }}>Sticker collection</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {STICKERS.map((st) => {
          const on = !!badges.find((b) => b.id === st.badge)?.unlocked;
          return (
            <View key={st.who} accessible accessibilityLabel={`${CHARS[st.who]} sticker, ${on ? 'unlocked' : `locked: ${st.how}`}`} style={{ width: '31%', alignItems: 'center', backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 16, padding: 8, marginBottom: 10 }}>
              <View style={{ opacity: on ? 1 : 0.18 }}>{on ? <Buddy who={st.who} scene={st.scene} size={72} label="" /> : <Buddy who={st.who} scene="wave" size={72} label="" />}</View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.ink }}>{on ? CHARS[st.who] : '🔒 ' + CHARS[st.who]}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }} numberOfLines={2}>{st.how}</Text>
            </View>
          );
        })}
      </View>

    </Screen>
  );
}
