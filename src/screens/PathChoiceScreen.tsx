import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, LEARNING_URL } from '../constants';
import { AuthStorage, CrashlyticsHelper } from '../helpers';
import { LANGUAGES } from '../constants/languages';
import { LanguageSelector, LanguageConfirmSheet } from '../components';
import { Language, Learning } from '../types';
import { useI18n } from '../localization';
import Toast from 'react-native-simple-toast';
import { fetchAppSettings } from '../services';

const TARGET_LANGUAGE_CODES = ['en', 'de', 'fr', 'es', 'nl', 'sv', 'hi', 'zh', 'ja', 'ko'];
const TARGET_LANGUAGES = TARGET_LANGUAGE_CODES
  .map(code => LANGUAGES.find(l => l.code === code))
  .filter((l): l is Language => Boolean(l));

const SUGGESTION_CODES = ['en', 'de', 'fr', 'es'];
const SUGGESTIONS = SUGGESTION_CODES
  .map(code => LANGUAGES.find(l => l.code === code))
  .filter((l): l is Language => Boolean(l));

type Props = NativeStackScreenProps<RootStackParamList, 'PathChoice'>;

export function PathChoiceScreen({ navigation, route }: Props) {
  const { user, existingLearning } = route.params;
  const { t } = useI18n();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slide1   = useRef(new Animated.Value(40)).current;
  const slide2   = useRef(new Animated.Value(40)).current;

  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [showTargetConfirm, setShowTargetConfirm] = useState(false);
  const [target, setTarget] = useState<Language | null>(null);
  const [loading, setLoading] = useState(false);
  const [nativeCode, setNativeCode] = useState<string | null>(null);
  // Default true so the card doesn't flash-hide while the flag is still loading.
  const [isCompanionFlowEnabled, setIsCompanionFlowEnabled] = useState(true);

  React.useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.stagger(100, [
        Animated.spring(slide1, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        Animated.spring(slide2, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  React.useEffect(() => {
    fetchAppSettings()
      .then(({ ok, settings }) => {
        if (ok && settings) setIsCompanionFlowEnabled(settings.isCompanionFlow);
      })
      .catch((error) => CrashlyticsHelper.recordError(error as Error, 'fetchAppSettings:pathChoice'));
  }, []);

  const handleLearning = async () => {
    try {
      await AuthStorage.saveUserPath(String(user.id), 'learn');
      const savedCtx = await AuthStorage.getLanguageContext(String(user.id));
      setNativeCode(savedCtx?.nativeLanguage ?? null);
      setShowTargetPicker(true);
    } catch (e) {
      CrashlyticsHelper.recordError(e as Error, 'PathChoice.handleLearning');
    }
  };

  const handleTargetPicked = (lang: Language) => {
    if (nativeCode && lang.code === nativeCode) {
      Toast.show(t('language_selection_same_language_toast'), Toast.SHORT);
      return;
    }
    setTarget(lang);
    setShowTargetPicker(false);
    setShowTargetConfirm(true);
  };

  const handleConfirmTarget = async () => {
    if (!target) return;
    setLoading(true);

    try {
      const token = await AuthStorage.getToken();
      let learningToPass: Learning | null | undefined = existingLearning;

      if (token && nativeCode) {
        const response = await fetch(LEARNING_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nativeLanguage: nativeCode,
            targetLanguage: target.code,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.learning) learningToPass = data.learning as Learning;
          await AuthStorage.saveLanguageContext(nativeCode, target.code, String(user.id));
        }
      }

      setShowTargetConfirm(false);
      navigateToNameOrGoal(learningToPass);
    } catch (e) {
      CrashlyticsHelper.recordError(e as Error, 'PathChoice.handleConfirmTarget');
      setShowTargetConfirm(false);
      navigateToNameOrGoal(existingLearning);
    } finally {
      setLoading(false);
    }
  };

  // Name is already known for a returning user — skip straight to the goal step.
  // (iOS routes to a separate LearningGoal screen here; Android's UserNameCapture
  // is the same consolidated wizard for all three steps, so initialStep:2 is the
  // equivalent "skip past name entry".)
  const navigateToNameOrGoal = (learningToPass: Learning | null | undefined) => {
    navigation.navigate('UserNameCapture', {
      user,
      existingLearning: learningToPass,
      initialStep: user.name ? 2 : 1,
      pathChoice: 'learn',
    });
  };

  const handleChat = async () => {
    try {
      await AuthStorage.saveUserPath(String(user.id), 'chat');
      navigation.navigate('UserNameCapture', {
        user,
        existingLearning,
        initialStep: 1,
        pathChoice: 'chat',
      });
    } catch (e) {
      CrashlyticsHelper.recordError(e as Error, 'PathChoice.handleChat');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#080C16" translucent={false} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>

          {/* Header: back button + progress bar on same row */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <View style={styles.progressBar}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryLight]}
                style={styles.progressFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
            </View>
          </View>

          <View style={styles.inner}>
            <Text style={styles.stepHint}>{t('path_choice_step_hint')}</Text>

            {/* Title */}
            <Text style={styles.title}>{t('path_choice_title')}</Text>
            <Text style={styles.subtitle}>{t('path_choice_subtitle')}</Text>

          {/* Cards */}
          <View style={styles.cards}>

            {/* Learning card */}
            <Animated.View style={{ transform: [{ translateY: slide1 }] }}>
              <TouchableOpacity
                style={styles.card}
                onPress={handleLearning}
                activeOpacity={0.82}
                disabled={loading}
              >
                <View style={[styles.cardIconBox, styles.cardIconBoxLearn]}>
                  {loading
                    ? <ActivityIndicator size="small" color={COLORS.primary} />
                    : <Ionicons name="school" size={26} color={COLORS.primary} />
                  }
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{t('path_choice_learn_title')}</Text>
                  <Text style={styles.cardDesc}>{t('path_choice_learn_desc')}</Text>
                  {/* <Text style={styles.cardMeta}>{t('path_choice_learn_meta')}</Text> */}
                  <View style={styles.suggestions}>
                    {SUGGESTIONS.map(lang => (
                      <View key={lang.code} style={styles.chip}>
                        <Text style={styles.chipText}>{lang.flag}  {lang.name}</Text>
                      </View>
                    ))}
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{t('path_choice_more_chip')}</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </Animated.View>

            {/* 1:1 card — remotely gated by GET /api/app-settings.isCompanionFlow */}
            {isCompanionFlowEnabled && (
              <Animated.View style={{ transform: [{ translateY: slide2 }] }}>
                <TouchableOpacity
                  style={styles.card}
                  onPress={handleChat}
                  activeOpacity={0.82}
                  disabled={loading}
                >
                  <View style={[styles.cardIconBox, styles.cardIconBoxChat]}>
                    <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.primaryLight} />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle}>{t('path_choice_chat_title')}</Text>
                      <View style={styles.newBadge}>
                        <Text style={styles.newBadgeText}>{t('path_choice_chat_badge_new')}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardDesc}>{t('path_choice_chat_desc')}</Text>
                    <Text style={styles.cardMeta}>{t('path_choice_chat_meta')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            )}

          </View>
          </View>
        </Animated.View>
      </SafeAreaView>

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
        ctaLoading={loading}
        onBack={() => {
          setShowTargetConfirm(false);
          setShowTargetPicker(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080C16' },
  safeArea:  { flex: 1 },

  // Header row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    width: '33%',
    height: 4,
    borderRadius: 2,
  },

  inner: {
    flex: 1,
    paddingHorizontal: 22,
  },
  stepHint: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    marginBottom: 28,
    letterSpacing: 0.4,
  },

  // Title
  title: {
    fontSize: 30,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    lineHeight: 40,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    lineHeight: 21,
    marginBottom: 32,
  },

  // Cards
  cards: { gap: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1422',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
  },
  cardIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    flexShrink: 0,
  },
  cardIconBoxLearn: {
    backgroundColor: 'rgba(255,91,46,0.12)',
  },
  cardIconBoxChat: {
    backgroundColor: 'rgba(255,91,46,0.08)',
  },
  cardBody: { flex: 1 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  cardDesc: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: 2,
    lineHeight: 19,
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
  },
  newBadge: {
    marginLeft: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: '#fff',
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    backgroundColor: 'rgba(255,91,46,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,91,46,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.75)',
  },
});
