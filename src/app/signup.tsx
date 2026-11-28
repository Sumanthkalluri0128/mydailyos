import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { authPost } from '../config/api';
import { startSession } from '../utils/session';
import { BrandHeader, Field, Button, useThemedStyles } from '../components/UI';
import { useNotifications } from '../components/Notifications';
import { AUTH } from '../motion/authSignals';
import { GoogleButton } from '../components/GoogleButton';

export default function Signup() {
  const { S, colors } = useThemedStyles();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const { error, warning } = useNotifications();
  useEffect(() => { AUTH.on = true; AUTH.mode = 'signup'; AUTH.errAt = 0; AUTH.pw = false; return () => { AUTH.on = false; }; }, []);

  async function go() {
    if (!name.trim() || !email.trim() || !password) return warning('Missing details', 'Complete all required fields.');
    if (password.length < 8) return warning('Password too short', 'Use at least 8 characters.');
    if (password !== confirm) return warning('Check password', 'Passwords do not match.');
    setBusy(true);
    try {
      const d = await authPost<any>('/api/auth/signup', { name: name.trim(), email: email.trim(), password });
      await startSession(d.token, d.user);
      router.replace('/onboarding');
    } catch (e: any) { AUTH.errAt = Date.now(); error('Signup failed', e.message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={S.screen} behavior="padding">
      <ScrollView contentContainerStyle={[S.page, { paddingTop: 28 }]} keyboardShouldPersistTaps="handled">
        <BrandHeader onPress={() => {}} />
        <Text style={S.title}>Create your account</Text>
        <Text style={[S.muted, { marginBottom: 20 }]}>One account works on web and mobile.</Text>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry />
        <Button title={busy ? 'Creating…' : 'Create account'} onPress={go} disabled={busy} />
        <GoogleButton />
        <Pressable onPress={() => router.back()}>
          <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '700', marginTop: 20 }}>Already have an account? Login</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
