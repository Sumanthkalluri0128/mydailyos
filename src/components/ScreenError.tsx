import React, { useEffect } from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { reportError } from '../utils/sentry';

/**
 * Each tab exports this as its `ErrorBoundary` (Expo Router shows it when the tab crashes), so one broken tab never closes the app.
 * The crash is reported to Sentry with the route name. Written without the theme hooks on purpose: if theming is what broke, this still shows.
 */
export function ScreenError({ error, retry }: { error: Error; retry: () => Promise<void> | void }) {
  useEffect(() => { reportError(error, { boundary: 'tab' }); }, [error]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <View accessibilityRole="alert" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1d2040', marginBottom: 8 }}>Something went wrong here</Text>
        <Text style={{ color: '#6b7090', textAlign: 'center', marginBottom: 18 }}>The rest of the app is fine and your data is safe.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => retry()} style={{ minHeight: 48, paddingHorizontal: 24, borderRadius: 14, backgroundColor: '#5b5bd6', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Try again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
