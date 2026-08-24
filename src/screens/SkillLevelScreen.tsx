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
import { SKILL_OPTIONS, SKILL_ICONS } from '../constants/onboardingOptions';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { OnboardingSkillLevel } from '../types';
import { OnboardingProgressBar, VoiceoverAvatar } from '../components';
import { useResolvedNativeLanguage, useLocalizedOnboardingLabels, useOnboardingClips, useVoiceoverPlayback, useFinalizeOnboarding } from '../hooks';

type Props = NativeStackScreenProps<RootStackParamList, 'SkillLevel'>;

export function SkillLevelScreen({ navigation, route }: Props) {
  const { user, existingLearning, name, age, goal, goalLabel } = route.params;
  const { t } = useI18n();

  const targetLanguageName =
    LANGUAGES.find(l => l.code === existingLearning?.target_language)?.name ?? 'English';

  const backendSkill = (existingLearning?.skill ?? null) as OnboardingSkillLevel | null;
  const validSkill =
    backendSkill && ['beginner', 'intermediate', 'advanced'].includes(backendSkill)
      ? backendSkill
      : null;

  const [skillLevel, setSkillLevel] = useState<OnboardingSkillLevel | null>(validSkill);
  const [isReady,    setIsReady]    = useState(false);

  const nativeLanguageCode = useResolvedNativeLanguage(String(user.id), existingLearning?.native_language);
  const { skillApiLabels } = useLocalizedOnboardingLabels(nativeLanguageCode);
  const onboardingAudio = useOnboardingClips(nativeLanguageCode);
  const { isPlaying, playSequence } = useVoiceoverPlayback();
  const { finalize, loading } = useFinalizeOnboarding(navigation);

  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => setIsReady(true), 350);
      return () => { clearTimeout(timer); setIsReady(false); };
    }, []),
  );

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const ctaPressAnim    = useRef(new Animated.Value(1)).current;
  const skillScaleAnims = useRef(SKILL_OPTIONS.map(() => new Animated.Value(1))).current;

  const onCtaPressIn  = () =>
    Animated.spring(ctaPressAnim, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onCtaPressOut = () =>
    Animated.spring(ctaPressAnim, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  const animateCardSelect = (idx: number) => {
    Animated.sequence([
      Animated.timing(skillScaleAnims[idx], { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(skillScaleAnims[idx], { toValue: 1, speed: 20, bounciness: 8, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const playSkillAudio = () => {
    const clip = onboardingAudio.skill;
    if (clip) playSequence([clip.url]);
  };

  useEffect(() => {
    playSkillAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingAudio]);

  const hasAudioForStep = Boolean(onboardingAudio.skill);

  const handleCtaPress = () => {
    if (!skillLevel) return;
    const selectedSkillOption = SKILL_OPTIONS.find(o => o.key === skillLevel);
    const skillLabel =
      skillApiLabels[skillLevel] ||
      (selectedSkillOption ? t(selectedSkillOption.labelKey) : skillLevel);
    const skillDescription = selectedSkillOption ? t(selectedSkillOption.subtitleKey) : undefined;

    void finalize({
      user,
      existingLearning,
      name,
      age,
      isYoungKid: false,
      goal,
      skillLevel,
      goalLabel,
      skillLabel,
      skillDescription,
    });
  };

  const ctaDisabled = !isReady || loading || !skillLevel;

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
            <OnboardingProgressBar step={4} totalSteps={4} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <View style={styles.stepContent}>
                <VoiceoverAvatar visible={hasAudioForStep} isPlaying={isPlaying} onReplay={playSkillAudio} />
                <Text style={styles.stepTitle}>
                  {t('username_skill_level_title_with_language', { language: targetLanguageName })}
                </Text>
                <Text style={styles.stepSubtitle}>{t('username_skill_level_subtitle')}</Text>

                {SKILL_OPTIONS.map((option, idx) => {
                  const isSelected = skillLevel === option.key;
                  const barFill    = idx + 1;
                  return (
                    <Animated.View
                      key={option.key}
                      style={[
                        { transform: [{ scale: skillScaleAnims[idx] }], marginBottom: 14 },
                        isSelected && styles.skillCardWrapSelected,
                      ]}
                    >
                      <TouchableOpacity
                        style={[styles.skillCard, isSelected && styles.skillCardSelected]}
                        onPress={() => {
                          animateCardSelect(idx);
                          setSkillLevel(option.key);
                        }}
                        activeOpacity={0.85}
                      >
                        {isSelected && (
                          <View style={[StyleSheet.absoluteFillObject, styles.cardGlow]} />
                        )}
                        <View style={[styles.skillIconCircle, isSelected && styles.iconCircleActive]}>
                          <Ionicons
                            name={SKILL_ICONS[idx]}
                            size={24}
                            color={isSelected ? '#fff' : COLORS.textSecondary}
                          />
                        </View>
                        <View style={styles.skillBody}>
                          <Text style={[styles.skillTitle, isSelected && styles.skillTitleSelected]}>
                            {t(option.positiveLabelKey)}
                          </Text>
                          <Text style={[styles.skillSubtitle, isSelected && styles.skillSubtitleSelected]}>
                            {t(option.cardSubtitleKey)}
                          </Text>
                          <View style={styles.barsRow}>
                            {[1, 2, 3].map(bar => (
                              <View
                                key={bar}
                                style={[
                                  styles.bar,
                                  bar <= barFill && (isSelected ? styles.barActive : styles.barFilled),
                                ]}
                              />
                            ))}
                          </View>
                        </View>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={COLORS.primary}
                            style={styles.skillCheck}
                          />
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>
          </ScrollView>

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
                  {loading ? t('username_saving_button') : t('username_continue_button')}
                </Text>
                {!loading && (
                  <View style={styles.ctaIconWrap}>
                    <Ionicons name="arrow-forward" size={18} color={ctaDisabled ? 'rgba(255,255,255,0.25)' : '#fff'} />
                  </View>
                )}
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

  // ── Skill Cards ─────────────────────────────────────────────────────────────
  skillCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0E172C',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 108,
  },
  skillCardSelected: {
    backgroundColor: 'rgba(255,91,46,0.08)',
    borderColor: COLORS.primary,
  },
  skillCardWrapSelected: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  skillIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#15202E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    flexShrink: 0,
  },
  skillBody: { flex: 1 },
  skillTitle: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: 5,
    lineHeight: 22,
  },
  skillTitleSelected: { color: '#FFFFFF' },
  skillSubtitle: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.99)',
    marginBottom: 12,
    lineHeight: 19,
  },
  skillSubtitleSelected: { color: 'rgba(255,255,255,0.88)' },
  barsRow: { flexDirection: 'row' },
  bar: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 5,
  },
  barFilled: { backgroundColor: 'rgba(255,255,255,0.24)' },
  barActive:  { backgroundColor: COLORS.primary },
  skillCheck: { marginLeft: 10, flexShrink: 0 },

  cardGlow: {
    backgroundColor: 'rgba(255,91,46,0.09)',
    borderRadius: 20,
  },
  iconCircleActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
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
