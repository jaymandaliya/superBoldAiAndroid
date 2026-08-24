import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-simple-toast';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, AUTH_URL, LEARNING_URL } from '../constants';
import { LANGUAGES } from '../constants/languages';
import { LanguageSelector, LanguageConfirmSheet } from '../components';
import { AuthStorage, CrashlyticsHelper } from '../helpers';
import { useI18n } from '../localization';
import { Language, Learning } from '../types';
import { fetchAppSettings } from '../services';

const NATIVE_LANGUAGE_CODES = ['hi', 'gu', 'mr', 'bn', 'ta', 'te', 'en', 'kn', 'ml', 'pa', 'ur'];
const NATIVE_LANGUAGES = NATIVE_LANGUAGE_CODES
  .map(code => LANGUAGES.find(l => l.code === code))
  .filter((l): l is Language => Boolean(l));

const TARGET_LANGUAGE_CODES = ['en', 'de', 'fr', 'es', 'nl', 'sv', 'hi', 'zh', 'ja', 'ko'];
const TARGET_LANGUAGES = TARGET_LANGUAGE_CODES
  .map(code => LANGUAGES.find(l => l.code === code))
  .filter((l): l is Language => Boolean(l));

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingLanguageModal'>;

export function OnboardingLanguageModal({ navigation, route }: Props) {
  const { user, existingLearning } = route.params;
  const insets = useSafeAreaInsets();
  const { t, setLanguage } = useI18n();

  const [native, setNative] = useState<Language | null>(null);
  const [showNative, setShowNative] = useState(false);
  const [target, setTarget] = useState<Language | null>(null);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [showTargetConfirm, setShowTargetConfirm] = useState(false);
  const [confirmingTarget, setConfirmingTarget] = useState(false);
  const [pendingUser, setPendingUser] = useState<typeof user | null>(null);

  const slideAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 60, useNativeDriver: true }),
    ]).start();

    // Auto-open native picker once the sheet animation settles
    const t = setTimeout(() => setShowNative(true), 350);
    return () => clearTimeout(t);
  }, []);

  const handleNativeSelect = (lang: Language) => {
    setNative(lang);
    setShowNative(false);
    // Switch entire app to native language immediately
    void setLanguage(lang.code);
  };

  const handleContinue = async () => {
    if (!native) {
      Toast.show('Please select your language', Toast.SHORT);
      setShowNative(true);
      return;
    }

    try {
      // Persist native language locally
      await AuthStorage.saveLanguageContext(native.code, '', String(user.id));

      // Sync to backend — best effort, don't block navigation on failure
      const token = await AuthStorage.getToken();
      if (token) {
        fetch(`${AUTH_URL}/update-profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ native_language: native.code }),
        }).catch(() => {});
      }

      const updatedUser = { ...user, native_language: native.code } as typeof user;

      // Skip the path-choice screen entirely when the 1:1 companion flow is remotely disabled —
      // there's nothing to choose between, so go straight into profile completion.
      let isCompanionFlowEnabled = true;
      try {
        const { ok, settings } = await fetchAppSettings();
        if (ok && settings) isCompanionFlowEnabled = settings.isCompanionFlow;
      } catch (error) {
        CrashlyticsHelper.recordError(error as Error, 'fetchAppSettings:onboardingLanguage');
      }

      if (isCompanionFlowEnabled) {
        navigation.replace('PathChoice', {
          user: updatedUser,
          existingLearning,
        });
      } else {
        // No path to choose — still need a target language before profile completion.
        setPendingUser(updatedUser);
        setShowTargetConfirm(true);
        setTimeout(() => setShowTargetPicker(true), 350);
      }
    } catch (e) {
      CrashlyticsHelper.recordError(e as Error, 'OnboardingLanguageModal.handleContinue');
      Toast.show('Something went wrong. Please try again.', Toast.SHORT);
    }
  };

  const handleTargetPicked = (lang: Language) => {
    if (native && lang.code === native.code) {
      Toast.show(t('language_selection_same_language_toast'), Toast.SHORT);
      return;
    }
    setTarget(lang);
    setShowTargetPicker(false);
  };

  const handleConfirmTarget = async () => {
    if (!target) return;
    setConfirmingTarget(true);
    const updatedUser = pendingUser ?? user;

    try {
      const token = await AuthStorage.getToken();
      let learningToPass: Learning | null | undefined = existingLearning;

      if (token && native) {
        const response = await fetch(LEARNING_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nativeLanguage: native.code, targetLanguage: target.code }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.learning) learningToPass = data.learning as Learning;
          await AuthStorage.saveLanguageContext(native.code, target.code, String(user.id));
        }
      }

      setShowTargetConfirm(false);
      navigation.replace('UserNameCapture', {
        user: updatedUser,
        existingLearning: learningToPass,
        pathChoice: 'learn',
      });
    } catch (e) {
      CrashlyticsHelper.recordError(e as Error, 'OnboardingLanguageModal.handleConfirmTarget');
      setShowTargetConfirm(false);
      navigation.replace('UserNameCapture', {
        user: updatedUser,
        existingLearning,
        pathChoice: 'learn',
      });
    } finally {
      setConfirmingTarget(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <StatusBar barStyle="light-content" backgroundColor="#080C16" translucent={false} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Top area — greeting */}
        <Animated.View style={[styles.topArea, { opacity: fadeAnim }]}>
          <View style={styles.brandMark}>
            <Ionicons name="mic" size={28} color={COLORS.primaryLight} />
          </View>
          <Text style={styles.greeting}>{t('onboarding_language_greeting')}</Text>
          <Text style={styles.greetingDesc}>{t('onboarding_language_greeting_desc')}</Text>
        </Animated.View>
      </SafeAreaView>

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 24 },
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <Text style={styles.title}>{t('language_selection_select_native_modal_title')}</Text>
        <Text style={styles.subtitle}>{t('language_selection_select_languages_subtitle')}</Text>

        {/* Native language row */}
        <TouchableOpacity
          style={styles.langRow}
          onPress={() => setShowNative(true)}
          activeOpacity={0.8}
        >
          <View style={styles.langRowLeft}>
            <View style={styles.langIcon}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.primaryLight} />
            </View>
            <View>
              <Text style={styles.langLabel}>{t('language_selection_i_speak_label')}</Text>
           {native ? (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Text style={styles.langValue}>{native.flag}</Text>
    <Text style={[styles.langValue, { marginLeft: 8 }]}>{native.name}</Text>
  </View>
) : (
  <Text style={styles.langPlaceholder}>{t('language_selection_native_placeholder')}</Text>
)}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.btn, !native && styles.btnDisabled]}
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={!native}
        >
          <Text style={styles.btnText}>{t('language_selection_continue_setup_button')}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </Animated.View>

      <LanguageSelector
        visible={showNative}
        onClose={() => setShowNative(false)}
        onSelect={handleNativeSelect}
        title={t('language_selection_select_native_modal_title')}
        selectedLanguage={native}
        languages={NATIVE_LANGUAGES}
      />

      <LanguageSelector
        visible={showTargetPicker}
        onClose={() => setShowTargetPicker(false)}
        onSelect={handleTargetPicked}
        title={t('path_choice_target_lang_title')}
        selectedLanguage={target}
        languages={TARGET_LANGUAGES}
      />

      <LanguageConfirmSheet
        visible={showTargetConfirm}
        title={t('path_choice_target_lang_title')}
        label={t('language_selection_i_want_to_learn_label')}
        language={target}
        placeholder={t('language_selection_target_placeholder')}
        onPressChange={() => setShowTargetPicker(true)}
        ctaLabel={t('language_selection_continue_setup_button')}
        onConfirm={handleConfirmTarget}
        ctaDisabled={!target}
        ctaLoading={confirmingTarget}
        onBack={() => {
          setShowTargetConfirm(false);
          setShowTargetPicker(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#080C16',
    justifyContent: 'flex-end',
  },
  safeArea: {
    flex: 1,
  },
  topArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 20,
  },
  brandMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,91,46,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,91,46,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 26,
    fontFamily: FONTS.bold,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 10,
  },
  greetingDesc: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  sheet: {
    backgroundColor: '#121826',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: '#fff',
    lineHeight: 32,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginBottom: 24,
    lineHeight: 19,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 16,
    marginBottom: 20,
  },
  langRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  langIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,91,46,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  langLabel: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    marginBottom: 3,
  },
  langValue: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    color: '#fff',
  },
  langPlaceholder: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: 'rgba(255,255,255,0.3)',
  },
  btn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    fontSize: 17,
    fontFamily: FONTS.semiBold,
    color: '#fff',
    letterSpacing: 0.3,
  },
});
