import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StyleSheet,
  ScrollView,
  StatusBar,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-simple-toast';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, AUTH_URL } from '../constants';
import { CrashlyticsHelper, AuthStorage } from '../helpers';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { OnboardingProgressBar, VoiceoverAvatar } from '../components';
import { useResolvedNativeLanguage, useOnboardingClips, useVoiceoverPlayback } from '../hooks';

type Props = NativeStackScreenProps<RootStackParamList, 'UserNameCapture'>;

export function UserNameCaptureScreen({ navigation, route }: Props) {
  const { user, existingLearning, pathChoice } = route.params;
  const isChatPath = pathChoice === 'chat';

  const { t } = useI18n();

  const [name,        setName]        = useState(user.name ?? '');
  const [isReady,     setIsReady]     = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  const nativeLanguageCode = useResolvedNativeLanguage(String(user.id), existingLearning?.native_language);
  const onboardingAudio = useOnboardingClips(nativeLanguageCode);
  const { isPlaying, playSequence } = useVoiceoverPlayback();

  // Prevent ghost touches from the previous screen firing the CTA
  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => setIsReady(true), 350);
      return () => { clearTimeout(timer); setIsReady(false); };
    }, []),
  );

  // ── Animations ──────────────────────────────────────────────────────────────

  const fadeAnim        = useRef(new Animated.Value(0)).current;
  const slideAnim        = useRef(new Animated.Value(30)).current;
  const inputBorderAnim = useRef(new Animated.Value(0)).current;
  const ctaPressAnim    = useRef(new Animated.Value(1)).current;

  const onCtaPressIn  = () =>
    Animated.spring(ctaPressAnim, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onCtaPressOut = () =>
    Animated.spring(ctaPressAnim, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const playNameAudio = () => {
    const clip = onboardingAudio.name;
    if (clip) playSequence([clip.url]);
  };

  useEffect(() => {
    playNameAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingAudio]);

  const hasAudioForStep = Boolean(onboardingAudio.name);

  const handleFocus = () =>
    Animated.timing(inputBorderAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
  const handleBlur  = () =>
    Animated.timing(inputBorderAnim, { toValue: 0, duration: 280, useNativeDriver: false }).start();

  const animatedBorderColor = inputBorderAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(255,255,255,0.10)', COLORS.primary],
  });

  // ── Chat-path: save name only, then open TalkingSession directly ───────────
  // (1:1 companion path isn't paywall-gated the same way "learn" is — kept as-is.)

  const handleSaveChatPath = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      Toast.show(t('username_name_too_short_toast'), Toast.SHORT);
      return;
    }
    setChatLoading(true);
    try {
      const token = await AuthStorage.getToken();
      let response = await fetch(`${AUTH_URL}/update-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok && (response.status === 400 || response.status === 422)) {
        response = await fetch(`${AUTH_URL}/update-profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: trimmedName }),
        });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('username_save_failed_toast'));
      if (data.token) await AuthStorage.saveToken(data.token);

      await AuthStorage.saveUserPath(String(user.id), 'chat');
      CrashlyticsHelper.setAttribute('user_name', trimmedName);

      const updatedUser = { ...user, name: trimmedName };
      navigation.reset({
        index: 1,
        routes: [
          { name: 'MainTabs',       params: { user: updatedUser, existingLearning } },
          { name: 'TalkingSession', params: { user: updatedUser } },
        ],
      });
    } catch (error: any) {
      CrashlyticsHelper.recordError(error as Error, 'handleSaveChatPath');
      Toast.show(error.message || t('username_save_failed_toast'), Toast.LONG);
    } finally {
      setChatLoading(false);
    }
  };

  // ── CTA state ───────────────────────────────────────────────────────────────

  const ctaDisabled = !isReady || name.trim().length < 2 || chatLoading;

  const ctaLabel = chatLoading ? t('username_saving_button') : t('username_continue_button');

  const handleCtaPress = () => {
    const trimmedName = name.trim();
    if (isChatPath) {
      void handleSaveChatPath();
    } else {
      // Learn path goes straight into the age/goal/skill chain — no paywall
      // interstitial here. Paywall shows later, only once that chain finishes
      // (see useFinalizeOnboarding) or when starting a session without access.
      navigation.navigate('AgeCapture', { user, existingLearning, name: trimmedName });
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#080C16" translucent={false} />

      {/* Subtle background orbs for depth */}
      <View style={styles.bgOrb1} pointerEvents="none" />
      <View style={styles.bgOrb2} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* ── Header: back button + progress bar ───────────────────────── */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <OnboardingProgressBar step={1} totalSteps={isChatPath ? 1 : 4} />
          </View>

          {/* ── Scrollable Content ─────────────────────────────────────────── */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <View style={styles.stepContent}>
                <VoiceoverAvatar visible={hasAudioForStep} isPlaying={isPlaying} onReplay={playNameAudio} />
                <Text style={styles.eyebrow}>{t('username_eyebrow')}</Text>
                <Text style={styles.stepTitle} maxFontSizeMultiplier={1.2}>{t('username_name_card_title')}</Text>
                <Text style={styles.stepSubtitle} maxFontSizeMultiplier={1.2}>{t('username_name_subtitle')}</Text>

                {/* Animated input */}
                <Animated.View style={[styles.inputWrap, { borderColor: animatedBorderColor }]}>
                  <Ionicons name="person-outline" size={20} color={COLORS.textDim} style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputField}
                    placeholder={t('username_name_placeholder')}
                    placeholderTextColor={COLORS.textDim}
                    value={name}
                    onChangeText={setName}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    autoCapitalize="words"
                    maxLength={30}
                    returnKeyType="done"
                    onSubmitEditing={() => {Keyboard.dismiss();}}
                    editable={!chatLoading}
                  />
                  {name.trim().length >= 2 && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  )}
                </Animated.View>

                {/* Social proof */}
                <View style={styles.socialProofRow}>
                  <View style={styles.socialDot} />
                  <Text style={styles.socialProofText}>{t('username_social_proof')}</Text>
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          {/* ── CTA Footer ─────────────────────────────────────────────────── */}
          <View style={styles.ctaFooter}>
            <Animated.View style={[styles.ctaButtonShadow, { transform: [{ scale: ctaPressAnim }] }]}>
              <TouchableOpacity
                onPress={handleCtaPress}
                onPressIn={onCtaPressIn}
                onPressOut={onCtaPressOut}
                disabled={ctaDisabled}
                activeOpacity={1}
                style={styles.ctaButton}
              >
                <LinearGradient
                  colors={ctaDisabled ? ['#161D2E', '#161D2E'] : ['#FF5B2E', '#FF8A4C']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
                <Text style={[styles.ctaText, ctaDisabled && styles.ctaTextDisabled]}>
                  {ctaLabel}
                </Text>
                {!chatLoading && (
                  <View style={styles.ctaIconWrap}>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={ctaDisabled ? 'rgba(255,255,255,0.25)' : '#fff'}
                    />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#080C16' },
  safeArea:     { flex: 1 },
  keyboardView: { flex: 1 },

  // ── Background orbs ─────────────────────────────────────────────────────────
  bgOrb1: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,91,46,0.055)',
    top: -80,
    right: -100,
  },
  bgOrb2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(124,107,255,0.045)',
    bottom: 100,
    left: -80,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  stepContent:   { width: '100%' },

  // ── Typography ──────────────────────────────────────────────────────────────
  eyebrow: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'left',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: Platform.OS === 'android' ? 24 : 28,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: Platform.OS === 'android' ? 32 : 40,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'left',
    marginBottom: 24,
    lineHeight: 22,
  },

  // ── Input ───────────────────────────────────────────────────────────────────
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1422',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  inputIcon:  { marginRight: 12 },
  inputField: {
    flex: 1,
    paddingVertical: 17,
    fontSize: 17,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },

  // ── Social Proof ─────────────────────────────────────────────────────────────
  socialProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  socialDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },
  socialProofText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.55)',
  },

  // ── Header: back button + progress bar ──────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── CTA Footer ──────────────────────────────────────────────────────────────
  ctaFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  ctaButtonShadow: {
    borderRadius: 15,
    shadowColor: '#FF5B2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 14,
  },
  ctaButton: {
    borderRadius: 15,
    overflow: 'hidden',
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  ctaText: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: '#fff',
    zIndex: 1,
  },
  ctaTextDisabled: { color: 'rgba(255,255,255,0.28)' },

  ctaIconWrap: {
    marginLeft: 10,
    zIndex: 1,
  },
});
