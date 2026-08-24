import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Linking,
  StyleSheet,
  Dimensions,
  ScrollView,
  FlatList,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-simple-toast';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { subscribeYearlyPremium, fetchAppSettings } from '../services';
import { fetchCashfreeSubscriptionStatus } from '../payment/cashfreeSubscriptionService';
import { usePayUCheckout, getPayUBizSdk } from '../payment/usePayUCheckout';
import { buildSubscriptionYearlyCheckoutParams } from '../payment/payuParams';
import { PAYU_SUBSCRIPTION_PRODUCT } from '../payment/payuConfig';

const PayUBizSdk = getPayUBizSdk();
import {
  COLORS,
  FONTS,
  LEARNING_URL,
  AUTH_URL,
  SUPPORT_EMAIL,
  BACKEND_URL,
  YOUR_COMPUTER_IP,
  MAX_RETRIES,
  RETRY_DELAY_BASE,
  CONNECTION_TIMEOUT,
} from '../constants';
import {
  GRADIENT_TAB_TOP_BAR,
  GRADIENT_TAB_BODY_PADDING_TOP,
} from '../constants/screenHeader';
import { LANGUAGES } from '../constants/languages';
import { CrashlyticsHelper, NetworkHelper, AuthStorage } from '../helpers';
import { LanguageSelector } from '../components';
import { Language, Learning, UserPath, OnboardingSkillLevel, OnboardingGoal } from '../types';
import { useI18n } from '../localization';
import { getLocalizedOnboardingOptions } from '../localization/onboardingTranslations';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const TARGET_LANGUAGE_CODES = ['en', 'de', 'fr', 'es', 'nl', 'sv', 'hi', 'zh', 'ja', 'ko'];
const NATIVE_LANGUAGE_CODES = [
  'hi', 'gu', 'mr', 'bn', 'ta', 'te', 'en', 'kn', 'ml', 'pa', 'ur',
  // Europe
  'de', 'fr', 'ru', 'pt', 'it', 'pl', 'uk', 'tr',
  // Asia
  'zh', 'ja', 'ko', 'ar', 'id', 'vi', 'th',
];
const TARGET_LANGUAGES = TARGET_LANGUAGE_CODES
  .map((code) => LANGUAGES.find((lang) => lang.code === code))
  .filter((lang): lang is Language => Boolean(lang));
const NATIVE_LANGUAGES = NATIVE_LANGUAGE_CODES
  .map((code) => LANGUAGES.find((lang) => lang.code === code))
  .filter((lang): lang is Language => Boolean(lang));
const TOTAL_LEVELS = 30;
const COMPLETED_LEVEL_MARKER = TOTAL_LEVELS + 1;
const COMPLETION_TOAST_MESSAGE = 'You have completed 30 levels. You can check history.';

const formatPracticeTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m` : '<1m';
};

const formatLastSession = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff}d ago`;
};

const isCourseCompleted = (learning: Learning | null | undefined) => {
  return (learning?.current_level ?? 0) >= COMPLETED_LEVEL_MARKER;
};

const getDisplayLevel = (level: number) => {
  return Math.min(Math.max(level, 1), TOTAL_LEVELS);
};

const getCompletedPercentage = (level: number) => {
  const completedLevels = Math.max(0, level - 1);
  return Math.round((completedLevels / TOTAL_LEVELS) * 100);
};

// Safe StatusBar height with fallback
const ANDROID_STATUS_BAR_HEIGHT = Platform.OS === 'android'
  ? (StatusBar.currentHeight || 24)
  : 0;

// ── Tier helpers ─────────────────────────────────────────────────────────────

const TIER_NAMES: Record<string, string> = {
  levels_1_5: 'Beginner Pack',
  levels_6_10: 'Foundation Pack',
  levels_11_15: 'Intermediate Pack',
  levels_16_20: 'Advanced Pack',
  levels_21_25: 'Expert Pack',
  levels_26_30: 'Master Pack',
};

const TIER_LEVEL_RANGES: Record<string, string> = {
  levels_1_5: '1-5',
  levels_6_10: '6-10',
  levels_11_15: '11-15',
  levels_16_20: '16-20',
  levels_21_25: '21-25',
  levels_26_30: '26-30',
};

const TIER_KEYS = Object.keys(TIER_NAMES);

/** Returns true if the user has any paid access (full bundle OR any tier). */
const hasPaidAccess = (learning: Learning | undefined | null): boolean => {
  if (!learning) return false;
  return learning.is_premium || (Array.isArray(learning.purchased_tiers) && learning.purchased_tiers.length > 0);
};

/** Returns the tier key that covers the given level (1-based). */
const tierKeyForLevel = (level: number): string => {
  const idx = Math.min(Math.floor((level - 1) / 5), TIER_KEYS.length - 1);
  return TIER_KEYS[idx];
};

/**
 * Returns a human-readable plan label for the badge.
 * - Full bundle  → "👑 Full Course"
 * - Tier user    → "🎯 <TierName>" of the tier that covers the current level,
 *                  falling back to the latest purchased tier.
 */
const getPlanLabel = (learning: Learning): string => {
  if (learning.is_premium) return '👑 Full Course';

  const purchased = learning.purchased_tiers || [];
  const currentTierKey = tierKeyForLevel(learning.current_level);

  if (purchased.includes(currentTierKey)) {
    return `🎯 Level ${TIER_LEVEL_RANGES[currentTierKey] ?? ''}`;
  }

  const lastPurchased = [...purchased].reverse().find(t => TIER_LEVEL_RANGES[t]);
  return lastPurchased ? `🎯 Level ${TIER_LEVEL_RANGES[lastPurchased]}` : '🎯 Active Pack';
};

// ─────────────────────────────────────────────────────────────────────────────

const ADD_LANG_SKILL_OPTIONS: Array<{
  key: OnboardingSkillLevel;
  labelKey: string;
  subtitleKey: string;
  positiveLabelKey: string;
  cardSubtitleKey: string;
  icon: string;
}> = [
  { key: 'beginner',     labelKey: 'username_skill_beginner_label',     subtitleKey: 'username_skill_beginner_subtitle',     positiveLabelKey: 'username_skill_beginner_positive_label',     cardSubtitleKey: 'username_skill_beginner_card_subtitle',     icon: 'school-outline' },
  { key: 'intermediate', labelKey: 'username_skill_intermediate_label', subtitleKey: 'username_skill_intermediate_subtitle', positiveLabelKey: 'username_skill_intermediate_positive_label', cardSubtitleKey: 'username_skill_intermediate_card_subtitle', icon: 'trending-up-outline' },
  { key: 'advanced',     labelKey: 'username_skill_advanced_label',     subtitleKey: 'username_skill_advanced_subtitle',     positiveLabelKey: 'username_skill_advanced_positive_label',     cardSubtitleKey: 'username_skill_advanced_card_subtitle',     icon: 'trophy-outline' },
];

const ADD_LANG_GOAL_OPTIONS: Array<{
  key: OnboardingGoal;
  labelKey: string;
  subtitleKey: string;
  icon: string;
  englishTitle: string;
}> = [
  { key: 'career',     labelKey: 'username_goal_career',     subtitleKey: 'username_goal_career_subtitle',     icon: 'briefcase',             englishTitle: 'Job & Career' },
  { key: 'fluency',    labelKey: 'username_goal_fluency',    subtitleKey: 'username_goal_fluency_subtitle',    icon: 'school',                englishTitle: 'Studies & Exams' },
  { key: 'travel',     labelKey: 'username_goal_travel',     subtitleKey: 'username_goal_travel_subtitle',     icon: 'airplane',              englishTitle: 'Travel &\nAbroad' },
  { key: 'confidence', labelKey: 'username_goal_confidence', subtitleKey: 'username_goal_confidence_subtitle', icon: 'chatbubble-ellipses',   englishTitle: 'Daily\nConfidence' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'LanguageSelection'>;

const { width } = Dimensions.get('window');

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoChip}>
      <Text style={styles.infoChipLabel}>{label}</Text>
      <Text style={styles.infoChipValue}>{value}</Text>
    </View>
  );
}

function LanguageSelectionRow({
  label,
  value,
  flag,
  placeholder,
  icon,
  onPress,
  locked = false,
}: {
  label: string;
  value?: string;
  flag?: string;
  placeholder: string;
  icon: string;
  onPress: () => void;
  locked?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.selectionRowCard, locked && styles.cardLocked]}
      onPress={onPress}
      disabled={locked}
      activeOpacity={locked ? 1 : 0.82}
    >
      <View style={styles.selectionRowLeft}>
        <View style={styles.selectionRowIconWrap}>
          <Ionicons name={icon} size={18} color={COLORS.primaryLight} />
        </View>
        <View style={styles.selectionRowTextWrap}>
          <Text style={styles.selectionRowLabel}>{label}</Text>
          {value ? (
            <View style={styles.selectionRowValueWrap}>
              {flag ? <Text style={styles.selectionRowFlag}>{flag}</Text> : null}
              <Text style={styles.selectionRowValue}>{value}</Text>
            </View>
          ) : (
            <Text style={styles.selectionRowPlaceholder}>{placeholder}</Text>
          )}
        </View>
      </View>
      <Ionicons
        name={locked ? 'lock-closed' : 'chevron-forward'}
        size={18}
        color={locked ? COLORS.textDim : COLORS.textMuted}
      />
    </TouchableOpacity>
  );
}

// ── LearningSessionCard ──────────────────────────────────────────────────────
// Compact horizontal-scroll card. All original logic preserved (tier, edit, etc.)
function LearningSessionCard({
  learning,
  onStart,
  onHistory,
  isLoading,
  isPremium,
  isInTrialPeriod = false,
  onChangeLanguage,
  onChangeNativeLanguage,
  showNewBadge = false,
  isFullWidth = false,
}: {
  learning: Learning;
  onStart: (l: Learning) => void;
  onHistory: () => void;
  isLoading: boolean;
  isPremium: boolean;
  isInTrialPeriod?: boolean;
  onChangeLanguage?: () => void;
  onChangeNativeLanguage?: () => void;
  showNewBadge?: boolean;
  isFullWidth?: boolean;
}) {
  const { t } = useI18n();
  const nativeLang = LANGUAGES.find(l => l.code === learning.native_language) ?? null;
  const targetLang = LANGUAGES.find(l => l.code === learning.target_language) ?? null;
  const completed = isCourseCompleted(learning);
  const displayLevel = getDisplayLevel(learning.current_level ?? 1);
  const pct = getCompletedPercentage(learning.current_level ?? 1);
  const hasStats = learning.total_sessions > 0;
  const isLanguageLocked = (learning.current_level ?? 0) > 1;
  const levelOrTrialLabel = hasPaidAccess(learning) ? t('room_header_level', { level: displayLevel }) : t('label_free_trial');
  const planLabel = hasPaidAccess(learning) ? getPlanLabel(learning) : '';
  // Still editable during the Cashfree trial window even though is_premium is already
  // optimistically true — locks only once the subscription actually converts (trial ends).
  const canEditLanguage = (!isPremium || isInTrialPeriod) && !isLanguageLocked;

  const completedLevels = Math.max(0, displayLevel - 1);

  return (
    <View style={[styles.lsCard, isFullWidth && styles.lsCardFull]}>
      {/* Top row: LEARNING badge, plan/Full Course badge on the right */}
      <View style={styles.lsCardTopRow}>
        <View style={styles.lsCardBadgePill}>
          <Ionicons name="school" size={12} color={COLORS.primary} />
          <Text style={styles.lsCardBadgePillText}>{t('home_card_badge_learning')}</Text>
        </View>
        {planLabel ? (
          <View style={styles.lsCardLevelBadge}>
            <Text style={styles.lsCardLevelText}>{planLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* Heading */}
      <Text style={styles.lsCardTitle} numberOfLines={2}>{t('home_card_learn_title')}</Text>

      {/* Subtitle: level pill + language pair — native and target are each independently editable */}
      {nativeLang && targetLang ? (
        <>
          <View style={styles.lsCardTrialRow}>
            <View style={styles.lsCardLevelPill}>
              <Text style={styles.lsCardLevelPillText}>{levelOrTrialLabel}</Text>
            </View>
          </View>

          <View style={styles.lsCardSubtitleRow}>
          <TouchableOpacity
            activeOpacity={canEditLanguage ? 0.7 : 1}
            onPress={() => { if (canEditLanguage && onChangeNativeLanguage) onChangeNativeLanguage(); }}
            style={styles.lsCardLangSegment}
          >
            <Text style={styles.lsCardSubtitleText} numberOfLines={1}>
              {nativeLang.flag} {nativeLang.name}
            </Text>
            {canEditLanguage && (
              <View style={styles.lsCardEditIconWrap}>
                <Ionicons name="pencil" size={13} color={COLORS.primaryLight} />
              </View>
            )}
          </TouchableOpacity>

          <Ionicons name="arrow-forward" size={13} color={COLORS.textMuted} />

          <TouchableOpacity
            activeOpacity={canEditLanguage ? 0.7 : 1}
            onPress={() => { if (canEditLanguage && onChangeLanguage) onChangeLanguage(); }}
            style={styles.lsCardLangSegment}
          >
            <Text style={styles.lsCardSubtitleText} numberOfLines={1}>
              {targetLang.flag} {targetLang.name}
            </Text>
            {canEditLanguage && (
              <View style={styles.lsCardEditIconWrap}>
                <Ionicons name="pencil" size={13} color={COLORS.primaryLight} />
              </View>
            )}
          </TouchableOpacity>
          </View>
        </>
      ) : (
        <Text style={styles.lsCardSubtitleText}>{'AI ट्यूटर के साथ भाषा सीखें'}</Text>
      )}

      {/* Progress info + bar */}
      {!completed && (
        <>
          <View style={styles.lsCardProgressInfoRow}>
            <Text style={styles.lsCardProgressInfoText}>{completedLevels}/{TOTAL_LEVELS} {t('home_card_lessons_label')}</Text>
            <Text style={styles.lsCardProgressPercent}>{pct}%</Text>
          </View>
          <View style={styles.lsCardProgressBar}>
            <View style={[styles.lsCardProgressFill, { width: `${pct}%` as any }]} />
          </View>
        </>
      )}

      {/* Compact stats */}
      {hasStats && (
        <View style={styles.lsCardStatsRow}>
          <Text style={styles.lsCardStatText}>{learning.total_sessions} sessions</Text>
          {learning.total_practice_time > 0 && (
            <Text style={styles.lsCardStatText}> · {formatPracticeTime(learning.total_practice_time)}</Text>
          )}
          {learning.last_session_at ? (
            <Text style={styles.lsCardStatText}> · {formatLastSession(learning.last_session_at)}</Text>
          ) : null}
        </View>
      )}

      {/* CTA button */}
      {completed ? (
        <TouchableOpacity style={styles.lsCardCTA} onPress={onHistory} activeOpacity={0.8}>
          <Ionicons name="time-outline" size={12} color="#fff" style={{ marginRight: 5 }} />
          <Text style={styles.lsCardCTAText}>इतिहास देखें</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.lsCardCTA, isLoading && styles.lsCardCTADisabled]}
          onPress={() => onStart(learning)}
          activeOpacity={0.85}
          disabled={isLoading}
        >
          {isLoading
            ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 5 }} />
            : <Ionicons
                name={learning.total_sessions > 0 ? 'play' : 'rocket'}
                size={12}
                color="#fff"
                style={{ marginRight: 5 }}
              />}
          <Text style={styles.lsCardCTAText} numberOfLines={1}>
            {isLoading
              ? t('home_btn_connecting')
              : learning.total_sessions > 0
                ? t('home_btn_start_session')
                : (nativeLang && targetLang)
                  ? t('home_btn_start_learning')
                  : t('home_btn_start_setup')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

// ── AIChatCard (purple-themed, rendered inside aiZone) ───────────────────────
function AIChatCard({
  onPress,
  buttonLabel,
  buttonIcon,
}: {
  onPress: () => void;
  buttonLabel: string;
  buttonIcon: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <View style={styles.aiCardHeader}>
        <View style={styles.aiCardIconBadge}>
          <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.primary} />
        </View>
        <Text style={styles.aiCardTitle}>{t('home_card_chat_title')}</Text>
        <View style={styles.aiCardNewBadge}>
          <Text style={styles.homeCardNewBadgeText}>{t('path_choice_chat_badge_new')}</Text>
        </View>
      </View>
      <Text style={[styles.aiCardSubtitle]}>{t('home_card_chat_subtitle')}</Text>
      <View style={[styles.aiCardTagsRow,{marginTop:5}]}>
        <View style={styles.aiCardTag}>
          <Ionicons name="mic-outline" size={12} color={COLORS.primary} />
          <Text style={styles.aiCardTagText}>{t('home_ai_card_tag_voice')}</Text>
        </View>
        <View style={styles.cardStatDot} />
        
      </View>
      <TouchableOpacity style={styles.aiCardCTA} onPress={onPress} activeOpacity={0.85}>
        <Ionicons name={buttonIcon as any} size={14} color="#fff" style={{ marginRight: 6 }} />
        <Text style={styles.aiCardCTAText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export function LanguageSelectionScreen({ navigation, route }: Props) {
  console.log('[LanguageSelection] Screen rendered with params:', route.params);
  const { user, existingLearning, onboardingFlow = false, gotoPathChoice = false, gotoRoom = false } = route.params;
  const { t, language, setLanguage } = useI18n();
  const insets = useSafeAreaInsets();

  // localLearning refreshes on focus so level/premium status stays current after payment
  const [localLearning, setLocalLearning] = useState<Learning | null | undefined>(existingLearning);
  // localLearnings drives the list — future: will contain multiple learning sessions
  const [localLearnings, setLocalLearnings] = useState<Learning[]>(existingLearning ? [existingLearning] : []);
  const isLanguageLocked: boolean = (localLearning?.current_level ?? 0) > 1;

  const [nativeLanguage, setNativeLanguage] = useState<Language | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<Language | null>(null);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);

  // Goal labels from onboarding translations — same source as UserNameCaptureScreen
  const addLangGoalLabels = React.useMemo(() => {
    const nativeCode = language || nativeLanguage?.code || localLearning?.native_language || 'hi';
    const opts = getLocalizedOnboardingOptions(nativeCode);
    if (!opts) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    ADD_LANG_GOAL_OPTIONS.forEach((item, i) => {
      if (opts.learningReasons[i]) map[item.key] = opts.learningReasons[i].text;
    });
    return map;
  }, [language, nativeLanguage?.code, localLearning?.native_language]);

  const [showNativeSelector, setShowNativeSelector] = useState(false);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [editingLanguageLearningId, setEditingLanguageLearningId] = useState<string | null>(null);
  const [editingNativeLanguageLearningId, setEditingNativeLanguageLearningId] = useState<string | null>(null);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isPremiumUser, setIsPremiumUser] = useState(existingLearning?.is_premium || false);
  // Cashfree's ₹1-authorized 3-day trial still sets is_premium=true optimistically —
  // this distinguishes "still in the trial window" so language stays editable until
  // the trial actually converts to a paid, locked-in subscription.
  const [isCashfreeTrialActive, setIsCashfreeTrialActive] = useState(false);
  const [showPlansCTA, setShowPlansCTA] = useState(false);
  const [userPath, setUserPath] = useState<UserPath | null>(null);
  const [pendingLearningSetup, setPendingLearningSetup] = useState(false);
  // Default true so the card doesn't flash-hide while the flag is still loading.
  const [isCompanionFlowEnabled, setIsCompanionFlowEnabled] = useState(true);

  // ── Add Language modal ────────────────────────────────────────────────────
  const [storedAge, setStoredAge] = useState<number | null>(user.age ?? null);
  const isYoungKid = storedAge != null && storedAge < 13;
  const [showAddLangSheet, setShowAddLangSheet]   = useState(false);
  const [addLangStep,      setAddLangStep]         = useState<1 | 2 | 3 | 4>(1);
  const [addLangTarget,    setAddLangTarget]       = useState<Language | null>(null);
  const [addLangAge,       setAddLangAge]           = useState<number | null>(null);
  const [showAddLangAgePicker, setShowAddLangAgePicker] = useState(false);
  const [addLangGoal,      setAddLangGoal]         = useState<OnboardingGoal | null>(null);
  const [addLangSkill,     setAddLangSkill]        = useState<OnboardingSkillLevel | null>(null);
  const [addLangLoading,   setAddLangLoading]     = useState(false);

  // Show age step when age not yet captured (1:1 users skip age in UserNameCapture)
  const needsAgeStep = storedAge === null;
  // effectiveIsYoungKid also checks age entered live in the add-lang flow
  const effectiveIsYoungKid = isYoungKid || (addLangAge !== null && addLangAge < 13);
  const totalAddLangSteps = isYoungKid ? 1 : needsAgeStep ? 4 : 3;

  // Simple fade animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const addLangScrollRef = useRef<ScrollView>(null);

  // Load stored age (set during onboarding) — backend /me may not return it
  useEffect(() => {
    if (user.age != null) return; // already have it from backend
    AuthStorage.getUserAge(String(user.id)).then(age => {
      if (age !== null) setStoredAge(age);
    });
  }, [user.id, user.age]);

  // Scroll to top whenever the add-language step changes
  useEffect(() => {
    addLangScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [addLangStep]);

  useEffect(() => {
    fetchAppSettings()
      .then(({ ok, settings }) => {
        if (ok && settings) setIsCompanionFlowEnabled(settings.isCompanionFlow);
      })
      .catch((error) => CrashlyticsHelper.recordError(error as Error, 'fetchAppSettings:languageSelection'));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await AuthStorage.getToken();
        if (!token) return;
        const { ok, data } = await fetchCashfreeSubscriptionStatus(token);
        if (ok && data) setIsCashfreeTrialActive(Boolean(data.is_trial_period));
      } catch (error) {
        CrashlyticsHelper.recordError(error as Error, 'fetchCashfreeSubscriptionStatus:languageSelection');
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;

    const syncCompletedLearning = async () => {
      const normalizedLearning = await AuthStorage.normalizeCompletedLearning(existingLearning ?? null);
      if (!active) return;

      setLocalLearning(normalizedLearning);
      if (normalizedLearning) setLocalLearnings([normalizedLearning]);
      setIsPremiumUser(
        Boolean(normalizedLearning?.is_premium || (normalizedLearning?.purchased_tiers?.length ?? 0) > 0)
      );
    };

    syncCompletedLearning();

    return () => {
      active = false;
    };
  }, [existingLearning]);

  useEffect(() => {
    const loadLanguageContext = async () => {
      try {
        // Chat-path users don't need language selection — load path first
        const savedPath = await AuthStorage.getUserPath(String(user.id));
        setUserPath(savedPath);

        if (savedPath === 'chat') {
          // Load saved native language so it's available when user switches to learn
          const savedCtx = await AuthStorage.getLanguageContext(String(user.id));
          if (savedCtx?.nativeLanguage) {
            const native = LANGUAGES.find(l => l.code === savedCtx.nativeLanguage);
            if (native) {
              setNativeLanguage(native);
              void setLanguage(native.code);
            }
          }
          setIsLoadingLanguages(false);
          return;
        }

        if (localLearning && localLearning.native_language && localLearning.target_language) {
          const native = LANGUAGES.find(l => l.code === localLearning.native_language);
          const target = LANGUAGES.find(l => l.code === localLearning.target_language);
          if (native && target) {
            setNativeLanguage(native);
            setTargetLanguage(target);
            void setLanguage(native.code);
            setIsLoadingLanguages(false);
            return;
          }
        }

        const savedContext = await AuthStorage.getLanguageContext(String(user.id));
        if (savedContext && savedContext.nativeLanguage) {
          const native = LANGUAGES.find(l => l.code === savedContext.nativeLanguage);
          if (native) {
            setNativeLanguage(native);
            void setLanguage(native.code);

            if (savedContext.targetLanguage) {
              const target = LANGUAGES.find(l => l.code === savedContext.targetLanguage);
              if (target) {
                setTargetLanguage(target);
                setIsLoadingLanguages(false);
                return;
              }
            }

            // Native already known — pre-fill it
            // For direct-to-room flow, auto-open target picker
            setIsLoadingLanguages(false);
            if (gotoRoom) setShowTargetSelector(true);
            return;
          }
        }

        // No languages at all — start from native
        setIsLoadingLanguages(false);
        setShowNativeSelector(true);
      } catch (error) {
        console.error('[LanguageSelection] Error loading language context:', error);
        CrashlyticsHelper.recordError(error as Error, 'loadLanguageContext');
        setIsLoadingLanguages(false);
        Toast.show(t('language_selection_error_loading_settings_toast'), Toast.SHORT);
      }
    };
    loadLanguageContext();
  }, [localLearning, user.id]);

  useEffect(() => {
    const saveContext = async () => {
      try {
        if (nativeLanguage && targetLanguage) {
          await AuthStorage.saveLanguageContext(nativeLanguage.code, targetLanguage.code, String(user.id));
        }
      } catch (error) {
        console.error('[LanguageSelection] Error saving language context:', error);
        CrashlyticsHelper.recordError(error as Error, 'saveLanguageContext');
      }
    };

    saveContext();
  }, [nativeLanguage, targetLanguage, user.id]);

  // Simple fade-in animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  // Refresh learning data whenever this screen gains focus (e.g. after payment).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const refreshLearning = async () => {
        try {
          // Load persisted user path
          const savedPath = await AuthStorage.getUserPath(String(user.id));
          if (!cancelled) setUserPath(savedPath);

          const token = await AuthStorage.getToken();
          if (!token) return;
          console.log('🌐 [LanguageSelection] GET', `${AUTH_URL}/me`);
          const response = await fetch(`${AUTH_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          console.log('📡 [LanguageSelection] /me status:', response.status);
          if (response.ok && !cancelled) {
            const data = await response.json();
            // /me returns data.learnings (array) or data.learning (singular) — handle both
            const learningsArray: Learning[] = data.learnings ?? (data.learning ? [data.learning] : []);
            if (!cancelled) setLocalLearnings(learningsArray);
            const activeLearningRaw = learningsArray.find((l: Learning) => l.is_active) ?? learningsArray[0] ?? null;
            console.log('📦 [LanguageSelection] /me active learning:', activeLearningRaw);
            const normalizedLearning = await AuthStorage.normalizeCompletedLearning(activeLearningRaw);
            if (normalizedLearning) {
              setLocalLearning(normalizedLearning);
              setIsPremiumUser(
                normalizedLearning.is_premium || (normalizedLearning.purchased_tiers?.length ?? 0) > 0
              );
            }
          }
        } catch {
          // Silently ignore — stale data is fine on network error
        }
      };
      refreshLearning();
      return () => { cancelled = true; };
    }, [])
  );

  // ── Add Language helpers ──────────────────────────────────────────────────

  /** Target languages the user hasn't already added. */
  const availableAddTargets = TARGET_LANGUAGES.filter(
    l => !localLearnings.some(ls => ls.target_language === l.code)
  );

  const handleOpenAddLang = () => {
    setAddLangStep(1);
    setAddLangTarget(null);
    setAddLangAge(null);
    setAddLangGoal(null);
    setAddLangSkill(null);
    setShowAddLangSheet(true);
  };

  const handleAddLanguageConfirm = async (ageOverride?: number) => {
    if (!addLangTarget || !nativeLanguage) return;
    const resolvedAge = ageOverride ?? addLangAge;
    const youngKid = isYoungKid || (resolvedAge !== null && resolvedAge < 13);
    if (!youngKid && (!addLangGoal || !addLangSkill)) return;
    setAddLangLoading(true);
    try {
      const token = await AuthStorage.getToken();
      if (!token) throw new Error('No auth token');

      // 1. Create the learning session for the new language pair
      const createRes = await fetch(LEARNING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nativeLanguage: nativeLanguage.code, targetLanguage: addLangTarget.code }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || 'Failed to add language');
      const newLearning: Learning = createData.learning;

      // 2. Set goal, skill level, and age
      const effectiveAge = storedAge ?? resolvedAge;
      const learningUpdatePayload: Record<string, any> = {
        ...(effectiveAge !== null ? { age: effectiveAge } : {}),
        ...(!youngKid && addLangGoal  ? { learning_reason: addLangGoal }  : {}),
        ...(!youngKid && addLangSkill ? { skill: addLangSkill }           : {}),
      };
      if (Object.keys(learningUpdatePayload).length > 0) {
        await fetch(`${LEARNING_URL}/${newLearning.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(learningUpdatePayload),
        });
      }
      if (resolvedAge !== null) {
        await AuthStorage.saveUserAge(String(user.id), resolvedAge);
        setStoredAge(resolvedAge);
      }

      // 3. Merge into local list (avoid duplicate id)
      setLocalLearnings(prev => {
        const without = prev.filter(l => String(l.id) !== String(newLearning.id));
        const ageToStore = storedAge ?? resolvedAge;
        return [...without, {
          ...newLearning,
          ...(ageToStore !== null ? { age: ageToStore }              : {}),
          ...(!youngKid && addLangSkill ? { skill: addLangSkill }    : {}),
          ...(!youngKid && addLangGoal  ? { learning_reason: addLangGoal } : {}),
        }];
      });

      setShowAddLangSheet(false);
      await connectToRoom(newLearning);
    } catch (e: any) {
      CrashlyticsHelper.recordError(e as Error, 'handleAddLanguageConfirm');
      Toast.show(e.message || t('add_lang_failed_toast'), Toast.SHORT);
    } finally {
      setAddLangLoading(false);
    }
  };

  const handleNativeLanguageSelect = async (language: Language) => {
    if (targetLanguage && language.code === targetLanguage.code) {
      Toast.show(t('language_selection_same_language_toast'), Toast.SHORT);
      return;
    }

    // Editing an existing trial learning's native language (pencil icon) — persist to the
    // backend and update local state directly instead of going through onboarding.
    if (editingNativeLanguageLearningId) {
      const learningId = editingNativeLanguageLearningId;
      setShowNativeSelector(false);
      setEditingNativeLanguageLearningId(null);
      setSavingLanguage(true);
      try {
        const token = await AuthStorage.getToken();
        if (!token) throw new Error('No auth token');

        const res = await fetch(`${LEARNING_URL}/${learningId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ native_language: language.code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || t('language_selection_update_language_failed_generic'));
        }

        const persistedNative = data.learning?.native_language ?? data.native_language;
        if (persistedNative && persistedNative !== language.code) {
          CrashlyticsHelper.log(
            `native_language PUT did not persist: sent=${language.code} got=${persistedNative}`
          );
          throw new Error('Language change did not save on the server. Please contact support.');
        }

        setLocalLearnings(prev =>
          prev.map(l => (String(l.id) === learningId ? { ...l, native_language: language.code } : l))
        );
        setLocalLearning(prev =>
          prev && String(prev.id) === learningId ? { ...prev, native_language: language.code } : prev
        );
        setNativeLanguage(language);
        void setLanguage(language.code);
        Toast.show(t('language_selection_language_updated_toast', { language: language.name }), Toast.SHORT);
      } catch (e: any) {
        CrashlyticsHelper.recordError(e as Error, 'handleNativeLanguageSelect_editExisting');
        Toast.show(e.message || t('language_selection_update_language_failed_toast'), Toast.SHORT);
      } finally {
        setSavingLanguage(false);
      }
      return;
    }

    setNativeLanguage(language);
    void setLanguage(language.code);
    setShowNativeSelector(false);

    if (!targetLanguage) {
      setTimeout(() => {
        setShowTargetSelector(true);
      }, 300);
    }
  };

  const handleTargetLanguageSelect = async (language: Language) => {
    if (nativeLanguage && language.code === nativeLanguage.code) {
      Toast.show(t('language_selection_same_language_toast'), Toast.SHORT);
      return;
    }

    // Editing an existing trial learning's language (pencil icon) — persist to the
    // backend and update local state directly instead of going through onboarding.
    if (editingLanguageLearningId) {
      const learningId = editingLanguageLearningId;
      setShowTargetSelector(false);
      setEditingLanguageLearningId(null);
      setSavingLanguage(true);
      try {
        const token = await AuthStorage.getToken();
        if (!token) throw new Error('No auth token');

        const res = await fetch(`${LEARNING_URL}/${learningId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ target_language: language.code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || t('language_selection_update_language_failed_generic'));
        }

        const persistedTarget = data.learning?.target_language ?? data.target_language;
        if (persistedTarget && persistedTarget !== language.code) {
          CrashlyticsHelper.log(
            `target_language PUT did not persist: sent=${language.code} got=${persistedTarget}`
          );
          throw new Error('Language change did not save on the server. Please contact support.');
        }

        setLocalLearnings(prev =>
          prev.map(l => (String(l.id) === learningId ? { ...l, target_language: language.code } : l))
        );
        setLocalLearning(prev =>
          prev && String(prev.id) === learningId ? { ...prev, target_language: language.code } : prev
        );
        setTargetLanguage(language);
        Toast.show(t('language_selection_language_updated_toast', { language: language.name }), Toast.SHORT);
      } catch (e: any) {
        CrashlyticsHelper.recordError(e as Error, 'handleTargetLanguageSelect_editExisting');
        Toast.show(e.message || t('language_selection_update_language_failed_toast'), Toast.SHORT);
      } finally {
        setSavingLanguage(false);
      }
      return;
    }

    setTargetLanguage(language);
    setShowTargetSelector(false);

    // After language setup from the chat-path home "Start Learning" flow,
    // proceed straight to the goal step (name is already known for this user).
    if (pendingLearningSetup) {
      setPendingLearningSetup(false);
      setTimeout(() => {
        const parent = navigation.getParent();
        const params = { user, existingLearning: localLearning, name: user.name ?? '', age: null };
        if (parent) (parent as any).navigate('LearningGoal', params);
        else (navigation as any).navigate('LearningGoal', params);
      }, 350);
    }
  };

  usePayUCheckout({
    onPaymentSuccess: async (e: any) => {
      setIsProcessingPayment(false);

      try {
        const token = await AuthStorage.getToken();
        if (!token) {
          throw new Error('No auth token available');
        }

        const paymentId =
          e.payuResponse?.paymentId ||
          e.paymentId ||
          `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const transactionId =
          e.payuResponse?.txnid ||
          e.txnid ||
          `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const { ok } = await subscribeYearlyPremium(token, {
          payment_id: paymentId,
          transaction_id: transactionId,
          amount: PAYU_SUBSCRIPTION_PRODUCT.amount,
          plan: 'yearly',
        });

        if (ok) {
          setIsPremiumUser(true);
          Alert.alert(
            t('language_selection_premium_welcome_title'),
            t('language_selection_premium_welcome_message'),
            [{ text: t('language_selection_premium_start_learning_button') }]
          );
        } else {
          throw new Error('Failed to activate premium');
        }
      } catch (error) {
        console.error('[LanguageSelection] Payment success error:', error);
        CrashlyticsHelper.recordError(error as Error, 'paymentSuccess');
        Alert.alert(
          t('language_selection_payment_received_title'),
          t('language_selection_payment_received_message'),
          [{ text: t('language_selection_ok_button') }]
        );
      }
    },
    onPaymentFailure: (e: any) => {
      console.log('[LanguageSelection] Payment failure:', e);
      setIsProcessingPayment(false);
      Alert.alert(
        t('language_selection_payment_failed_title'),
        t('language_selection_payment_failed_message'),
        [{ text: t('language_selection_ok_button') }],
      );
    },
    onPaymentCancel: () => {
      console.log('[LanguageSelection] Payment cancelled');
      setIsProcessingPayment(false);
    },
    onError: (e: unknown) => {
      console.error('[LanguageSelection] Payment error:', e);
      setIsProcessingPayment(false);
      Alert.alert(
        t('language_selection_payment_error_title'),
        t('language_selection_payment_error_message'),
        [{ text: t('language_selection_ok_button') }],
      );
    },
  });

  const initiatePayment = () => {
    if (!PayUBizSdk) {
      Alert.alert(t('webview_error_title'), t('language_selection_gateway_unavailable_message'));
      return;
    }

    if (isPremiumUser) {
      Alert.alert(t('language_selection_already_premium_title'), t('language_selection_already_premium_message'));
      return;
    }

    try {
      setIsProcessingPayment(true);
      const paymentParams = buildSubscriptionYearlyCheckoutParams(user);
      PayUBizSdk.openCheckoutScreen(paymentParams);
    } catch (error) {
      console.error('[LanguageSelection] Payment initiation error:', error);
      CrashlyticsHelper.recordError(error as Error, 'initiatePayment');
      setIsProcessingPayment(false);
      Alert.alert(t('webview_error_title'), t('language_selection_failed_start_payment_message'));
    }
  };

  const navigateToHistory = async (learningId?: string) => {
    const id = learningId ?? (localLearning ? String(localLearning.id) : null);
    if (!id) {
      Toast.show(t('language_selection_no_history_yet_toast'), Toast.SHORT);
      return;
    }

    try {
      const token = await AuthStorage.getToken();
      if (token) {
        navigation.navigate('ConversationHistory', {
          learningId: id,
          authToken: token,
        });
      } else {
        Toast.show(t('language_selection_auth_error_toast'), Toast.SHORT);
      }
    } catch (error) {
      console.error('[LanguageSelection] Navigation error:', error);
      CrashlyticsHelper.recordError(error as Error, 'navigateToHistory');
      Toast.show(t('language_selection_failed_open_history_toast'), Toast.SHORT);
    }
  };

  const connectToRoom = async (learningData: Learning, retry: number = 0, fromOnboarding: boolean = false): Promise<void> => {
    if (isCourseCompleted(learningData)) {
      Toast.show(COMPLETION_TOAST_MESSAGE, Toast.LONG);
      return;
    }

    try {
      const isOnline = await NetworkHelper.checkConnection();
      if (!isOnline) {
        navigation.navigate('ConnectionError', {
          errorMessage: 'No internet connection. Please check your network and try again.'
        });
        return;
      }

      CrashlyticsHelper.log(`Connecting to room (attempt ${retry + 1})`);

      const nativeLang = LANGUAGES.find(l => l.code === learningData.native_language);
      const targetLang = LANGUAGES.find(l => l.code === learningData.target_language);
      const onboardingContext = await AuthStorage.getOnboardingProfile(String(user.id));
      const token = await AuthStorage.getToken();

      if (!token) {
        throw new Error('No authentication token');
      }

      const requestBody = {
        roomName: `language-learning-room${new Date().getTime()}`,
        participantName: user?.phone_number || 'User_' + Date.now(),
        nativeLanguage: learningData.native_language,
        targetLanguage: learningData.target_language,
        nativeLanguageName: nativeLang?.name || 'English',
        targetLanguageName: targetLang?.name || 'Hindi',
        currentLevel: learningData.current_level ?? 0,
        learningId: learningData.id ? String(learningData.id) : '',
        userName: user?.name || '',
        authToken: token,
        isPremium: learningData.is_premium || false,
      };

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
      });

      console.log('🌐 [LanguageSelection] POST', BACKEND_URL);
      console.log('📤 [LanguageSelection] connectToRoom body:', requestBody);
      const res = await Promise.race([
        fetch(BACKEND_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }),
        timeoutPromise,
      ]);

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      console.log('📡 [LanguageSelection] connectToRoom status:', res.status);
      console.log('📦 [LanguageSelection] connectToRoom response:', data);

      if (res.status === 402 || data.error === 'payment_required' || data.error === 'free_trial_exhausted') {
        setLoading(false);
        const message =
          data.message ||
          'Your free trial is completed. Please upgrade to continue learning.';

        const parent = navigation.getParent();
        const blockedParams = {
          user,
          learning: learningData,
          token: '',
          url: '',
          onboardingContext,
          accessBlocked: true,
          blockedReason: data.error || 'payment_required',
          blockedMessage: message,
        };

        if (parent) {
          parent.reset({
            index: 0,
            routes: [{ name: 'Room', params: blockedParams }],
          });
        } else {
          (navigation as any).navigate('Room', blockedParams);
        }
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || `Server error: ${res.status}`);
      }

      const url = data.url.includes('localhost')
        ? data.url.replace('localhost', YOUR_COMPUTER_IP)
        : data.url;

      CrashlyticsHelper.log('Room connection successful');

      const roomParams = { user, learning: learningData, token: data.token, url, onboardingContext };

      if (fromOnboarding) {
        // After onboarding: land on home dashboard with Room on top
        navigation.reset({
          index: 1,
          routes: [
            { name: 'MainTabs', params: { user, existingLearning: learningData } },
            { name: 'Room', params: roomParams },
          ],
        });
      } else {
        const parent = navigation.getParent();
        if (parent) {
          parent.reset({ index: 0, routes: [{ name: 'Room', params: roomParams }] });
        } else {
          (navigation as any).navigate('Room', roomParams);
        }
      }
    } catch (e: any) {
      console.error('[LanguageSelection] Connection error:', e);
      CrashlyticsHelper.recordError(e as Error, `connectToRoom attempt ${retry + 1}`);

      if (retry < MAX_RETRIES) {
        CrashlyticsHelper.log(`Retrying connection in ${RETRY_DELAY_BASE * (retry + 1)}ms`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_BASE * (retry + 1)));
        return connectToRoom(learningData, retry + 1, fromOnboarding);
      }

      const errorMessage = e.message.includes('timeout')
        ? 'Connection timed out. The server might be busy.'
        : 'Unable to connect to SuperBold. Please try again later.';

      setLoading(false);
      navigation.navigate('ConnectionError', { errorMessage });
    }
  };

  const handleStartLearning = async () => {
    if (onboardingFlow) {
      if (!nativeLanguage || !targetLanguage) {
        Toast.show(t('language_selection_select_both_languages_toast'), Toast.SHORT);
        if (!nativeLanguage) {
          setShowNativeSelector(true);
        } else {
          setShowTargetSelector(true);
        }
        return;
      }

      if (nativeLanguage.code === targetLanguage.code) {
        Toast.show(t('language_selection_same_language_toast'), Toast.SHORT);
        setShowTargetSelector(true);
        return;
      }

      // Create the learning record now so UserNameCapture can persist skill/reason to it.
      let learningToPass = localLearning ?? existingLearning;
      if (!learningToPass?.id) {
        try {
          setLoading(true);
          const token = await AuthStorage.getToken();
          if (token) {
            console.log('🌐 [LanguageSelection] POST', LEARNING_URL);
            console.log('📤 [LanguageSelection] createLearning body:', { nativeLanguage: nativeLanguage.code, targetLanguage: targetLanguage.code });
            const response = await fetch(LEARNING_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                nativeLanguage: nativeLanguage.code,
                targetLanguage: targetLanguage.code,
              }),
            });
            console.log('📡 [LanguageSelection] createLearning status:', response.status);
            if (response.ok) {
              const data = await response.json();
              console.log('📦 [LanguageSelection] createLearning response:', data);
              learningToPass = data.learning ?? learningToPass;
            } else {
              const errData = await response.json().catch(() => ({}));
              console.warn('⚠️ [LanguageSelection] createLearning failed:', response.status, errData);
            }
          }
        } catch (e) {
          console.error('❌ [LanguageSelection] createLearningOnboarding error:', e);
          CrashlyticsHelper.recordError(e as Error, 'createLearningOnboarding');
        } finally {
          setLoading(false);
        }
      }

      if (gotoPathChoice) {
        navigation.replace('PathChoice', {
          user,
          existingLearning: learningToPass,
        });
      } else if (gotoRoom) {
        if (learningToPass) await connectToRoom(learningToPass, 0, true);
      } else if (user.name) {
        navigation.replace('LearningGoal', {
          user,
          existingLearning: learningToPass,
          name: user.name,
          age: null,
        });
      } else {
        navigation.replace('UserNameCapture', {
          user,
          existingLearning: learningToPass,
          pathChoice: 'learn',
        });
      }
      return;
    }

    if (isCourseCompleted(localLearning)) {
      Toast.show(COMPLETION_TOAST_MESSAGE, Toast.LONG);
      return;
    }

    if (!nativeLanguage || !targetLanguage) {
      Toast.show(t('language_selection_select_both_languages_toast'), Toast.SHORT);
      if (!nativeLanguage) {
        setShowNativeSelector(true);
      } else {
        setShowTargetSelector(true);
      }
      return;
    }

    if (nativeLanguage.code === targetLanguage.code) {
      Toast.show(t('language_selection_same_language_toast'), Toast.SHORT);
      setShowTargetSelector(true);
      return;
    }

    try {
      const isConnected = await NetworkHelper.checkConnection();
      if (!isConnected) {
        Toast.show(t('language_selection_no_internet_toast'), Toast.SHORT);
        return;
      }

      setLoading(true);
      CrashlyticsHelper.log(`Starting learning: ${nativeLanguage.code} → ${targetLanguage.code}`);

      const token = await AuthStorage.getToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      console.log('🌐 [LanguageSelection] POST', LEARNING_URL);
      console.log('📤 [LanguageSelection] startLearning body:', { nativeLanguage: nativeLanguage.code, targetLanguage: targetLanguage.code });
      const response = await fetch(LEARNING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          nativeLanguage: nativeLanguage.code,
          targetLanguage: targetLanguage.code,
        }),
      });
      console.log('📡 [LanguageSelection] startLearning status:', response.status);
      const data = await response.json();
      console.log('📦 [LanguageSelection] startLearning response:', data);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create learning session');
      }

      CrashlyticsHelper.setAttribute('native_language', nativeLanguage.code);
      CrashlyticsHelper.setAttribute('target_language', targetLanguage.code);
      CrashlyticsHelper.log('Learning session created');

      await connectToRoom(data.learning);
    } catch (error: any) {
      console.error('[LanguageSelection] Error starting learning:', error);
      CrashlyticsHelper.recordError(error as Error, 'handleStartLearning');
      Toast.show(error.message || t('language_selection_failed_start_learning_toast'), Toast.SHORT);
      setLoading(false);
    }
  };


  // Called by each LearningSessionCard — skips gating since the learning already exists
  const handleStartLearningSession = async (learning: Learning) => {
    if (isCourseCompleted(learning)) {
      Toast.show(COMPLETION_TOAST_MESSAGE, Toast.LONG);
      return;
    }
    setLoading(true);
    await connectToRoom(learning);
  };

  const handleLogout = async () => {
    try {
      CrashlyticsHelper.log('User logging out');
      await setLanguage('en');
      await AuthStorage.clearAuth();

      const parent = navigation.getParent();
      if (parent) {
        parent.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      } else {
        navigation.navigate('Login' as never);
      }
    } catch (error) {
      console.error('[LanguageSelection] Logout error:', error);
      CrashlyticsHelper.recordError(error as Error, 'handleLogout');
      navigation.navigate('Login' as never);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('language_selection_delete_account_title'),
      t('language_selection_delete_account_message'),
      [
        { text: t('language_selection_cancel_button'), style: 'cancel' },
        {
          text: t('language_selection_delete_button'),
          style: 'destructive',
          onPress: async () => {
            CrashlyticsHelper.log('User initiated account deletion');
            try {
              const token = await AuthStorage.getToken();
              if (token) {
                await fetch(`${AUTH_URL}/delete-account`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
              }
              Toast.show(t('language_selection_account_deleted_toast'), Toast.SHORT);
              CrashlyticsHelper.log('Account deleted');
            } catch (error) {
              console.error('[LanguageSelection] Delete account error:', error);
              CrashlyticsHelper.recordError(error as Error, 'handleDeleteAccount');
            } finally {
              await AuthStorage.clearAuth();
              const parent = navigation.getParent();
              if (parent) {
                parent.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              } else {
                navigation.navigate('Login' as never);
              }
            }
          },
        },
      ]
    );
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoadingLanguages) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.secondary} />
            <Text style={styles.loadingStateText}>{t('language_selection_loading_text')}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Language selection prompt (onboarding flow or missing languages) ─
  if ((onboardingFlow || !nativeLanguage) && userPath !== 'chat') {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="language" size={28} color={COLORS.secondary} />
                  </View>
                  <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>{t('language_selection_session_setup_badge')}</Text>
                  </View>
                </View>
                <Text style={styles.mainTitle}>{t('language_selection_select_languages_title')}</Text>
                <Text style={styles.mainSubtitle}>
                  {t('language_selection_select_languages_subtitle')}
                </Text>

                <View style={styles.infoChipRow}>
                  <InfoChip label={t('language_selection_current_step_chip_label')} value={t('language_selection_language_pair_chip_value')} />
                  <InfoChip label={t('language_selection_session_type_chip_label')} value={t('language_selection_voice_lesson_chip_value')} />
                </View>
              </View>

              <View style={styles.selectionPanel}>
                <Text style={styles.sectionEyebrow}>{t('language_selection_language_pair_chip_value')}</Text>
                <LanguageSelectionRow
                  label={t('language_selection_i_speak_label')}
                  value={nativeLanguage?.name}
                  flag={nativeLanguage?.flag}
                  placeholder={t('language_selection_native_placeholder')}
                  icon="chatbubble-ellipses-outline"
                  onPress={() => setShowNativeSelector(true)}
                  locked={isPremiumUser}
                />

                <View style={styles.connectorModern}>
                  <View style={styles.connectorModernLine} />
                  <View style={styles.connectorModernIcon}>
                    <Ionicons name="swap-vertical" size={16} color={COLORS.primaryLight} />
                  </View>
                  <View style={styles.connectorModernLine} />
                </View>

                <LanguageSelectionRow
                  label={t('language_selection_i_want_to_learn_label')}
                  value={targetLanguage?.name}
                  flag={targetLanguage?.flag}
                  placeholder={t('language_selection_target_placeholder')}
                  icon="sparkles-outline"
                  onPress={() => setShowTargetSelector(true)}
                  locked={isPremiumUser}
                />
              </View>

              <View style={styles.setupNoteCard}>
                <Text style={styles.setupNoteTitle}>{t('language_selection_what_happens_next_title')}</Text>
                <Text style={styles.setupNoteText}>
                  {t('language_selection_what_happens_next_text')}
                </Text>
              </View>

              {nativeLanguage && targetLanguage && (
                <View style={styles.ctaPanel}>
                  <View style={styles.ctaSummaryRow}>
                    <Text style={styles.ctaSummaryText}>{nativeLanguage.flag} {nativeLanguage.name}</Text>
                    <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
                    <Text style={styles.ctaSummaryText}>{targetLanguage.flag} {targetLanguage.name}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleStartLearning}
                    activeOpacity={0.8}
                    disabled={loading}
                  >
                    <LinearGradient
                      colors={[COLORS.primary, COLORS.primaryLight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryButtonGradient}
                    >
                      {loading
                        ? <ActivityIndicator size="small" color={COLORS.text} style={{ marginRight: 8 }} />
                        : <Ionicons name="arrow-forward" size={18} color={COLORS.text} style={{ marginRight: 8 }} />}
                      <Text style={styles.primaryButtonText}>
                        {t('language_selection_continue_setup_button')}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          </ScrollView>
        </SafeAreaView>

        <LanguageSelector
          visible={showNativeSelector}
          onClose={() => {
            setShowNativeSelector(false);
            setEditingNativeLanguageLearningId(null);
          }}
          onSelect={handleNativeLanguageSelect}
          title={t('language_selection_select_native_modal_title')}
          subtitle={t('language_selection_which_language_speak_subtitle')}
          selectedLanguage={nativeLanguage}
          languages={NATIVE_LANGUAGES}
        />

        <LanguageSelector
          visible={showTargetSelector}
          onClose={() => {
            setShowTargetSelector(false);
            setEditingLanguageLearningId(null);
          }}
          onSelect={handleTargetLanguageSelect}
          title={t('language_selection_select_target_modal_title')}
          selectedLanguage={targetLanguage}
          languages={TARGET_LANGUAGES}
        />
      </View>
    );
  }

  // ── Main screen (languages selected) ─────────────────────────────────────

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Bar */}
        <View style={styles.topBarRow}>
          <View style={styles.userBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.userPhone} numberOfLines={1}>{user.phone_number}</Text>
          </View>
          <View style={styles.topBarActions}>
            {localLearning && (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => navigateToHistory()}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={20} color={COLORS.text} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowAccountMenu(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>
        
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>

            {/* ── Greeting ──────────────────────────────────────────────── */}
            <Text style={styles.homeGreeting}>
              {t('home_greeting')}{user.name ? `, ${user.name}` : ''}
            </Text>
            <Text style={styles.homeTitle}>
              {userPath === 'chat' ? t('home_title_chat') : t('home_title_learn')}
            </Text>

            {/* ── State A: Learn-first ───────────────────────────────────── */}
            {userPath !== 'chat' && (
              <>
                {/* Orange Learning zone */}
                <View style={styles.learnZone}>
                  <View style={styles.zoneHeader}>
                    <View style={styles.learnZoneIconBadge}>
                      <Ionicons name="school-outline" size={13} color={COLORS.primary} />
                    </View>
                    <Text style={styles.learnZoneLabel}>{t('home_learning_zone_label')}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.lsHScroll}
                    contentContainerStyle={localLearnings.length === 1 ? { flexGrow: 1 } : styles.lsHScrollContent}
                  >
                    {localLearnings.map(ls => (
                      <LearningSessionCard
                        key={String(ls.id)}
                        learning={ls}
                        onStart={handleStartLearningSession}
                        onHistory={() => navigateToHistory(String(ls.id))}
                        isLoading={loading || savingLanguage}
                        isPremium={isPremiumUser}
                        isInTrialPeriod={isCashfreeTrialActive}
                        onChangeLanguage={() => {
                          setEditingLanguageLearningId(String(ls.id));
                          setShowTargetSelector(true);
                        }}
                        onChangeNativeLanguage={() => {
                          setEditingNativeLanguageLearningId(String(ls.id));
                          setShowNativeSelector(true);
                        }}
                        isFullWidth={localLearnings.length === 1}
                      />
                    ))}
                  </ScrollView>
                  {localLearnings.length === 0 && (
                    <TouchableOpacity style={styles.lsAddBelow} onPress={handleOpenAddLang} activeOpacity={0.8}>
                      <Ionicons name="add-circle-outline" size={15} color={COLORS.primary} />
                      <Text style={styles.lsAddBelowText}>भाषा जोड़ें</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* AI 1:1 zone — remotely gated by GET /api/app-settings.isCompanionFlow */}
                {isCompanionFlowEnabled && (
                  <View style={styles.aiZone}>
                    <View style={styles.zoneHeader}>
                      <View style={styles.aiZoneIconBadge}>
                        <Ionicons name="sparkles-outline" size={13} color={COLORS.primary} />
                      </View>
                      <Text style={styles.aiZoneLabel}>{t('home_ai_zone_label')}</Text>
                    </View>
                    <AIChatCard
                      onPress={() => navigation.navigate('TalkingSession', { user })}
                      buttonLabel={t('home_btn_start_chat')}
                      buttonIcon="mic-outline"
                    />
                  </View>
                )}
              </>
            )}

            {/* ── State B: Chat-first ────────────────────────────────────── */}
            {userPath === 'chat' && (
              <>
                {/* AI 1:1 zone — remotely gated by GET /api/app-settings.isCompanionFlow */}
                {isCompanionFlowEnabled && (
                  <View style={styles.aiZone}>
                    <View style={styles.zoneHeader}>
                      <View style={styles.aiZoneIconBadge}>
                        <Ionicons name="sparkles-outline" size={13} color={COLORS.primary} />
                      </View>
                      <Text style={styles.aiZoneLabel}>{t('home_ai_zone_label')}</Text>
                    </View>
                    <AIChatCard
                      onPress={() => navigation.navigate('TalkingSession', { user })}
                      buttonLabel={t('home_btn_start_new_chat')}
                      buttonIcon="mic"
                    />
                  </View>
                )}

                {/* Orange Learning zone */}
                <View style={styles.learnZone}>
                  <View style={styles.zoneHeader}>
                    <View style={styles.learnZoneIconBadge}>
                      <Ionicons name="school-outline" size={13} color={COLORS.primary} />
                    </View>
                    <Text style={styles.learnZoneLabel}>{t('home_learning_zone_label')}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.lsHScroll}
                    contentContainerStyle={localLearnings.length === 1 ? { flexGrow: 1 } : styles.lsHScrollContent}
                  >
                    {localLearnings.map(ls => (
                      <LearningSessionCard
                        key={String(ls.id)}
                        learning={ls}
                        onStart={handleStartLearningSession}
                        onHistory={() => navigateToHistory(String(ls.id))}
                        isLoading={loading || savingLanguage}
                        isPremium={isPremiumUser}
                        isInTrialPeriod={isCashfreeTrialActive}
                        onChangeLanguage={() => {
                          setEditingLanguageLearningId(String(ls.id));
                          setShowTargetSelector(true);
                        }}
                        onChangeNativeLanguage={() => {
                          setEditingNativeLanguageLearningId(String(ls.id));
                          setShowNativeSelector(true);
                        }}
                        showNewBadge={false}
                        isFullWidth={localLearnings.length === 1}
                      />
                    ))}
                  </ScrollView>
                  {localLearnings.length === 0 && (
                    <TouchableOpacity style={styles.lsAddBelow} onPress={handleOpenAddLang} activeOpacity={0.8}>
                      <Ionicons name="add-circle-outline" size={15} color={COLORS.primary} />
                      <Text style={styles.lsAddBelowText}>भाषा जोड़ें</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {/* ── Upgrade nudge ─────────────────────────────────────────── */}
            {showPlansCTA && !isPremiumUser && (
              <TouchableOpacity style={styles.plansButton} onPress={initiatePayment} activeOpacity={0.8}>
                <Ionicons name="wallet-outline" size={16} color={COLORS.text} style={{ marginRight: 8 }} />
                <Text style={styles.plansButtonText}>{t('language_selection_view_plans_button')}</Text>
              </TouchableOpacity>
            )}

          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Language Selectors */}
      <LanguageSelector
        visible={showNativeSelector}
        onClose={() => setShowNativeSelector(false)}
        onSelect={handleNativeLanguageSelect}
        title={t('language_selection_select_native_modal_title')}
        selectedLanguage={nativeLanguage}
        languages={NATIVE_LANGUAGES}
      />

      <LanguageSelector
        visible={showTargetSelector}
        onClose={() => setShowTargetSelector(false)}
        onSelect={handleTargetLanguageSelect}
        title={t('language_selection_select_target_modal_title')}
        selectedLanguage={targetLanguage}
        languages={TARGET_LANGUAGES}
      />

      {/* ── Add Language Bottom Sheet ─────────────────────────────────────── */}
      <Modal
        visible={showAddLangSheet}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => setShowAddLangSheet(false)}
      >
        <View style={styles.addLangOverlay}>
          <View style={styles.addLangSheet}>

            {/* Header — step indicator matching UserNameCaptureScreen */}
            <View style={[styles.addLangHeader, { paddingTop: insets.top }]}>
              {/* Close row */}
              <View style={styles.addLangCloseRow}>
                <TouchableOpacity
                  onPress={() => setShowAddLangSheet(false)}
                  style={styles.addLangCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Step circles + connecting lines */}
              <View style={styles.addLangStepCirclesRow}>
                {Array.from({ length: totalAddLangSteps }, (_, i) => i + 1).map((step, idx, arr) => {
                  const stepLabel = step === 1
                    ? t('add_lang_step_label_language')
                    : needsAgeStep
                      ? (step === 2 ? t('add_lang_step_label_age') : step === 3 ? t('username_step_label_goal') : t('username_step_label_level'))
                      : (step === 2 ? t('username_step_label_goal') : t('username_step_label_level'));
                  return (
                    <React.Fragment key={step}>
                      <View style={styles.addLangStepCircleWrap}>
                        <View style={[
                          styles.addLangStepCircle,
                          addLangStep > step && styles.addLangStepCircleDone,
                          addLangStep === step && styles.addLangStepCircleActive,
                        ]}>
                          {addLangStep > step ? (
                            <Ionicons name="checkmark" size={16} color="#fff" />
                          ) : (
                            <Text style={[styles.addLangStepNum, addLangStep === step && styles.addLangStepNumActive]}>
                              {step}
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.addLangStepCircleLabel, addLangStep >= step && styles.addLangStepCircleLabelActive]}>
                          {stepLabel}
                        </Text>
                      </View>
                      {idx < arr.length - 1 && (
                        <View style={styles.addLangStepLine}>
                          {addLangStep > step && (
                            <LinearGradient
                              colors={['#FF5B2E', '#FF8A4C']}
                              style={StyleSheet.absoluteFillObject}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                            />
                          )}
                        </View>
                      )}
                    </React.Fragment>
                  );
                })}
              </View>

              {/* Progress bar segments */}
              <View style={styles.addLangStepProgressRow}>
                {Array.from({ length: totalAddLangSteps }, (_, i) => i + 1).map(seg => (
                  <View
                    key={seg}
                    style={[styles.addLangStepProgressSeg, addLangStep >= seg && styles.addLangStepProgressSegActive]}
                  />
                ))}
              </View>

              {/* Step pill */}
              <View style={styles.addLangStepPill}>
                <Text style={styles.addLangStepPillText}>{'Step '}{addLangStep}{' of '}{totalAddLangSteps}</Text>
              </View>
            </View>

            {/* Body */}
            <ScrollView
              ref={addLangScrollRef}
              showsVerticalScrollIndicator={false}
              style={styles.addLangBody}
              contentContainerStyle={styles.addLangBodyContent}
            >
              {/* Step 1 — Language selection */}
              {addLangStep === 1 && (
                <>
                  <Text style={styles.addLangTitle}>{t('path_choice_target_lang_title')}</Text>
                  <Text style={styles.addLangSubtitle}>{t('language_selection_select_target_modal_title')}</Text>
                  {availableAddTargets.length === 0 ? (
                    <View style={styles.addLangEmpty}>
                      <Ionicons name="checkmark-circle" size={44} color={COLORS.primary} />
                      <Text style={styles.addLangEmptyText}>
                        {t('add_lang_all_added_text')}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.addLangList}>
                      {availableAddTargets.map(lang => {
                        const sel = addLangTarget?.code === lang.code;
                        return (
                          <TouchableOpacity
                            key={lang.code}
                            style={[styles.addLangLangRow, sel && styles.addLangLangRowSel]}
                            onPress={() => setAddLangTarget(lang)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.addLangLangFlag}>{lang.flag}</Text>
                            <View style={styles.addLangLangTextWrap}>
                              <Text style={[styles.addLangLangName, sel && styles.addLangLangNameSel]}>
                                {lang.englishName ?? lang.name}
                              </Text>
                              {lang.englishName && lang.englishName !== lang.name && (
                                <Text style={styles.addLangLangNative}>{lang.name}</Text>
                              )}
                            </View>
                            {sel && (
                              <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

              {/* Step 2 — Age selection (only when storedAge is null) */}
              {needsAgeStep && addLangStep === 2 && (
                <>
                  <TouchableOpacity
                    style={styles.addLangBackBtn}
                    onPress={() => setAddLangStep(1)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back-circle" size={26} color={COLORS.text} />
                    <Text style={styles.addLangBackBtnText}>{t('add_lang_step_label_language')}</Text>
                  </TouchableOpacity>
                  <Text style={styles.addLangTitle}>{t('username_age_label')}</Text>
                  <Text style={styles.addLangSubtitle}>{t('username_age_placeholder')}</Text>
                  <TouchableOpacity
                    style={[styles.addLangAgeBtn, addLangAge !== null && styles.addLangAgeBtnActive]}
                    onPress={() => setShowAddLangAgePicker(true)}
                    activeOpacity={0.82}
                  >
                    <Ionicons name="person-outline" size={18} color={addLangAge !== null ? COLORS.primary : COLORS.textDim} />
                    <Text style={[styles.addLangAgeBtnText, addLangAge === null && styles.addLangAgeBtnPlaceholder]}>
                      {addLangAge !== null ? t('username_age_value', { age: String(addLangAge) }) : t('username_age_placeholder')}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={COLORS.textDim} />
                  </TouchableOpacity>
                  <Modal visible={showAddLangAgePicker} transparent animationType="fade" onRequestClose={() => setShowAddLangAgePicker(false)}>
                    <TouchableOpacity style={styles.agePickerOverlay} activeOpacity={1} onPress={() => setShowAddLangAgePicker(false)}>
                      <View style={styles.agePickerSheet}>
                        <View style={styles.agePickerHeader}>
                          <Text style={styles.agePickerTitle}>{t('username_age_modal_title')}</Text>
                          <TouchableOpacity onPress={() => setShowAddLangAgePicker(false)}>
                            <Ionicons name="close" size={20} color={COLORS.textMuted} />
                          </TouchableOpacity>
                        </View>
                        <FlatList
                          data={Array.from({ length: 77 }, (_, i) => i + 4)}
                          keyExtractor={item => String(item)}
                          showsVerticalScrollIndicator={false}
                          style={{ maxHeight: 320 }}
                          initialScrollIndex={addLangAge !== null ? addLangAge - 4 : 9}
                          getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
                          renderItem={({ item }) => {
                            const sel = addLangAge === item;
                            return (
                              <TouchableOpacity
                                style={[styles.agePickerItem, sel && styles.agePickerItemSelected]}
                                onPress={() => {
                                  setAddLangAge(item);
                                  setShowAddLangAgePicker(false);
                                }}
                                activeOpacity={0.75}
                              >
                                <Text style={[styles.agePickerItemText, sel && styles.agePickerItemTextSelected]}>{item}</Text>
                                {sel && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
                              </TouchableOpacity>
                            );
                          }}
                        />
                      </View>
                    </TouchableOpacity>
                  </Modal>
                </>
              )}

              {/* Step 2 (no age) or Step 3 (with age) — Goal selection */}
              {!effectiveIsYoungKid && addLangStep === (needsAgeStep ? 3 : 2) && (
                <>
                <TouchableOpacity
                  style={styles.addLangBackBtn}
                  onPress={() => setAddLangStep((needsAgeStep ? 2 : 1) as any)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="arrow-back-circle" size={26} color={COLORS.text} />
                  <Text style={styles.addLangBackBtnText}>{needsAgeStep ? t('add_lang_step_label_age') : t('add_lang_step_label_language')}</Text>
                </TouchableOpacity>
                <Text style={styles.addLangTitle}>{t('username_why_learning_title', { language: addLangTarget?.englishName ?? addLangTarget?.name ?? '' })}</Text>
                <Text style={styles.addLangSubtitle}>{t('username_why_learning_subtitle')}</Text>
                <View style={styles.addLangGoalGrid}>
                  {ADD_LANG_GOAL_OPTIONS.map((opt, gIdx) => {
                    const sel = addLangGoal === opt.key;
                    return (
                      <View
                        key={opt.key}
                        style={[
                          styles.addLangGoalCardWrap,
                          gIdx % 2 === 1 && styles.addLangGoalCardWrapRight,
                          sel && styles.addLangGoalCardWrapSelected,
                        ]}
                      >
                        <TouchableOpacity
                          style={[styles.addLangGoalCard, sel && styles.addLangGoalCardSelected]}
                          onPress={() => setAddLangGoal(opt.key)}
                          activeOpacity={0.85}
                        >
                          {sel && (
                            <View style={[StyleSheet.absoluteFillObject, styles.addLangGoalGlow]} />
                          )}
                          {sel && (
                            <View style={styles.addLangGoalCheckBadge}>
                              <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                            </View>
                          )}
                          <View style={[styles.addLangGoalIconWrap, sel && styles.addLangGoalIconWrapSel]}>
                            <Ionicons
                              name={opt.icon as any}
                              size={26}
                              color={sel ? '#fff' : 'rgba(255,255,255,0.80)'}
                            />
                          </View>
                          <Text style={[styles.addLangGoalLabel, sel && styles.addLangGoalLabelSel]}>
                            {opt.englishTitle}
                          </Text>
                          {addLangGoalLabels[opt.key] && addLangGoalLabels[opt.key] !== opt.englishTitle && (
                            <Text style={styles.addLangGoalHinglish}>
                              {addLangGoalLabels[opt.key]}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                </>
              )}

              {/* Step 3 (no age) or Step 4 (with age) — Skill level selection */}
              {!effectiveIsYoungKid && addLangStep === (needsAgeStep ? 4 : 3) && (
                <>
                <TouchableOpacity
                  style={styles.addLangBackBtn}
                  onPress={() => setAddLangStep((needsAgeStep ? 3 : 2) as any)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="arrow-back-circle" size={26} color={COLORS.text} />
                  <Text style={styles.addLangBackBtnText}>{t('username_step_label_goal')}</Text>
                </TouchableOpacity>
                <Text style={styles.addLangTitle}>{t('username_skill_level_title_with_language', { language: addLangTarget?.englishName ?? addLangTarget?.name ?? '' })}</Text>
                <Text style={styles.addLangSubtitle}>{t('username_skill_level_subtitle')}</Text>
                <View style={styles.addLangSkillList}>
                  {ADD_LANG_SKILL_OPTIONS.map((opt, idx) => {
                    const sel = addLangSkill === opt.key;
                    const barFill = idx + 1;
                    return (
                      <View
                        key={opt.key}
                        style={[{ marginBottom: 14 }, sel && styles.addLangSkillCardWrapSel]}
                      >
                        <TouchableOpacity
                          style={[styles.addLangSkillCard, sel && styles.addLangSkillCardSel]}
                          onPress={() => setAddLangSkill(opt.key)}
                          activeOpacity={0.85}
                        >
                          {sel && (
                            <View style={[StyleSheet.absoluteFillObject, styles.addLangSkillGlow]} />
                          )}
                          <View style={[styles.addLangSkillIcon, sel && styles.addLangSkillIconSel]}>
                            <Ionicons
                              name={opt.icon as any}
                              size={24}
                              color={sel ? '#fff' : COLORS.textSecondary}
                            />
                          </View>
                          <View style={styles.addLangSkillBody}>
                            <Text style={[styles.addLangSkillTitle, sel && styles.addLangSkillTitleSel]}>
                              {t(opt.positiveLabelKey)}
                            </Text>
                            <Text style={[styles.addLangSkillSub, sel && styles.addLangSkillSubSel]}>
                              {t(opt.cardSubtitleKey)}
                            </Text>
                            <View style={styles.addLangSkillBarsRow}>
                              {[1, 2, 3].map(bar => (
                                <View
                                  key={bar}
                                  style={[
                                    styles.addLangSkillBar,
                                    bar <= barFill && (sel ? styles.addLangSkillBarActive : styles.addLangSkillBarFilled),
                                  ]}
                                />
                              ))}
                            </View>
                          </View>
                          {sel && (
                            <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} style={styles.addLangSkillCheck} />
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                </>
              )}
            </ScrollView>

            {/* CTA */}
            <View style={styles.addLangCTAWrap}>
              {(() => {
                const isLastStep = effectiveIsYoungKid || addLangStep === totalAddLangSteps;
                const goalStep = needsAgeStep ? 3 : 2;
                const stepDisabled =
                  effectiveIsYoungKid ? (!addLangTarget || addLangLoading)
                  : addLangStep === 1 ? !addLangTarget
                  : needsAgeStep && addLangStep === 2 ? addLangAge === null
                  : addLangStep === goalStep  ? !addLangGoal
                  : (!addLangSkill || addLangLoading);
                const ctaText = addLangLoading
                  ? t('add_lang_adding_button')
                  : isLastStep
                  ? t('add_lang_confirm_button')
                  : addLangStep === 1
                  ? (needsAgeStep ? t('add_lang_next_choose_age_button') : t('username_next_choose_goal_button'))
                  : addLangStep === 2 && needsAgeStep
                  ? t('username_next_choose_goal_button')
                  : addLangStep === goalStep
                  ? t('username_next_choose_level_button')
                  : t('add_lang_confirm_button');
                const handleCTA = isLastStep
                  ? () => void handleAddLanguageConfirm()
                  : () => setAddLangStep((addLangStep + 1) as any);
                return (
                  <TouchableOpacity
                    style={styles.addLangCTABtn}
                    onPress={handleCTA}
                    disabled={stepDisabled}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={stepDisabled ? ['#161D2E', '#161D2E'] : ['#FF5B2E', '#FF8A4C']}
                      style={StyleSheet.absoluteFillObject}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    />
                    {addLangLoading && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />}
                    <Text style={[styles.addLangCTAText, stepDisabled && styles.addLangCTATextDisabled]}>
                      {ctaText}
                    </Text>
                    {!addLangLoading && !isLastStep && (
                      <Ionicons name="arrow-forward" size={18} color={stepDisabled ? 'rgba(255,255,255,0.25)' : '#fff'} style={{ marginLeft: 8 }} />
                    )}
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>

      {/* Account Menu Modal */}
      <Modal
        visible={showAccountMenu}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowAccountMenu(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAccountMenu(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('language_selection_account_modal_title')}</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowAccountMenu(false)}
              >
                <Ionicons name="close" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.menuList}>
              {localLearning && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowAccountMenu(false);
                    navigateToHistory();
                  }}
                >
                  <Ionicons name="book-outline" size={18} color={COLORS.text} style={styles.menuIcon} />
                  <Text style={styles.menuText}>{t('language_selection_menu_conversation_history')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowAccountMenu(false);
                  Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch((err) => {
                    console.error('[LanguageSelection] Email error:', err);
                    Toast.show(t('language_selection_could_not_open_email_toast'), Toast.SHORT);
                  });
                }}
              >
                <Ionicons name="mail-outline" size={18} color={COLORS.text} style={styles.menuIcon} />
                <Text style={styles.menuText}>{t('language_selection_menu_contact_support')}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowAccountMenu(false);
                  handleLogout();
                }}
              >
                <Ionicons name="log-out-outline" size={18} color={COLORS.text} style={styles.menuIcon} />
                <Text style={styles.menuText}>{t('language_selection_menu_logout')}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDanger]}
                onPress={() => {
                  setShowAccountMenu(false);
                  handleDeleteAccount();
                }}
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.error} style={styles.menuIcon} />
                <Text style={[styles.menuText, styles.menuTextDanger]}>{t('language_selection_menu_delete_account')}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === 'ios' ? 72 : 58,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: Math.max(12, GRADIENT_TAB_BODY_PADDING_TOP - 12),
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingStateText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontFamily: FONTS.regular,
    marginTop: 12,
  },

  // Top Bar (shared metrics with History / Profile — see constants/screenHeader)
  topBarRow: {
    ...GRADIENT_TAB_TOP_BAR,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    maxWidth: '65%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: 10,
  },
  userPhone: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.3,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Premium Banner (kept for future use)
  premiumBanner: {
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  premiumBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  premiumTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  premiumTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  premiumSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.regular,
  },

  // Header Section
  headerSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  heroCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(92, 59, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(92, 59, 255, 0.14)',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  heroBadgeText: {
    color: COLORS.primaryLight,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroBadgeMuted: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroBadgeTextMuted: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  mainTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  mainSubtitle: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 18,
  },
  infoChipRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  infoChip: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoChipLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.medium,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  infoChipValue: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },

  // Badge row — level + tier shown side by side
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  levelBadge: {
    color: COLORS.primaryLight,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    backgroundColor: 'rgba(92, 59, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  tierBadge: {
    color: COLORS.warning,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    backgroundColor: 'rgba(245, 166, 35, 0.14)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },

  // Language Cards
  cardsSection: {
    marginBottom: 28,
  },
  selectionPanel: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  cardLocked: {
    opacity: 0.6,
  },
  selectionRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  selectionRowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 59, 255, 0.12)',
    marginRight: 10,
  },
  selectionRowTextWrap: {
    flex: 1,
  },
  selectionRowLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.medium,
    marginBottom: 4,
  },
  selectionRowValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionRowFlag: {
    fontSize: 20,
    marginRight: 8,
  },
  selectionRowValue: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: FONTS.semiBold,
  },
  selectionRowPlaceholder: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
  cardLeft: {
    flex: 1,
  },
  cardLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.medium,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectedLang: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flagText: {
    fontSize: 32,
    marginRight: 12,
  },
  langName: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: FONTS.semiBold,
  },
  placeholderText: {
    color: COLORS.textDim,
    fontSize: 18,
    fontFamily: FONTS.regular,
  },

  // Connector
  connector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: -6,
    zIndex: 10,
  },
  connectorLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  connectorIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(92, 59, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  connectorModern: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  connectorModernLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  connectorModernIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(92, 59, 255, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  setupNoteCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  setupNoteTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: FONTS.semiBold,
    marginBottom: 8,
  },
  setupNoteText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
    lineHeight: 22,
  },

  // Progress
  progressSection: {
    marginBottom: 28,
  },
  progressSectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 3,
  },
  progressText: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontFamily: FONTS.medium,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  courseCompleteCard: {
    marginTop: 4,
    padding: 20,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
  },
  courseCompleteBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  courseCompleteTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontFamily: FONTS.bold,
    marginBottom: 10,
    textAlign: 'center',
  },
  courseCompleteText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
  },
  courseCompleteButton: {
    width: '100%',
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseCompleteButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.3,
  },

  // Primary Button
  primaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 6,
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: COLORS.text,
    fontSize: 19,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.5,
  },
  ctaPanel: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginTop: 4,
  },
  ctaSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  ctaSummaryText: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
    flexShrink: 1,
  },
  ctaTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: FONTS.bold,
    marginBottom: 6,
  },
  ctaDescription: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
    lineHeight: 20,
    marginBottom: 12,
  },
  ctaPanelCompact: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  ctaCompactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ctaCompactCopy: {
    flex: 1,
    marginRight: 10,
  },
  ctaCompactTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: FONTS.bold,
    marginBottom: 3,
  },
  ctaCompactPair: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  ctaCompactBadge: {
    minWidth: 46,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ctaCompactBadgeText: {
    color: COLORS.primaryLight,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  plansButton: {
    marginTop: 14,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  plansButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: FONTS.medium,
    letterSpacing: 0.3,
  },

  // 1:1 Talking card — orange gradient, tappable as a whole row
  talkingCardOuter: {
    marginTop: 20,
    borderRadius: 18,
    overflow: 'hidden',
    // subtle warm shadow so it pops off the dark background
    shadowColor: '#FF5B2E',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  talkingCardGradient: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  talkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  talkingIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  talkingCopy: {
    flex: 1,
  },
  talkingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  talkingTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.2,
  },
  talkingBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  talkingBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: FONTS.bold,
    letterSpacing: 0.8,
  },
  talkingSubtitle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontFamily: FONTS.medium,
    marginTop: 3,
  },
  talkingHelper: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  talkingChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Loading
  loadingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.medium,
    marginTop: 12,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: FONTS.bold,
    letterSpacing: 0.3,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuList: {
    padding: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 14,
    marginVertical: 4,
    backgroundColor: COLORS.bgSecondary,
  },
  menuIcon: {
    marginRight: 14,
  },
  menuText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 18,
    fontFamily: FONTS.medium,
    letterSpacing: 0.2,
  },
  menuItemDanger: {
    marginTop: 12,
    backgroundColor: 'rgba(229, 72, 77, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229, 72, 77, 0.2)',
  },
  menuTextDanger: {
    color: COLORS.error,
    fontFamily: FONTS.semiBold,
  },

  // ── Onboarding path choice ──────────────────────────────────────────────────
  pathDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  pathDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pathDividerText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.medium,
    marginHorizontal: 10,
    letterSpacing: 0.4,
  },
  chatPathButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,91,46,0.06)',
  },
  chatPathButtonText: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    color: COLORS.primary,
  },
  chatPathNewBadge: {
    marginLeft: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chatPathNewBadgeText: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: '#fff',
  },
  chatPathHelperText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 8,
    lineHeight: 17,
  },

  // ── Home dual-card layout ────────────────────────────────────────────────────
  homeGreeting: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    color: COLORS.primary,
    marginBottom: 4,
  },
  homeTitle: {
    fontSize: 24,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginBottom: 20,
    lineHeight: 38,
  },
  homeCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,91,46,0.25)',
  },
  homeCardPrimary: {
  },
  homeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeCardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,91,46,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  homeCardIconBoxSecondary: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  homeCardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeCardTitle: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    flex: 1,
  },
  homeCardNewBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
  homeCardNewBadgeText: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: '#fff',
  },
  homeCardSubtitle: {
    fontSize: 17,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginBottom: 14,
    lineHeight: 22,
  },
  homeCardLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeCardLevelText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    marginRight: 10,
  },
  homeCardProgressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  homeCardProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  homeCardPrimaryBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 50,
  },
  homeCardPrimaryBtnShadow: {
    borderRadius: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  homeCardPrimaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 8,
    zIndex: 1,
  },
  homeCardSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  homeCardSecondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  pathCard: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: COLORS.bgSecondary,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: COLORS.border,
  padding: 16,
  marginBottom: 12,
},
pathCardChat: {
  borderColor: COLORS.borderStrong,
},
pathCardLeft: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
  marginRight: 10,
},
pathCardIconBox: {
  width: 46,
  height: 46,
  borderRadius: 14,
  backgroundColor: 'rgba(255,91,46,0.12)',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 14,
},
pathCardIconBoxChat: {
  backgroundColor: 'rgba(92,59,255,0.10)',
},
pathCardTextWrap: {
  flex: 1,
},
pathCardTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 4,
},
pathCardTitle: {
  fontSize: 19,
  fontFamily: FONTS.semiBold,
  color: COLORS.text,
},
pathCardSubtitle: {
  fontSize: 16,
  fontFamily: FONTS.regular,
  color: COLORS.textMuted,
  lineHeight: 20,
},
pathCardBadge: {
  marginLeft: 8,
  backgroundColor: COLORS.primary,
  borderRadius: 6,
  paddingHorizontal: 7,
  paddingVertical: 2,
},
pathCardBadgeText: {
  fontSize: 15,
  fontFamily: FONTS.bold,
  color: '#fff',
},
pathHelperText: {
  textAlign: 'center',
  color: COLORS.textMuted,
  fontSize: 16,
  fontFamily: FONTS.regular,
  marginTop: 4,
  lineHeight: 20,
},

  // ── Dashboard stat chips ──────────────────────────────────────────────────
  cardStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: -6,
    marginBottom: 12,
  },
  cardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardStatText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },
  cardStatDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.border,
  },
  dashSectionLabel: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },

  // ── LearningSessionCard (compact horizontal-scroll card) ─────────────────
  lsCard: {
    width: Math.min(width * 0.62, 240),
    minHeight: 185,
    backgroundColor: '#161920',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#2A2D35',
    padding: 14,
    marginRight: 10,
  },
  lsCardFull: {
    width: undefined,
    flex: 1,
    marginRight: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 0,
    minHeight: 0,
  },
  lsCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  lsCardBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,91,46,0.12)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 5,
  },
  lsCardBadgePillText: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    letterSpacing: 0.6,
  },
  lsCardLevelBadge: {
    backgroundColor: 'rgba(255,91,46,0.15)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,91,46,0.30)',
    flexShrink: 0,
  },
  lsCardLevelText: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  lsCardTitle: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    lineHeight: 27,
    marginBottom: 16,
  },
  lsCardTrialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  lsCardSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  lsCardLangSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  lsCardLevelPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  lsCardLevelPillText: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    color: COLORS.textSecondary,
  },
  lsCardSubtitleText: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
    flexShrink: 1,
  },
  lsCardEditIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,91,46,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lsCardProgressInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  lsCardProgressInfoText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
  },
  lsCardProgressPercent: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  lsCardProgressBar: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  lsCardProgressFill: {
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  lsCardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  lsCardStatText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
  lsCardCTA: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  lsCardCTAText: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: '#fff',
    flexShrink: 1,
  },

  lsCardCTADisabled: {
    opacity: 0.6,
  },

  // ── Horizontal scroll container ───────────────────────────────────────────
  lsHScroll: {
    marginBottom: 14,
  },
  lsHScrollContent: {
    paddingRight: 6,
  },
  lsAddCard: {
    width: 88,
    minHeight: 185,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#2A2D35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lsAddCardText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  lsAddBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,87,34,0.35)',
    backgroundColor: 'rgba(255,87,34,0.04)',
  },
  lsAddBelowText: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
    color: COLORS.primary,
  },

  // ── AI Chat Card (purple-themed, content only — aiZone is the container) ──
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiCardIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,87,34,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  aiCardNewBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
  aiCardTitle: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    flex: 1,
  },
  aiCardSubtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    // marginTop:5,
    // lineHeight: 10,
    marginBottom: 0,
  },
  aiCardTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  aiCardTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiCardTagText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },
  aiCardCTA: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCardCTAText: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: '#fff',
  },

  // ── Zone containers ───────────────────────────────────────────────────────
  learnZone: {
    backgroundColor: 'rgba(255,87,34,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,87,34,0.22)',
    borderRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 0,
    marginBottom: 14,
  },
  aiZone: {
    backgroundColor: 'rgba(255,87,34,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,87,34,0.22)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  learnZoneIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,87,34,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  learnZoneLabel: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  learnZoneCountBadge: {
    backgroundColor: 'rgba(255,87,34,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,87,34,0.28)',
  },
  learnZoneCountText: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  aiZoneIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,87,34,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiZoneLabel: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  poweredByBadge: {
    backgroundColor: 'rgba(255,87,34,0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,87,34,0.28)',
  },
  poweredByText: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    letterSpacing: 0.3,
  },

  // ── Add Language bottom sheet ─────────────────────────────────────────────
  addLangOverlay: {
    flex: 1,
    backgroundColor: '#0D1422',
    justifyContent: 'flex-end',
  },
  addLangSheet: {
    flex: 1,
    backgroundColor: '#0D1422',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  addLangDragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  addLangHeader: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  addLangCloseRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  addLangCloseBtn: { padding: 4 },
  addLangStepCirclesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addLangStepCircleWrap: {
    alignItems: 'center',
  },
  addLangStepCircle: {
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
  addLangStepCircleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryLight,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  addLangStepCircleDone: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  addLangStepNum: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: 'rgba(255,255,255,0.50)',
  },
  addLangStepNumActive: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: '#fff',
  },
  addLangStepCircleLabel: {
    fontSize: 18,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 0.3,
  },
  addLangStepCircleLabelActive: {
    color: COLORS.primaryLight,
  },
  addLangStepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    marginTop: 18,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
  },
  addLangStepProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  addLangStepProgressSeg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 4,
  },
  addLangStepProgressSegActive: {
    backgroundColor: COLORS.primary,
  },
  addLangStepPill: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  addLangStepPillText: {
    fontSize: 10,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.6,
  },
  addLangTitle: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    lineHeight: 40,
    marginBottom: 8,
  },
  addLangSubtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: 'rgba(255,255,255,0.68)',
    marginBottom: 24,
    lineHeight: 22,
  },
  addLangBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  addLangBackBtnText: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
    marginLeft: 8,
  },
  addLangBody: {
    paddingHorizontal: 20,
  },
  addLangBodyContent: {
    paddingTop: 4,
    paddingBottom: 16,
  },
  // Language grid (step 1)
  addLangList: {
    flexDirection: 'column',
  },
  addLangLangRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: '#131B2E',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  addLangLangRowSel: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(255,91,46,0.08)',
  },
  addLangLangFlag: {
    fontSize: 32,
    marginRight: 14,
  },
  addLangLangTextWrap: {
    flex: 1,
  },
  addLangLangName: {
    fontSize: 17,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  addLangLangNameSel: {
    color: COLORS.primaryLight,
  },
  addLangLangNative: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  addLangEmpty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  addLangEmptyText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 22,
  },
  // Skill cards (step 2)
  addLangSkillList: {
    paddingBottom: 8,
  },
  addLangSkillCard: {
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
  addLangSkillCardSel: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(255,91,46,0.08)',
  },
  addLangSkillGlow: {
    backgroundColor: 'rgba(255,91,46,0.09)',
    borderRadius: 20,
  },
  addLangSkillIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#15202E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    flexShrink: 0,
  },
  addLangSkillIconSel: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  addLangSkillBody: {
    flex: 1,
  },
  addLangSkillTitle: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: 5,
    lineHeight: 22,
  },
  addLangSkillTitleSel: {
    color: '#FFFFFF',
  },
  addLangSkillSub: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.99)',
    marginBottom: 12,
    lineHeight: 19,
  },
  // CTA
  addLangCTAWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  addLangCTABtn: {
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  addLangCTAText: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: '#fff',
    zIndex: 1,
  },
  addLangCTATextDisabled: {
    color: 'rgba(255,255,255,0.28)',
  },

  // Goal 2-column grid (mirrors UserNameCaptureScreen goal cards)
  addLangGoalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  addLangGoalCardWrap: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  addLangGoalCardWrapRight: {
    paddingLeft: 8,
  },
  addLangGoalCardWrapSelected: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  addLangGoalCard: {
    backgroundColor: '#0D1422',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    minHeight: 168,
    justifyContent: 'space-between',
  },
  addLangGoalCardSelected: {
    backgroundColor: 'rgba(255,91,46,0.08)',
    borderColor: COLORS.primary,
  },
  addLangGoalGlow: {
    backgroundColor: 'rgba(255,91,46,0.09)',
    borderRadius: 20,
  },
  addLangGoalCheckBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
  },
  addLangGoalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  addLangGoalIconWrapSel: {
    backgroundColor: 'rgba(255,91,46,0.22)',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
  addLangGoalLabel: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: 22,
    marginBottom: 4,
  },
  addLangGoalLabelSel: {
    color: '#FFFFFF',
  },
  addLangGoalHinglish: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    color: '#FF5B2E',
    marginBottom: 4,
    lineHeight: 18,
  },

  // Skill card wrap shadow on selected
  addLangSkillCardWrapSel: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },

  // Skill subtitle selected state
  addLangSkillSubSel: {
    color: 'rgba(255,255,255,0.88)',
  },

  // Skill level bars row
  addLangSkillBarsRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  addLangSkillBar: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 5,
  },
  addLangSkillBarFilled: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  addLangSkillBarActive: {
    backgroundColor: COLORS.primary,
  },

  // Skill checkmark icon
  addLangSkillCheck: {
    marginLeft: 8,
    alignSelf: 'center',
  },

  // Age step — dropdown button
  addLangAgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 8,
  },
  addLangAgeBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}12`,
  },
  addLangAgeBtnText: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  addLangAgeBtnPlaceholder: {
    color: COLORS.textDim,
  },

  // Age picker modal
  agePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  agePickerSheet: {
    backgroundColor: '#0D1422',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  agePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    marginBottom: 4,
  },
  agePickerTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  agePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 48,
  },
  agePickerItemSelected: {
    backgroundColor: `${COLORS.primary}18`,
  },
  agePickerItemText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  agePickerItemTextSelected: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
  },
});