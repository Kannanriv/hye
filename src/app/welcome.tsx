import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, IconName, TextField, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import { useStore } from '@/state/store';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'chatbubbles-outline', title: 'One place to talk', body: 'Chats and groups in a calm, simple inbox.' },
  { icon: 'archive-outline', title: 'Keep your memories', body: 'Bring old chats over from an export. Your original stays untouched.' },
  { icon: 'shield-checkmark-outline', title: 'You’re in control', body: 'No passwords for other apps. Export or delete everything, any time.' },
];

export default function Welcome() {
  const { dispatch, audit } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'intro' | 'account'>('intro');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);

  const errors = {
    name: name.trim().length < 2 ? 'Enter at least 2 characters' : undefined,
    handle: !/^[a-z0-9_]{3,20}$/.test(handle) ? '3–20 lowercase letters, numbers or _' : undefined,
    email: !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Enter an email like name@example.com' : undefined,
  };
  const valid = !errors.name && !errors.handle && !errors.email;

  const create = () => {
    setTried(true);
    if (!valid) return;
    dispatch({ type: 'signUp', user: { id: newId('usr'), displayName: name.trim(), handle, email: email.trim(), createdAt: new Date().toISOString() } });
    audit('account.created', `@${handle}`);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <Txt variant="title" color="accent" style={{ fontSize: 44 }}>hye</Txt>
          {step === 'intro' ? (
            <>
              <Txt variant="heading">One place. All your conversations. Your memories kept.</Txt>
              <View style={{ gap: space.lg, marginVertical: space.lg }}>
                {PROMISES.map(p => (
                  <View key={p.title} style={styles.promise}>
                    <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}><Ionicons name={p.icon} size={22} color={colors.accent} /></View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="subheading">{p.title}</Txt>
                      <Txt variant="small" color="textMuted">{p.body}</Txt>
                    </View>
                  </View>
                ))}
              </View>
              <Button label="Get started" onPress={() => setStep('account')} />
            </>
          ) : (
            <>
              <Txt variant="heading">Create your account</Txt>
              <TextField label="Your name" value={name} onChangeText={setName} placeholder="How people will see you" autoComplete="name" error={tried ? errors.name : undefined} />
              <TextField label="Username" value={handle} onChangeText={t => setHandle(t.toLowerCase())} placeholder="e.g. kannan" autoCapitalize="none" autoCorrect={false} error={tried ? errors.handle : undefined} />
              <TextField label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={tried ? errors.email : undefined} />
              <Banner icon="phone-portrait-outline" title="Demo mode" body="Your account and messages stay on this device. The full version signs you in with a passkey instead of a password." />
              <Button label="Create account" onPress={create} />
              <Button label="Back" variant="ghost" onPress={() => setStep('intro')} />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: space.xl, justifyContent: 'center' },
  inner: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: space.md },
  promise: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
