import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  StatusBar,
  Easing,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-simple-toast';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, AUTH_URL, LEARNING_URL, BACKEND_URL, YOUR_COMPUTER_IP, CONNECTION_TIMEOUT } from '../constants';
import { LANGUAGES } from '../constants/languages';
import { CrashlyticsHelper, AuthStorage, NetworkHelper, hasPaidAccess } from '../helpers';
import { useI18n } from '../localization';
import { getLocalizedOnboardingOptions } from '../localization/onboardingTranslations';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { OnboardingGoal, OnboardingSkillLevel } from '../types';
import { VoiceoverAvatar } from '../components';
import { useOnboardingClips, useVoiceoverPlayback } from '../hooks';
import { OnboardingAudioKey } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_OPTIONS: Array<{
  key: OnboardingGoal;
  labelKey: string;
  subtitleKey: string;
  icon: string;
  englishTitle: string;
}> = [
  {
    key: 'career',
    labelKey: 'username_goal_career',
    subtitleKey: 'username_goal_career_subtitle',
    icon: 'briefcase',
    englishTitle: 'Job & Career',
  },
  {
    key: 'fluency',
    labelKey: 'username_goal_fluency',
    subtitleKey: 'username_goal_fluency_subtitle',
    icon: 'school',
    englishTitle: 'Studies & Exams',
  },
  {
    key: 'travel',
    labelKey: 'username_goal_travel',
    subtitleKey: 'username_goal_travel_subtitle',
    icon: 'airplane',
    englishTitle: 'Travel &\nAbroad',
  },
  {
    key: 'confidence',
    labelKey: 'username_goal_confidence',
    subtitleKey: 'username_goal_confidence_subtitle',
    icon: 'chatbubble-ellipses',
    englishTitle: 'Daily\nConfidence',
  },
  // {
  //   key: 'entertainment',
  //   labelKey: 'username_goal_entertainment',
  //   subtitleKey: 'username_goal_entertainment_subtitle',
  //   icon: 'phone-portrait',
  //   englishTitle: 'Entertainment',
  // },
  // {
  //   key: 'other',
  //   labelKey: 'username_goal_other',
  //   subtitleKey: 'username_goal_other_subtitle',
  //   icon: 'add-circle-outline',
  //   englishTitle: 'Other',
  // },
];

const SKILL_OPTIONS: Array<{
  key: OnboardingSkillLevel;
  labelKey: string;
  subtitleKey: string;
  positiveLabelKey: string;
  cardSubtitleKey: string;
}> = [
  {
    key: 'beginner',
    labelKey: 'username_skill_beginner_label',
    subtitleKey: 'username_skill_beginner_subtitle',
    positiveLabelKey: 'username_skill_beginner_positive_label',
    cardSubtitleKey: 'username_skill_beginner_card_subtitle',
  },
  {
    key: 'intermediate',
    labelKey: 'username_skill_intermediate_label',
    subtitleKey: 'username_skill_intermediate_subtitle',
    positiveLabelKey: 'username_skill_intermediate_positive_label',
    cardSubtitleKey: 'username_skill_intermediate_card_subtitle',
  },
  {
    key: 'advanced',
    labelKey: 'username_skill_advanced_label',
    subtitleKey: 'username_skill_advanced_subtitle',
    positiveLabelKey: 'username_skill_advanced_positive_label',
    cardSubtitleKey: 'username_skill_advanced_card_subtitle',
  },
];

const SKILL_ICONS = ['school-outline', 'trending-up-outline', 'trophy-outline'] as const;

// ─── Component ────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'UserNameCapture'>;

export function UserNameCaptureScreen({ navigation, route }: Props) {
  const { user, existingLearning, initialStep, pathChoice } = route.params;
  const isChatPath = pathChoice === 'chat';

  const { t, language } = useI18n();

  const targetLanguageName =
    LANGUAGES.find(l => l.code === existingLearning?.target_language)?.name ?? 'English';

  const backendGoal  = (existingLearning?.learning_reason ?? null) as OnboardingGoal | null;
  const backendSkill = (existingLearning?.skill ?? null) as OnboardingSkillLevel | null;
  const validGoal =
    backendGoal &&
    ['travel', 'career', 'fluency', 'confidence'].includes(backendGoal)
      ? backendGoal
      : null;
  const validSkill =
    backendSkill && ['beginner', 'intermediate', 'advanced'].includes(backendSkill)
      ? backendSkill
      : null;

  const [name,            setName]            = useState(user.name ?? '');
  const [age,             setAge]             = useState<number | null>(null);
  const [showAgePicker,   setShowAgePicker]   = useState(false);
  const ageDropdownRef = useRef<View>(null);

  const isYoungKid = age !== null && age < 13;
  const [goal,           setGoal]           = useState<OnboardingGoal | null>(validGoal);
  const [skillLevel,     setSkillLevel]     = useState<OnboardingSkillLevel | null>(validSkill);
  const [goalApiLabels,  setGoalApiLabels]  = useState<Partial<Record<OnboardingGoal, string>>>({});
  const [skillApiLabels, setSkillApiLabels] = useState<Partial<Record<OnboardingSkillLevel, string>>>({});
  const [loading,        setLoading]        = useState(false);
  const [activeStep,     setActiveStep]     = useState<number>(initialStep ?? 1);
  const [isReady,        setIsReady]        = useState(false);

  const nativeLanguageForAudio = language || existingLearning?.native_language || 'en';
  const onboardingAudio = useOnboardingClips(nativeLanguageForAudio);
  const { isPlaying, playSequence } = useVoiceoverPlayback();

  const playStepAudio = (step: number) => {
    const key: OnboardingAudioKey | null = step === 1 ? 'name' : step === 2 ? 'reason' : step === 3 ? 'skill' : null;
    const clip = key ? onboardingAudio[key] : undefined;
    if (clip) playSequence([clip.url]);
  };

  useEffect(() => {
    playStepAudio(activeStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, onboardingAudio]);

  // Prevent ghost touches from the previous screen firing the CTA
  useFocusEffect(
    React.useCallback(() => {
      const t = setTimeout(() => setIsReady(true), 350);
      return () => { clearTimeout(t); setIsReady(false); };
    }, []),
  );

  // ── Animations ──────────────────────────────────────────────────────────────

  const fadeAnim        = useRef(new Animated.Value(0)).current;
  const slideAnim       = useRef(new Animated.Value(30)).current;
  const inputBorderAnim = useRef(new Animated.Value(0)).current;

  const stepFade  = useRef(new Animated.Value(1)).current;
  const stepSlide = useRef(new Animated.Value(0)).current;

  const pulseAnim       = useRef(new Animated.Value(1)).current;
  const ctaPressAnim    = useRef(new Animated.Value(1)).current;
  const goalScaleAnims  = useRef(GOAL_OPTIONS.map(() => new Animated.Value(1))).current;
  const skillScaleAnims = useRef(SKILL_OPTIONS.map(() => new Animated.Value(1))).current;

  const runStepTransition = (next: number) => {
    Animated.parallel([
      Animated.timing(stepFade,  { toValue: 0,  duration: 140, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      Animated.timing(stepSlide, { toValue: 28, duration: 140, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
    ]).start(() => {
      setActiveStep(next);
      stepSlide.setValue(-28);
      Animated.parallel([
        Animated.timing(stepFade,  { toValue: 1, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(stepSlide, { toValue: 0, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]).start();
    });
  };

  const animateCardSelect = (anims: Animated.Value[], idx: number) => {
    Animated.sequence([
      Animated.timing(anims[idx], { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(anims[idx], { toValue: 1, speed: 20, bounciness: 8, useNativeDriver: true }),
    ]).start();
  };

  const onCtaPressIn  = () =>
    Animated.spring(ctaPressAnim, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onCtaPressOut = () =>
    Animated.spring(ctaPressAnim, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 6 }).start();


  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    const loadOnboardingProfile = async () => {
      const saved = await AuthStorage.getOnboardingProfile(String(user.id));
      if (!saved) return;
      setGoal(saved.goal);
      setSkillLevel(saved.skillLevel);
    };

    const loadLocalizedOnboardingOptions = async () => {
      const savedContext = await AuthStorage.getLanguageContext(String(user.id));
      // language (from i18n context) is the most up-to-date source — user just selected it.
      // Fall back to learning record or AsyncStorage only if i18n is still on the default 'en'.
      const nativeLanguageCode =
        language ||
        existingLearning?.native_language ||
        savedContext?.nativeLanguage ||
        'en';
      const options = getLocalizedOnboardingOptions(nativeLanguageCode);
      if (!options) return;

      const mappedGoals:  Partial<Record<OnboardingGoal, string>>        = {};
      const mappedSkills: Partial<Record<OnboardingSkillLevel, string>>  = {};
      GOAL_OPTIONS.forEach((item, i) => {
        if (options.learningReasons[i]) mappedGoals[item.key] = options.learningReasons[i].text;
      });
      SKILL_OPTIONS.forEach((item, i) => {
        if (options.currentSkillLevels[i]) mappedSkills[item.key] = options.currentSkillLevels[i].text;
      });
      setGoalApiLabels(mappedGoals);
      setSkillApiLabels(mappedSkills);
    };

    void loadOnboardingProfile();
    void loadLocalizedOnboardingOptions();
  }, [existingLearning?.native_language, user.id, language]);

  useEffect(() => {
    if (!name.trim()) { setActiveStep(1); return; }
    if (!isYoungKid && !goal && activeStep > 2) setActiveStep(2);
  }, [name, goal, age]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.22, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleFocus = () =>
    Animated.timing(inputBorderAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
  const handleBlur  = () =>
    Animated.timing(inputBorderAnim, { toValue: 0, duration: 280, useNativeDriver: false }).start();

  const animatedBorderColor = inputBorderAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(255,255,255,0.10)', COLORS.primary],
  });

  // ── Save logic ──────────────────────────────────────────────────────────────

  const handleSaveName = async () => {
    const trimmedName = name.trim();
    if (!trimmedName)                    { Toast.show(t('username_enter_name_toast'), Toast.SHORT); return; }
    if (trimmedName.length < 2)          { Toast.show(t('username_name_too_short_toast'), Toast.SHORT); return; }
    if (!isChatPath && age === null)     { Toast.show(t('username_select_age_toast'), Toast.SHORT); return; }
    if (!isYoungKid && !goal)           { Toast.show(t('username_choose_goal_toast'), Toast.SHORT); return; }
    if (!isYoungKid && !skillLevel)     { Toast.show(t('username_choose_level_toast'), Toast.SHORT); return; }

    const selectedGoalOption  = isYoungKid ? undefined : GOAL_OPTIONS.find(o => o.key === goal);
    const selectedSkillOption = isYoungKid ? undefined : SKILL_OPTIONS.find(o => o.key === skillLevel);
    const selectedGoalLabel   = isYoungKid ? undefined :
      (goal ? goalApiLabels[goal] : undefined) ||
      (selectedGoalOption ? t(selectedGoalOption.labelKey) : goal ?? undefined);
    const selectedSkillLabel = isYoungKid ? undefined :
      (skillLevel ? skillApiLabels[skillLevel] : undefined) ||
      (selectedSkillOption ? t(selectedSkillOption.labelKey) : skillLevel);
    const selectedSkillDescription = selectedSkillOption
      ? t(selectedSkillOption.subtitleKey)
      : undefined;

    setLoading(true);
    CrashlyticsHelper.log(`Saving user name: ${trimmedName}`);

    try {
      const token = await AuthStorage.getToken();

      const primaryPayload: Record<string, any> = { name: trimmedName };
      if (!isYoungKid) {
        primaryPayload.skill             = selectedSkillLabel;
        primaryPayload.skill_key         = skillLevel;
        primaryPayload.skill_description = selectedSkillDescription;
        if (selectedGoalLabel) {
          primaryPayload.learning_reason     = selectedGoalLabel;
          primaryPayload.learning_reason_key = goal;
        }
      }

      let response = await fetch(`${AUTH_URL}/update-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(primaryPayload),
      });

      if (!response.ok && (response.status === 400 || response.status === 422)) {
        response = await fetch(`${AUTH_URL}/update-profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: trimmedName, skill: skillLevel, learning_reason: goal }),
        });
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('username_save_failed_toast'));

      CrashlyticsHelper.setAttribute('user_name', trimmedName);

      if (!isYoungKid && skillLevel) {
        await AuthStorage.saveOnboardingProfile(String(user.id), {
          goal: goal ?? 'confidence',
          skillLevel,
          goalLabel: selectedGoalLabel,
          skillLabel: selectedSkillLabel ?? undefined,
          skillDescription: selectedSkillDescription,
          updatedAt: new Date().toISOString(),
        });
      }

      if (data.token) await AuthStorage.saveToken(data.token);

      const activeToken = data.token ?? token;
      if (existingLearning?.id) {
        try {
          const learningPayload: Record<string, any> = {
            ...(age !== null ? { age } : {}),
            ...(!isYoungKid && skillLevel ? { skill: skillLevel } : {}),
            ...(!isYoungKid && goal       ? { learning_reason: goal } : {}),
          };
          console.log('[updateLearning] request payload:', learningPayload);
          const learningRes = await fetch(`${LEARNING_URL}/${existingLearning.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
            body: JSON.stringify(learningPayload),
          });
          const learningData = await learningRes.json();
          console.log('[updateLearning] status:', learningRes.status, 'response:', learningData);
        } catch (e) {
          console.log('[updateLearning] error:', e);
          CrashlyticsHelper.recordError(e as Error, 'updateLearningSkillReason');
        }
      }

      if (age !== null) await AuthStorage.saveUserAge(String(user.id), age);
      await AuthStorage.saveUserPath(String(user.id), 'learn');
      Toast.show(t('username_saved_toast'), Toast.SHORT);

      const updatedUser = { ...user, name: trimmedName };

      // Paywall is the last step of onboarding — shown here, once profile setup
      // is actually complete, not mid-flow. Paid users fall through to the exact
      // same room-connect/MainTabs logic as before (matches iOS's useFinalizeOnboarding).
      if (!isChatPath && !hasPaidAccess(existingLearning)) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Paywall', params: { user: updatedUser, existingLearning, name: trimmedName, nextStep: 'LanguageSelection' } }],
        });
        return;
      }

      // Try to connect directly to room if we have a full learning record
      if (existingLearning?.id && existingLearning.native_language && existingLearning.target_language) {
        try {
          const isOnline = await NetworkHelper.checkConnection();
          if (isOnline) {
            const nativeLang = LANGUAGES.find(l => l.code === existingLearning.native_language);
            const targetLang = LANGUAGES.find(l => l.code === existingLearning.target_language);
            const roomToken = await AuthStorage.getToken();
            const onboardingCtx = await AuthStorage.getOnboardingProfile(String(user.id));

            if (roomToken) {
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), CONNECTION_TIMEOUT)
              );
              const res = await Promise.race([
                fetch(BACKEND_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    roomName: `language-learning-room${Date.now()}`,
                    participantName: updatedUser.phone_number || 'User_' + Date.now(),
                    nativeLanguage: existingLearning.native_language,
                    targetLanguage: existingLearning.target_language,
                    nativeLanguageName: nativeLang?.name || '',
                    targetLanguageName: targetLang?.name || '',
                    currentLevel: existingLearning.current_level ?? 0,
                    learningId: String(existingLearning.id),
                    userName: trimmedName,
                    authToken: roomToken,
                    isPremium: existingLearning.is_premium || false,
                  }),
                }),
                timeoutPromise,
              ]);

              let roomData: any = {};
              try { roomData = await res.json(); } catch { /* ignore */ }

              if (res.ok && roomData.url) {
                const roomUrl = roomData.url.includes('localhost')
                  ? roomData.url.replace('localhost', YOUR_COMPUTER_IP)
                  : roomData.url;

                navigation.reset({
                  index: 1,
                  routes: [
                    { name: 'MainTabs', params: { user: updatedUser, existingLearning } },
                    { name: 'Room', params: { user: updatedUser, learning: existingLearning, token: roomData.token, url: roomUrl, onboardingContext: onboardingCtx } },
                  ],
                });
                return;
              }
            }
          }
        } catch (e) {
          CrashlyticsHelper.recordError(e as Error, 'UserNameCapture.connectToRoom');
        }
      }

      // Fallback: go to home dashboard
      navigation.replace('MainTabs', { user: updatedUser, existingLearning });
    } catch (error: any) {
      CrashlyticsHelper.recordError(error as Error, 'handleSaveName');
      Toast.show(error.message || t('username_save_failed_toast'), Toast.LONG);
    } finally {
      setLoading(false);
    }
  };

  // ── Chat-path: save name only, then open TalkingSession ────────────────────

  const handleSaveChatPath = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      Toast.show(t('username_name_too_short_toast'), Toast.SHORT);
      return;
    }
    setLoading(true);
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
      setLoading(false);
    }
  };

  // ── CTA state ───────────────────────────────────────────────────────────────

  const highestUnlockedStep = (isChatPath || isYoungKid) ? 1 : (!name.trim() ? 1 : (!goal ? 2 : 3));

  const ctaDisabled = !isReady || (
    isChatPath
      ? name.trim().length < 2 || loading
      : isYoungKid
      ? name.trim().length < 2 || age === null || loading
      : activeStep === 1 ? (name.trim().length < 2 || age === null)
      : activeStep === 2 ? !goal
      : loading || !name.trim() || !goal || !skillLevel
  );

  const ctaLabel = loading
    ? t('username_saving_button')
    : (isChatPath || isYoungKid)
    ? t('username_continue_button')
    : activeStep === 1 ? t('username_next_choose_goal_button')
    : activeStep === 2 ? t('username_next_choose_level_button')
    : t('username_continue_button');

  const handleCtaPress = () => {
    if (isChatPath)            void handleSaveChatPath();
    else if (isYoungKid)       void handleSaveName();
    else if (activeStep === 1) runStepTransition(2);
    else if (activeStep === 2) runStepTransition(3);
    else                       void handleSaveName();
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
          {/* ── Back Button ───────────────────────────────────────────────── */}
          <View style={styles.headerBackWrap}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={() => {
                if (activeStep > 1) runStepTransition(activeStep - 1);
                else navigation.goBack();
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* ── Step Indicator ────────────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.stepIndicatorRow,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {(isYoungKid ? [1] as const : [1, 2, 3] as const).map((step, idx) => (
              <React.Fragment key={step}>
                <TouchableOpacity
                  onPress={() => { if (step <= highestUnlockedStep) runStepTransition(step); }}
                  activeOpacity={0.75}
                  style={styles.stepNode}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {activeStep === step && (
                    <Animated.View
                      style={[
                        styles.stepPulseRing,
                        {
                          transform: [{ scale: pulseAnim }],
                          opacity: pulseAnim.interpolate({
                            inputRange:  [1, 1.22],
                            outputRange: [0.55, 0],
                          }),
                        },
                      ]}
                      pointerEvents="none"
                    />
                  )}
                  <View
                    style={[
                      styles.stepCircle,
                      activeStep > step   && styles.stepCircleDone,
                      activeStep === step && styles.stepCircleActive,
                    ]}
                  >
                    {activeStep > step ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : (
                      <Text style={[styles.stepNum, activeStep === step && styles.stepNumActive]}>
                        {step}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.stepLabel, activeStep >= step && styles.stepLabelActive]}>
                    {step === 1
                      ? t('username_step_label_name')
                      : step === 2
                      ? t('username_step_label_goal')
                      : t('username_step_label_level')}
                  </Text>
                </TouchableOpacity>

                {idx < 2 && (
                  <View style={styles.stepLineWrap}>
                    {activeStep > step ? (
                      <LinearGradient
                        colors={['#FF5B2E', '#FF8A4C']}
                        style={StyleSheet.absoluteFillObject}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                    ) : null}
                  </View>
                )}
              </React.Fragment>
            ))}
          </Animated.View>

          <View style={styles.stepProgressRow}>
            {(isYoungKid ? [1] : [1, 2, 3]).map(segment => (
              <View
                key={segment}
                style={[
                  styles.stepProgressSegment,
                  activeStep >= segment && styles.stepProgressSegmentActive,
                ]}
              />
            ))}
          </View>

          {/* Step counter pill */}
          <Animated.View style={[styles.stepPill, { opacity: fadeAnim }]}>
            <Text style={styles.stepPillText}>{'Step '}{activeStep}{' of '}{isYoungKid ? 1 : 3}</Text>
          </Animated.View>

          {/* ── Scrollable Content ─────────────────────────────────────────── */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Animated.View style={{ opacity: stepFade, transform: [{ translateY: stepSlide }] }}>

              {/* ══ STEP 1 — Name ════════════════════════════════════════════ */}
              {activeStep === 1 && (
                <View style={styles.stepContent}>
                  <VoiceoverAvatar
                    visible={Boolean(onboardingAudio.name)}
                    isPlaying={isPlaying}
                    onReplay={() => playStepAudio(1)}
                  />

                  <Text style={styles.eyebrow}>{t('username_eyebrow')}</Text>
                  <Text style={styles.stepTitle}>{t('username_name_card_title')}</Text>
                  <Text style={styles.stepSubtitle}>{t('username_name_subtitle')}</Text>

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
                      editable={!loading}
                    />
                    {name.trim().length >= 2 && (
                      <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                    )}
                  </Animated.View>

                  {/* Age dropdown + picker — hidden for 1:1 path (collected when adding a language) */}
                  {!isChatPath && (
                    <>
                      <View style={styles.ageGroupSection}>
                        <Text style={styles.ageGroupLabel}>{t('username_age_label')}</Text>
                        <View ref={ageDropdownRef}>
                          <TouchableOpacity
                            style={[styles.ageDropdownBtn, age !== null && styles.ageDropdownBtnActive]}
                            onPress={() => {
                              Keyboard.dismiss();
                              setShowAgePicker(true);
                            }}
                            activeOpacity={0.82}
                          >
                            <Ionicons name="person-outline" size={16} color={age !== null ? COLORS.primary : COLORS.textDim} />
                            <Text style={[styles.ageDropdownText, age === null && styles.ageDropdownPlaceholder]}>
                              {age !== null ? t('username_age_value', { age: String(age) }) : t('username_age_placeholder')}
                            </Text>
                            <Ionicons name="chevron-down" size={15} color={COLORS.textDim} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Modal
                        visible={showAgePicker}
                        transparent
                        animationType="none"
                        onRequestClose={() => setShowAgePicker(false)}
                      >
                        <Pressable
                          style={styles.ageModalOverlay}
                          onPress={() => setShowAgePicker(false)}
                        >
                          <Pressable style={styles.ageModalSheet} onPress={() => {}}>
                            {/* Handle */}
                            <View style={styles.ageSheetHandle} />
                            {/* Title */}
                            <Text style={styles.ageSheetTitle}>{t('username_age_label')}</Text>
                            <FlatList
                              data={Array.from({ length: 77 }, (_, i) => i + 4)}
                              keyExtractor={item => String(item)}
                              showsVerticalScrollIndicator={false}
                              style={styles.ageModalList}
                              getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
                              renderItem={({ item }) => {
                                const sel = age === item;
                                return (
                                  <Pressable
                                    style={[styles.ageModalItem, sel ? styles.ageModalItemSelected : undefined]}
                                    onPress={() => { setAge(item); setShowAgePicker(false); }}
                                  >
                                    <Text style={[styles.ageModalItemText, sel ? styles.ageModalItemTextSelected : undefined]}>
                                      {item}
                                    </Text>
                                    {sel && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                                  </Pressable>
                                );
                              }}
                            />
                          </Pressable>
                        </Pressable>
                      </Modal>
                    </>
                  )}

                  {/* Social proof */}
                  <View style={styles.socialProofRow}>
                    <View style={styles.socialDot} />
                    <Text style={styles.socialProofText}>{t('username_social_proof')}</Text>
                  </View>
                </View>
              )}

              {/* ══ STEP 2 — Goal ════════════════════════════════════════════ */}
              {activeStep === 2 && (
                <View style={styles.stepContent}>
                  <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => runStepTransition(1)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back-circle" size={26} color={COLORS.text} />
                    <Text style={styles.backBtnText}>{t('username_step_label_name')}</Text>
                  </TouchableOpacity>

                  <VoiceoverAvatar
                    visible={Boolean(onboardingAudio.reason)}
                    isPlaying={isPlaying}
                    onReplay={() => playStepAudio(2)}
                  />

                  <Text style={styles.stepTitle}>{t('username_why_learning_title', { language: targetLanguageName })}</Text>
                  <Text style={styles.stepSubtitle}>{t('username_why_learning_subtitle')}</Text>

                  <View style={styles.goalGrid}>
                    {GOAL_OPTIONS.map((option, gIdx) => {
                      const isSelected = goal === option.key;
                      const isOther    = (option.key as string) === 'other';
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
                            style={[
                              styles.goalCard,
                              isSelected && styles.goalCardSelected,
                              isOther    && styles.goalCardOther,
                            ]}
                            onPress={() => {
                              animateCardSelect(goalScaleAnims, gIdx);
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

                            {/* Icon */}
                            <View
                              style={[
                                styles.goalIconWrapper,
                                isSelected && styles.goalIconWrapperSelected,
                                isOther    && styles.goalIconWrapperOther,
                              ]}
                            >
                              <Ionicons
                                name={option.icon as any}
                                size={26}
                                color={
                                  isOther
                                    ? 'rgba(255,255,255,0.28)'
                                    : isSelected
                                    ? '#fff'
                                    : 'rgba(255,255,255,0.80)'
                                }
                              />
                            </View>

                            {/* English title */}
                            <Text
                              numberOfLines={2}
                              style={[
                                styles.goalLabel,
                                isSelected && styles.labelSelected,
                                isOther    && styles.goalLabelOther,
                              ]}
                            >
                              {option.englishTitle}
                            </Text>

                            {/* Orange sublabel — shown only when native label differs from English title */}
                            {!isOther && goalApiLabels[option.key] && goalApiLabels[option.key] !== option.englishTitle && (
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
              )}

              {/* ══ STEP 3 — Skill Level ═════════════════════════════════════ */}
              {activeStep === 3 && (
                <View style={styles.stepContent}>
                  <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => runStepTransition(2)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back-circle" size={26} color={COLORS.text} />
                    <Text style={styles.backBtnText}>
                      {t('username_step_label_goal')}
                    </Text>
                  </TouchableOpacity>

                  <VoiceoverAvatar
                    visible={Boolean(onboardingAudio.skill)}
                    isPlaying={isPlaying}
                    onReplay={() => playStepAudio(3)}
                  />

                  <Text style={styles.stepTitle}>{t('username_skill_level_title_with_language', { language: targetLanguageName })}</Text>
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
                            animateCardSelect(skillScaleAnims, idx);
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
                            <Text
                              style={[styles.skillSubtitle, isSelected && styles.skillSubtitleSelected]}
                            >
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
              )}

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
                {!(activeStep === 3 && loading) && (
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

  // ── Step Indicator ──────────────────────────────────────────────────────────
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 28,
    paddingTop: 10,
    paddingBottom: 2,
  },
  stepNode: {
    alignItems: 'center',
    position: 'relative',
  },
  stepPulseRing: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
    top: -10,
    left: -10,
  },
  stepCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#131B2E',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 7,
  },
  stepCircleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryLight,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  stepCircleDone: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  stepNum: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: 'rgba(255,255,255,0.50)',
  },
  stepNumActive: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: '#fff',
  },
  stepLabel: {
    fontSize: 10,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 0.4,
  },
  stepLabelActive: {
    color: COLORS.primaryLight,
  },
  stepLineWrap: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    marginTop: 18,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
  },
  stepPill: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  stepPillText: {
    fontSize: 10,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.6,
  },
  stepProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 28,
    marginTop: 4,
    marginBottom: 8,
  },
  stepProgressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 4,
  },
  stepProgressSegmentActive: {
    backgroundColor: COLORS.primary,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 16 },
  stepContent:   { width: '100%' },

  // ── Hero (Step 1) ───────────────────────────────────────────────────────────
  heroSection: {
    alignSelf: 'center',
    width: 130,
    height: 130,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 6,
    position: 'relative',
  },
  heroRing3: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,91,46,0.07)',
  },
  heroRing2: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,91,46,0.11)',
  },
  heroRing1: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(255,91,46,0.16)',
  },
  heroCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF5B2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  heroAIBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#10192A',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAIBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    letterSpacing: 0.4,
  },

  // ── Typography ──────────────────────────────────────────────────────────────
  eyebrow: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'left',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'left',
    marginBottom: 8,
    lineHeight: 40,
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

  // ── Header Back Button (circle, top of screen) ──────────────────────────────
  headerBackWrap: {
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

  // ── Back Button (pill, inside step content for steps 2 & 3) ─────────────────
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backBtnText: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
    marginLeft: 8,
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
  goalCardOther: {
    backgroundColor: '#090E1A',
    borderColor: 'rgba(255,255,255,0.05)',
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
  goalIconWrapperOther: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  iconCircleActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // Goal text
  goalLabel: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: 22,
    marginBottom: 4,
  },
  labelSelected:  { color: '#FFFFFF' },
  goalLabelOther: { color: 'rgba(255,255,255,0.45)' },

  goalHinglish: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    color: '#FF5B2E',
    marginBottom: 4,
    lineHeight: 18,
  },

  goalSub: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'left',
    lineHeight: 18,
  },
  goalSubSelected: { color: 'rgba(255,255,255,0.88)' },
  goalSubOther:    { color: 'rgba(255,255,255,0.35)' },

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
  skillTitleSelected:    { color: '#FFFFFF' },
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

  // ── Age dropdown ─────────────────────────────────────────────────────────
  ageGroupSection: {
    marginTop: 20,
    marginBottom: 4,
  },
  ageGroupLabel: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  ageDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  ageDropdownBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(255,91,46,0.06)',
  },
  ageDropdownText: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  ageDropdownPlaceholder: {
    color: COLORS.textDim,
  },
  ageKidNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  ageKidNoteText: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    color: COLORS.primary,
  },
  ageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  ageModalSheet: {
    backgroundColor: '#1A1D26',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingBottom: 28,
    elevation: 24,
  },
  ageSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  ageSheetTitle: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  ageModalList: {
    maxHeight: 260,
  },
  ageModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  ageModalItemSelected: {
    backgroundColor: 'rgba(255,91,46,0.10)',
  },
  ageModalItemText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },
  ageModalItemTextSelected: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
    fontSize: 16,
  },

  ctaIconWrap: {
    marginLeft: 10,
    zIndex: 1,
  },
});