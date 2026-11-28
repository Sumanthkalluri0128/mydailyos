import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { authPost } from '../config/api';
import { BrandHeader, Field, Button, useThemedStyles } from '../components/UI';
import { AUTH } from '../motion/authSignals';
import { useNotifications } from '../components/Notifications';

export default function Forgot() {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { AUTH.on = true; AUTH.mode = 'forgot'; AUTH.errAt = 0; AUTH.pw = false; return () => { AUTH.on = false; }; }, []);

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return error('Check your email', 'Enter the email you signed up with.');
    setBusy(true);
    try { await authPost('/api/auth/forgot', { email: email.trim() }); setStep('code'); success('Check your inbox', 'If that email is registered, we sent an 8-character code. It expires in 30 minutes. Check spam too.'); }
    catch (e: any) { error('Could not send code', e.message); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (code.trim().length < 6) return error('Enter the code', 'Type the 8-character code from the email.');
    if (pw.length < 8) return error('Password too short', 'Use at least 8 characters.');
    setBusy(true);
    try { await authPost('/api/auth/reset', { email: email.trim(), code: code.trim(), newPassword: pw }); success('Password updated', 'You can sign in now.'); router.replace('/login'); }
    catch (e: any) { error('Reset failed', e.message); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={S.screen} behavior="padding">
      <ScrollView contentContainerStyle={[S.page, { paddingTop: 55 }]} keyboardShouldPersistTaps="handled">
        <BrandHeader onPress={() => {}} />
        <Text style={S.title}>Reset password</Text>
        <Text style={[S.muted, { marginBottom: 25 }]}>{step === 'email' ? "We'll email you a one-time code." : `Enter the code sent to ${email.trim()}.`}</Text>
        {step === 'email' ? (
          <>
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Button title={busy ? 'Please wait…' : 'Send code'} onPress={send} disabled={busy} />
          </>
        ) : (
          <>
            <Field label="Code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="ABCD2345" />
            <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry />
            <Button title={busy ? 'Please wait…' : 'Update password'} onPress={reset} disabled={busy} />
            <Pressable onPress={() => setStep('email')}><Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '700', marginTop: 16 }}>Send a new code</Text></Pressable>
          </>
        )}
        <Pressable onPress={() => router.replace('/login')}><Text style={{ textAlign: 'center', color: colors.muted, marginTop: 20 }}>Back to sign in</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
