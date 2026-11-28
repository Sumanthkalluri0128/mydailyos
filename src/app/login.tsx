import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { authPost } from '../config/api';
import { startSession } from '../utils/session';
import { BrandHeader, Field, Button, useThemedStyles } from '../components/UI';
import { useNotifications } from '../components/Notifications';
import { AUTH } from '../motion/authSignals';
import { GoogleButton } from '../components/GoogleButton';

export default function Login() {
  const { S, colors } = useThemedStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { error } = useNotifications();
  useEffect(() => { AUTH.on = true; AUTH.mode = 'login'; AUTH.errAt = 0; AUTH.pw = false; return () => { AUTH.on = false; }; }, []);

  async function go() {
    if (!email.trim() || !password) return error('Missing details', 'Enter your email and password.');
    setBusy(true);
    try {
      const d = await authPost<any>('/api/auth/login', { email: email.trim(), password });
      await startSession(d.token, d.user);
      router.replace('/(tabs)');
    } catch (e: any) { AUTH.errAt = Date.now(); error('Login failed', e.message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={S.screen} behavior="padding">
      <ScrollView contentContainerStyle={[S.page, { paddingTop: 55 }]} keyboardShouldPersistTaps="handled">
        <BrandHeader onPress={() => {}} />
        <Text style={S.title}>Welcome back 👋</Text>
        <Text style={[S.muted, { marginBottom: 25 }]}>Sign in to FlexFit</Text>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title={busy ? 'Please wait…' : 'Login'} onPress={go} disabled={busy} />
        <GoogleButton />
        <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 12 }}>Same email as your existing account? Google sign-in opens that same account and all its data.</Text>
        <Pressable onPress={() => router.push('/forgot' as any)}>
          <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '700', marginTop: 16 }}>Forgot password?</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/signup')}>
          <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '700', marginTop: 20 }}>Create a new account</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
