import { Tabs, router, useSegments } from 'expo-router';
import { useT } from '../../i18n';
import { Ionicons } from '@expo/vector-icons';
import { PanResponder, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tapHaptic } from '../../utils/haptics';
import { useTheme } from '../../utils/theme';

const TAB_ROUTES = ['index', 'log', 'workout', 'history', 'body', 'progress', 'tasks', 'profile'] as const;
const TAB_HREFS = [
  '/(tabs)',
  '/(tabs)/log',
  '/(tabs)/workout',
  '/(tabs)/history',
  '/(tabs)/body',
  '/(tabs)/progress',
  '/(tabs)/tasks',
  '/(tabs)/profile',
] as const;

type TabName = (typeof TAB_ROUTES)[number];

export default function TabsLayout() {
  const { t } = useT();
  const segments = useSegments();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const activeSegment = String(segments[segments.length - 1] || 'index');
  const activeIndex = TAB_ROUTES.indexOf(activeSegment as TabName);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  const navigateBySwipe = (direction: 'left' | 'right') => {
    const nextIndex = direction === 'left' ? safeIndex + 1 : safeIndex - 1;

    // At either edge, simply stay on the current tab. Never navigate to an
    // invalid Expo Router path (the old implementation could throw here).
    if (nextIndex < 0 || nextIndex >= TAB_ROUTES.length) return;

    router.replace(TAB_HREFS[nextIndex]);
  };

  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 28 &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_, gesture) => {
      const distance = Math.abs(gesture.dx);
      const velocity = Math.abs(gesture.vx);
      if (distance < 70 && velocity < 0.45) return;
      navigateBySwipe(gesture.dx < 0 ? 'left' : 'right');
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} {...responder.panHandlers}>
      <Tabs
        screenOptions={{
          headerShown: false,
          animation: 'none',
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 1 },
          tabBarStyle: {
            // Sits above the gesture bar / home indicator instead of being covered by it.
            height: 62 + Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 0),
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            elevation: 8,
          },
        }}
        screenListeners={{ tabPress: () => { tapHaptic(); } }}
      >
        <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
        <Tabs.Screen name="log" options={{ title: t('tab.food'), tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={color} size={size + 2} /> }} />
        <Tabs.Screen name="workout" options={{ title: 'Workout', tabBarIcon: ({ color, size }) => <Ionicons name="barbell" color={color} size={size} /> }} />
        <Tabs.Screen name="history" options={{ title: 'History', href: null }} />
        <Tabs.Screen name="body" options={{ title: 'Body', tabBarIcon: ({ color, size }) => <Ionicons name="body" color={color} size={size} /> }} />
        <Tabs.Screen name="progress" options={{ title: t('tab.progress'), tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} /> }} />
        <Tabs.Screen name="tasks" options={{ title: t('nav.task'), tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle" color={color} size={size} /> }} />
        <Tabs.Screen name="profile" options={{ title: t('nav.profile').split(' ')[0], tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
      </Tabs>
    </View>
  );
}
