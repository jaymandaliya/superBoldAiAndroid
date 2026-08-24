import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS } from '../constants';
import { LANGUAGES } from '../constants/languages';
import { GOAL_OPTIONS } from '../constants/onboardingOptions';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { OnboardingGoal } from '../types';
import { OnboardingProgressBar, VoiceoverAvatar } from '../components';
import { useResolvedNativeLanguage, useLocalizedOnboardingLabels, useOnboardingClips, useVoiceoverPlayback } from '../hooks';

type Props = NativeStackScreenProps<RootStackParamList, 'LearningGoal'>;

export function LearningGoalScreen({ navigation, route }: Props) {
  const { user, existingLearning, name, age } = route.params;
  const { t } = useI18n();

  const targetLanguageName =
    LANGUAGES.find(l => l.code === existingLearning?.target_language)?.name ?? 'English';

  const backendGoal = (existingLearning?.learning_reason ?? null) as OnboardingGoal | null;
  const validGoal =
    backendGoal && ['travel', 'career', 'fluency', 'confidence'].includes(backendGoal)
      ? backendGoal
      : null;

  const [goal,     setGoal]     = useState<OnboardingGoal | null>(validGoal);
  const [isReady,  setIsReady]  = useState(false);

  const nativeLanguageCode = useResolvedNativeLanguage(String(user.id), existingLearning?.native_language);
  const { goalApiLabels } = useLocalizedOnboardingLabels(nativeLanguageCode);
  const onboardingAudio = useOnboardingClips(nativeLanguageCode);
  const { isPlaying, playSequence } = useVoiceoverPlayback();

  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => setIsReady(true), 350);
      return () => { clearTimeout(timer); setIsReady(false); };
    }, []),
  );

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const ctaPressAnim   = useRef(new Animated.Value(1)).current;
  const goalScaleAnims = useRef(GOAL_OPTIONS.map(() => new Animated.Value(1))).current;

  const onCtaPressIn  = () =>
    Animated.spring(ctaPressAnim, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onCtaPressOut = () =>
    Animated.spring(ctaPressAnim, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  const animateCardSelect = (idx: number) => {
    Animated.sequence([
      Animated.timing(goalScaleAnims[idx], { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(goalScaleAnims[idx], { toValue: 1, speed: 20, bounciness: 8, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const playGoalAudio = () => {
    const clip = onboardingAudio.reason;
    if (clip) playSequence([clip.url]);
  };

  useEffect(() => {
    playGoalAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingAudio]);

  const hasAudioForStep = Boolean(onboardingAudio.reason);

  const handleCtaPress = () => {
    if (!goal) return;
    const selectedGoalOption = GOAL_OPTIONS.find(o => o.key === goal);
    const goalLabel =
      goalApiLabels[goal] ||
      (selectedGoalOption ? t(selectedGoalOption.labelKey) : goal);

    navigation.navigate('SkillLevel', { user, existingLearning, name, age, goal, goalLabel });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#080C16" translucent={false} />

      <View style={styles.bgOrb1} pointerEvents="none" />
      <View style={styles.bgOrb2} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.keyboardView}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <OnboardingProgressBar step={3} totalSteps={4} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <View style={styles.stepContent}>
                <VoiceoverAvatar visible={hasAudioForStep} isPlaying={isPlaying} onReplay={playGoalAudio} />
                <Text style={styles.stepTitle}>
                  {t('username_why_learning_title', { language: targetLanguageName })}
                </Text>
                <Text style={styles.stepSubtitle}>{t('username_why_learning_subtitle')}</Text>

                <View style={styles.goalGrid}>
                  {GOAL_OPTIONS.map((option, gIdx) => {
                    const isSelected = goal === option.key;
                    return (
                      <Animated.View
                        key={option.key}
                        style={[
                          styles.goalCardWrap,
                          gIdx % 2 === 1 && styles.goalCardWrapRight,
                          { transform: [{ scale: goalScaleAnims[gIdx] }] },
                          isSelected && styles.goalCardWrapSelected,
                        ]}
                      >
                        <TouchableOpacity
                          style={[styles.goalCard, isSelected && styles.goalCardSelected]}
                          onPress={() => {
                            animateCardSelect(gIdx);
                            setGoal(option.key);
                          }}
                          activeOpacity={0.85}
                        >
                          {isSelected && (
                            <View style={[StyleSheet.absoluteFillObject, styles.cardGlow]} />
                          )}

                          {isSelected && (
                            <View style={styles.checkBadge}>
                              <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                            </View>
                          )}

                          <View style={[styles.goalIconWrapper, isSelected && styles.goalIconWrapperSelected]}>
                            <Ionicons
                              name={option.icon as any}
                              size={26}
                              color={isSelected ? '#fff' : 'rgba(255,255,255,0.80)'}
                            />
                          </View>

                          <Text
                            numberOfLines={2}
                            style={[styles.goalLabel, isSelected && styles.labelSelected]}
                          >
                            {option.englishTitle}
                          </Text>

                          {goalApiLabels[option.key] && goalApiLabels[option.key] !== option.englishTitle && (
                            <Text numberOfLines={2} style={styles.goalHinglish}>
                              {goalApiLabels[option.key]}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          <View style={styles.ctaFooter}>
            <Animated.View style={[styles.ctaButtonShadow, { transform: [{ scale: ctaPressAnim }] }]}>
              <TouchableOpacity
                onPress={handleCtaPress}
                onPressIn={onCtaPressIn}
                onPressOut={onCtaPressOut}
                disabled={!isReady || !goal}
                activeOpacity={1}
                style={styles.ctaButton}
              >
                <LinearGradient
                  colors={!goal ? ['#161D2E', '#161D2E'] : ['#FF5B2E', '#FF8A4C']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
                <Text style={[styles.ctaText, !goal && styles.ctaTextDisabled]}>
                  {t('username_next_choose_level_button')}
                </Text>
                <View style={styles.ctaIconWrap}>
                  <Ionicons name="arrow-forward" size={18} color={!goal ? 'rgba(255,255,255,0.25)' : '#fff'} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#080C16' },
  safeArea:     { flex: 1 },
  keyboardView: { flex: 1 },

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

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  stepContent:   { width: '100%' },

  stepTitle: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: 40,
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

  // ── Goal Grid ───────────────────────────────────────────────────────────────
  goalGrid:          { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  goalCardWrap:      { width: '50%', paddingHorizontal: 8, marginBottom: 14 },
  goalCardWrapRight: { paddingLeft: 8 },
  goalCardWrapSelected: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  goalCard: {
    backgroundColor: '#0D1422',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    height: 190,
  },
  goalCardSelected: {
    backgroundColor: 'rgba(255,91,46,0.08)',
    borderColor: COLORS.primary,
  },
  cardGlow: {
    backgroundColor: 'rgba(255,91,46,0.09)',
    borderRadius: 20,
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
  },
  goalIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  goalIconWrapperSelected: {
    backgroundColor: 'rgba(255,91,46,0.22)',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },

  goalLabel: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: 22,
    marginBottom: 4,
  },
  labelSelected: { color: '#FFFFFF' },

  goalHinglish: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    color: '#FF5B2E',
    marginBottom: 4,
    lineHeight: 18,
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
