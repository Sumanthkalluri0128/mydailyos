import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { API_URL } from '../config/api';
import { loginWithGoogle } from '../utils/google';
import { useTheme } from '../utils/theme';
import { useNotifications } from './Notifications';

/** "Continue with Google" — shown on both Login and Sign up. Always visible; explains itself if the server isn't set up yet. */
export function GoogleButton() {
  const { colors: c } = useTheme();
  const { warning, error, success } = useNotifications();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/google/config`).then((r) => r.json()).then((d) => setAvailable(!!d.available)).catch(() => setAvailable(null));
  }, []);

  async function go() {
    if (available === false) {
      return warning('Google sign-in isn\u2019t switched on yet', 'The server needs its Google keys first. Use email and password for now.');
    }
    setBusy(true);
    try {
      const r = await loginWithGoogle();
      if (r) {
        if (r.existing) success('Signed in', 'This is your existing FlexFit account — all your data is here.');
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      error('Google sign-in', e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        <Text style={{ marginHorizontal: 10, color: c.muted, fontSize: 12 }}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      </View>
      <TouchableOpacity onPress={go} disabled={busy} accessibilityRole="button" accessibilityLabel="Continue with Google"
        style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator size="small" color={c.primary} /> : <Text style={{ fontSize: 18, fontWeight: '900', color: '#4285F4' }}>G</Text>}
        <Text style={{ color: c.ink, fontWeight: '800', fontSize: 15 }}>Continue with Google</Text>
      </TouchableOpacity>
    </View>
  );
}
