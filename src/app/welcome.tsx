import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, useHaptics } from '@/components/premium';
import { ActionSheet, Banner, Button, IconName, TextField, Txt } from '@/components/ui';
import { newId } from '@/domain/hash';
import { useStore } from '@/state/store';
import { gradients, radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'chatbubbles-outline', title: 'Chats & groups', body: 'Calm, fast messaging with the people who matter.' },
  { icon: 'sparkles-outline', title: 'Posts, photos & reels', body: 'Share moments with your contacts — your way.' },
  { icon: 'archive-outline', title: 'Keep your memories', body: 'Bring old chats over from a WhatsApp export.' },
  { icon: 'shield-checkmark-outline', title: 'You’re in control', body: 'Export or delete everything, any time.' },
];

const COUNTRIES = [
  { code: '+91', flag: '🇮🇳', name: 'India', digits: 10 },
  { code: '+1', flag: '🇺🇸', name: 'United States', digits: 10 },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom', digits: 10 },
  { code: '+971', flag: '🇦🇪', name: 'United Arab Emirates', digits: 9 },
  { code: '+65', flag: '🇸🇬', name: 'Singapore', digits: 8 },
  { code: '+61', flag: '🇦🇺', name: 'Australia', digits: 9 },
  { code: '+49', flag: '🇩🇪', name: 'Germany', digits: 11 },
];

/** The prototype has no SMS server, so the code is shown on screen and labelled as a demo. */
const DEMO_CODE = '246810';

type Step = 'intro' | 'phone' | 'code' | 'profile';

export default function Welcome() {
  const { dispatch, audit } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const buzz = useHaptics();
  const [step, setStep] = useState<Step>('intro');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [pickCountry, setPickCountry] = useState(false);
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [tried, setTried] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);

  const digits = number.replace(/\D/g, '');
  const phoneValid = digits.length >= Math.min(country.digits, 8) && digits.length <= 12;
  const e164 = `${country.code}${digits}`;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = () => {
    if (!phoneValid) return;
    buzz('tap');
    setCode('');
    setCodeError(undefined);
    setResendIn(30);
    setStep('code');
    setTimeout(() => codeInput.current?.focus(), 350);
  };

  const onCode = (v: string) => {
    const c = v.replace(/\D/g, '').slice(0, 6);
    setCode(c);
    setCodeError(undefined);
    if (c.length === 6) {
      if (c === DEMO_CODE) {
        buzz('success');
        setStep('profile');
      } else {
        buzz('warning');
        setCodeError('That code doesn’t match. Check it and try again.');
      }
    }
  };

  const errors = {
    name: name.trim().length < 2 ? 'Enter at least 2 characters' : undefined,
    handle: handle && !/^[a-z0-9_]{3,20}$/.test(handle) ? '3–20 lowercase letters, numbers or _' : undefined,
  };

  const create = () => {
    setTried(true);
    if (errors.name || errors.handle) return;
    buzz('success');
    dispatch({
      type: 'signUp',
      user: { id: newId('usr'), displayName: name.trim(), handle: handle || undefined, phone: e164, createdAt: new Date().toISOString() },
    });
    audit('account.created', handle ? `@${handle}` : `phone ending ${digits.slice(-4)}`);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {step === 'intro' ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + space.xxl }]}>
          <Animated.Text entering={FadeInDown.springify()} style={styles.logo}>hye</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(120).springify()} style={styles.tagline}>
            One place. All your conversations.{'\n'}Your memories preserved.
          </Animated.Text>
        </LinearGradient>
      ) : null}
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: step === 'intro' ? space.xl : insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {step === 'intro' ? (
            <>
              {PROMISES.map((p, i) => (
                <Animated.View key={p.title} entering={FadeInUp.delay(150 + i * 80).springify()} style={styles.promise}>
                  <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}><Ionicons name={p.icon} size={22} color={colors.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="subheading">{p.title}</Txt>
                    <Txt variant="small" color="textMuted">{p.body}</Txt>
                  </View>
                </Animated.View>
              ))}
              <Banner icon="phone-portrait-outline" title="This is a demo" body="Everything stays on this phone. The people and posts you’ll see are simulated so you can explore." />
              <GradientButton label="Continue with mobile number" icon="call-outline" onPress={() => setStep('phone')} />
            </>
          ) : null}

          {step === 'phone' ? (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: space.md }}>
              <Txt variant="title">Your mobile number</Txt>
              <Txt color="textMuted">We’ll send a 6-digit code to confirm it’s you.</Txt>
              <View style={styles.phoneRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Country code ${country.name} ${country.code}. Change`}
                  onPress={() => setPickCountry(true)}
                  style={[styles.cc, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}
                >
                  <Text style={{ fontSize: 20 }}>{country.flag}</Text>
                  <Txt variant="subheading">{country.code}</Txt>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </Pressable>
                <TextInput
                  autoFocus
                  value={number}
                  onChangeText={setNumber}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  placeholder="Mobile number"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Mobile number"
                  maxLength={15}
                  style={[type.heading, styles.phoneInput, { borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text }]}
                  onSubmitEditing={sendCode}
                />
              </View>
              <GradientButton label="Send code" icon="arrow-forward" onPress={sendCode} disabled={!phoneValid} />
              <Button label="Back" variant="ghost" onPress={() => setStep('intro')} />
            </Animated.View>
          ) : null}

          {step === 'code' ? (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: space.md }}>
              <Txt variant="title">Enter the code</Txt>
              <Txt color="textMuted">Sent to {country.code} {digits}</Txt>
              <Banner icon="flask-outline" title={`Demo code: ${DEMO_CODE}`} body="No SMS is sent in this prototype. Real sign-in will text you a code." action={
                <View style={{ marginTop: space.sm, alignSelf: 'flex-start' }}><Button label="Fill it in" compact variant="secondary" onPress={() => onCode(DEMO_CODE)} /></View>
              } />
              <Pressable accessibilityLabel="6-digit code" onPress={() => codeInput.current?.focus()} style={styles.boxes}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const active = i === code.length;
                  return (
                    <View key={i} style={[styles.box, { borderColor: codeError ? colors.danger : active ? colors.accent : colors.borderStrong, backgroundColor: colors.surface }]}>
                      <Txt variant="heading">{code[i] ?? ''}</Txt>
                    </View>
                  );
                })}
              </Pressable>
              <TextInput
                ref={codeInput}
                value={code}
                onChangeText={onCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                accessibilityLabel="Verification code"
                style={styles.hiddenInput}
              />
              {codeError ? <Txt variant="small" color="danger">{codeError}</Txt> : null}
              <Button label={resendIn ? `Resend code in ${resendIn}s` : 'Resend code'} variant="ghost" disabled={resendIn > 0} onPress={sendCode} />
              <Button label="Change number" variant="ghost" onPress={() => setStep('phone')} />
            </Animated.View>
          ) : null}

          {step === 'profile' ? (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: space.md }}>
              <View style={[styles.verified, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                <Txt variant="small" color="accent" style={{ fontWeight: '700' }}>{country.code} {digits} verified</Txt>
              </View>
              <Txt variant="title">Set up your profile</Txt>
              <TextField label="Your name" value={name} onChangeText={setName} placeholder="How people will see you" autoComplete="name" error={tried ? errors.name : undefined} />
              <TextField label="Username (optional)" value={handle} onChangeText={t => setHandle(t.toLowerCase().replace(/^@/, ''))} placeholder="e.g. kannan" autoCapitalize="none" autoCorrect={false} error={tried ? errors.handle : undefined} />
              <Txt variant="caption" color="textMuted">People can find you by your number. A username lets you share your profile without it.</Txt>
              <GradientButton label="Start using hye" icon="sparkles" onPress={create} />
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>
      <ActionSheet
        visible={pickCountry}
        title="Country"
        onClose={() => setPickCountry(false)}
        actions={COUNTRIES.map(c => ({ label: `${c.flag}  ${c.name} (${c.code})`, icon: c.code === country.code ? 'checkmark' : 'globe-outline', onPress: () => setCountry(c) }))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.xl, paddingBottom: space.xxl, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  logo: { color: '#fff', fontSize: 56, fontWeight: '800', letterSpacing: -2 },
  tagline: { color: 'rgba(255,255,255,0.92)', fontSize: 20, fontWeight: '600', lineHeight: 27, marginTop: space.sm },
  wrap: { flexGrow: 1, paddingHorizontal: space.xl },
  inner: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: space.md },
  promise: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  phoneRow: { flexDirection: 'row', gap: space.sm },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, borderWidth: 1, borderRadius: radius.md, minHeight: 56 },
  phoneInput: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 56 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  box: { flex: 1, aspectRatio: 0.85, maxWidth: 56, borderWidth: 1.5, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
});
