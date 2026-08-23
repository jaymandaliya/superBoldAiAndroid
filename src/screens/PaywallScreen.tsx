import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import Video from 'react-native-video';
import Toast from 'react-native-simple-toast';
import { CFPaymentGatewayService, CFErrorResponse } from 'react-native-cashfree-pg-sdk';
import { CFSubscriptionSession } from 'cashfree-pg-api-contract';
import { RootStackParamList } from '../navigation/types';
import { Learning } from '../types';
import { COLORS, FONTS, TERMS_URL, PRIVACY_URL, BACKEND_URL, LEARNING_URL, YOUR_COMPUTER_IP, CONNECTION_TIMEOUT } from '../constants';
import { LANGUAGES } from '../constants/languages';
import { CrashlyticsHelper, AuthStorage, NetworkHelper } from '../helpers';
import { useI18n } from '../localization';
import { useResolvedNativeLanguage } from '../hooks/useResolvedNativeLanguage';
import { toCFEnvironment } from '../payment/cashfreeConfig';
import {
  fetchAndroidPaywall,
  createCashfreeSubscription,
  verifyCashfreeSubscription,
  fetchCashfreeSubscriptionStatus,
  CashfreeAndroidPaywall,
} from '../payment/cashfreeSubscriptionService';
import { useCashfreeSubscription } from '../payment/useCashfreeSubscription';
import { PaymentSuccessOverlay } from './room/components/PaymentSuccessOverlay';

type Props = NativeStackScreenProps<RootStackParamList, 'Paywall'>;

const CHECK_KEYS = [
  'paywall_trial_badge_no_judgement',
  'paywall_trial_badge_no_shaming',
  'paywall_trial_badge_no_fear',
] as const;

// Purely decorative "community" avatars — initials on brand-colored circles,
// never presented as real photos/testimonials (no fabricated names/reviews).
const AVATAR_STACK = [
  { initial: 'A', color: '#FF5B2E' },
  { initial: 'P', color: '#7C6BFF' },
  { initial: 'R', color: '#F2C94C' },
  { initial: 'S', color: '#3DCC8F' },
];

// Reuses the same feature copy as the existing in-app premium upsell surfaces
// (`premium_paywall_feature_*`, already translated into ~35 languages) instead
// of inventing new claims — these describe real, shipped app capabilities.
const BENEFITS = [
  { key: 'premium_paywall_feature_unlimited_ai', icon: 'chatbubbles-outline' as const },
  { key: 'premium_paywall_feature_unlock_levels', icon: 'flash-outline' as const },
  { key: 'premium_paywall_feature_any_language', icon: 'globe-outline' as const },
  { key: 'premium_paywall_feature_priority_support', icon: 'headset-outline' as const },
];

export function PaywallScreen({ navigation, route }: Props) {
  const { user, existingLearning, nextStep } = route.params;
  const { t } = useI18n();

  const [isReady, setIsReady] = useState(false);
  const [paywallData, setPaywallData] = useState<CashfreeAndroidPaywall | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const [failedVideoUrls, setFailedVideoUrls] = useState<string[]>([]);
  const [heroVideoReady, setHeroVideoReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<{
    message: string;
    transactionId?: string;
    learning?: Learning | null;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const authTokenRef = useRef<string | null>(null);
  const subscriptionIdRef = useRef<string | null>(null);

  // This sheet must never render on iOS (App Store 3.1.1 forbids external purchase
  // flows for digital content) — the same rule CashfreeSubscriptionScreen follows.
  useEffect(() => {
    if (Platform.OS !== 'android') {
      navigation.goBack();
    }
  }, [navigation]);

  // Same resolution order onboarding already uses elsewhere (UserNameCaptureScreen):
  // live i18n selection (set as soon as OnboardingLanguageModal runs) → existingLearning
  // → last-persisted-for-this-user → 'en'.
  const resolvedNativeLanguage = useResolvedNativeLanguage(String(user.id), existingLearning?.native_language);

  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => setIsReady(true), 350);
      return () => { clearTimeout(timer); setIsReady(false); };
    }, []),
  );

  const slideAnim = useRef(new Animated.Value(24)).current;
  const heroScaleAnim = useRef(new Animated.Value(0.85)).current;
  const ctaPressAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const bobAnim = useRef(new Animated.Value(0)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // No opacity fade-in here on purpose — content must never depend on an
    // animation completing to become visible. Slide/scale are purely cosmetic.
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 480, useNativeDriver: true }),
      Animated.spring(heroScaleAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 9 }),
    ]).start();

    // Hero glow "breathing" pulse — signals the AI coach is alive/listening.
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();

    // Gentle float, so the character reads as illustrated rather than a static icon.
    Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(bobAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    ).start();

    // Occasional blink — a small "alive" cue, deliberately infrequent so it reads
    // as a personality tic rather than a distracting loop.
    const blink = () => {
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.12, duration: 90, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
      ]).start(() => {
        blinkTimer = setTimeout(blink, 2600 + Math.random() * 1400);
      });
    };
    let blinkTimer = setTimeout(blink, 2200);

    return () => clearTimeout(blinkTimer);
  }, []);

  const onCtaPressIn = () =>
    Animated.spring(ctaPressAnim, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onCtaPressOut = () =>
    Animated.spring(ctaPressAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  const glowOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] });
  const glowScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const heroBobY = bobAnim.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] });

  // ── Localized paywall copy + Cashfree offer shape (headline, offer box, CTA
  // text, hero video, plan id) — never hardcoded, comes from the backend so
  // flipping trial mode / pricing server-side doesn't require an app release.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await AuthStorage.getToken();
      if (token) authTokenRef.current = token;
      const { ok, paywall } = await fetchAndroidPaywall(resolvedNativeLanguage);
      if (!cancelled && ok && paywall) setPaywallData(paywall);
    })();
    return () => { cancelled = true; };
  }, [resolvedNativeLanguage]);

  const offer = paywallData?.offer ?? null;
  const content = paywallData?.content ?? null;
  const box = content?.box ?? null;

  const heroVideoUrl =
    paywallData?.videoUrl && !failedVideoUrls.includes(paywallData.videoUrl)
      ? paywallData.videoUrl
      : null;
  useEffect(() => {
    setHeroVideoReady(false);
  }, [heroVideoUrl]);

  const trialDays = offer?.trialDays ?? 3;
  // Cashfree's REST paywall already returns full pricing synchronously — unlike
  // StoreKit, there's no separate native-catalog round trip to wait on.
  const priceReady = Boolean(offer?.recurringPrice);
  const monthlyPrice = offer?.recurringPrice ?? null;
  // §6 of the architecture doc: authorizationAmountRefunded=true is the free-trial
  // shape (₹1 authorized then refunded); false is the paid-intro shape (₹5 kept).
  const isFreeTrialOffer = offer?.authorizationAmountRefunded ?? true;
  const trialPrice = isFreeTrialOffer
    ? t('paywall_trial_free_price_label')
    : (offer?.trialPrice ?? monthlyPrice);
  const topBadgeText = isFreeTrialOffer
    ? t('paywall_trial_free_days_badge', { days: trialDays })
    : (offer?.discountLabel || t('paywall_trial_urgency_badge'));
  const showTopBadge = isFreeTrialOffer || Boolean(offer?.discountLabel);

  // ── Where to go once premium access is secured (real purchase or restore) —
  // both remaining triggers are real paid-content gates, not onboarding steps,
  // so there is no free skip past either one; this only ever runs on success. ──
  const proceed = async (unlockedLearning?: Learning | null) => {
    const learningForNext = unlockedLearning ?? existingLearning;
    if (nextStep === 'TalkingSession') {
      navigation.reset({
        index: 1,
        routes: [
          { name: 'MainTabs', params: { user, existingLearning: learningForNext } },
          { name: 'TalkingSession', params: { user } },
        ],
      });
      return;
    }

    // 'LanguageSelection' path — mirrors UserNameCaptureScreen's own post-save
    // behavior: try to connect directly to the room this onboarding was building
    // toward, falling back to the home dashboard if anything about that fails.
    if (learningForNext?.id && learningForNext.native_language && learningForNext.target_language) {
      try {
        const isOnline = await NetworkHelper.checkConnection();
        if (isOnline) {
          const nativeLang = LANGUAGES.find(l => l.code === learningForNext.native_language);
          const targetLang = LANGUAGES.find(l => l.code === learningForNext.target_language);
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
                  participantName: user.phone_number || 'User_' + Date.now(),
                  nativeLanguage: learningForNext.native_language,
                  targetLanguage: learningForNext.target_language,
                  nativeLanguageName: nativeLang?.name || '',
                  targetLanguageName: targetLang?.name || '',
                  currentLevel: learningForNext.current_level ?? 0,
                  learningId: String(learningForNext.id),
                  userName: user.name || '',
                  authToken: roomToken,
                  isPremium: true,
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
                  { name: 'MainTabs', params: { user, existingLearning: learningForNext } },
                  { name: 'Room', params: { user, learning: learningForNext, token: roomData.token, url: roomUrl, onboardingContext: onboardingCtx } },
                ],
              });
              return;
            }
          }
        }
      } catch (e) {
        CrashlyticsHelper.recordError(e as Error, 'PaywallScreen.connectToRoom');
      }
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { user, existingLearning: learningForNext } }],
    });
  };

  const handlePaymentSuccessContinue = () => {
    const snap = paymentSuccess;
    if (!snap) return;
    setPaymentSuccess(null);
    void proceed(snap.learning);
  };

  const handlePaymentSuccessDashboard = () => {
    const snap = paymentSuccess;
    if (!snap) return;
    setPaymentSuccess(null);
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { user, existingLearning: snap.learning ?? existingLearning } }],
    });
  };

  // Native SDK fires this after the mandate authorization UI it opened is done — it
  // only confirms the client-side flow ended. /verify re-fetches from Cashfree
  // server-side and is the only thing that actually grants access.
  useCashfreeSubscription({
    onVerify: async () => {
      const token = authTokenRef.current;
      const subscriptionId = subscriptionIdRef.current;
      if (!token || !subscriptionId) {
        setIsProcessing(false);
        Toast.show(t('language_selection_payment_received_message'), Toast.LONG);
        return;
      }
      const { ok, data } = await verifyCashfreeSubscription(token, subscriptionId);
      setIsProcessing(false);
      if (!ok || !data) {
        Toast.show(t('language_selection_payment_received_message'), Toast.LONG);
        void proceed();
        return;
      }
      setPaymentSuccess({
        message: t('language_selection_premium_welcome_message'),
        transactionId: subscriptionId,
        learning: existingLearning ? { ...existingLearning, is_premium: true } : existingLearning,
      });
    },
    onError: (error: CFErrorResponse) => {
      setIsProcessing(false);
      if (error.getStatus() !== 'CANCELLED') {
        CrashlyticsHelper.recordError(new Error(error.getMessage() || 'Cashfree subscription error'), 'cashfreeError:paywall');
        Toast.show(t('language_selection_payment_failed_message'), Toast.LONG);
      }
    },
  });

  const handleStartTrial = async () => {
    if (!isReady || isProcessing) return;
    if (!offer?.planId) {
      Toast.show(t('premium_paywall_price_unavailable'), Toast.LONG);
      return;
    }
    const token = authTokenRef.current ?? (await AuthStorage.getToken());
    if (!token) {
      Toast.show(t('language_selection_payment_failed_message'), Toast.LONG);
      return;
    }
    authTokenRef.current = token;

    setIsProcessing(true);
    const { ok, data } = await createCashfreeSubscription(token, offer.planId);
    if (!ok || !data) {
      setIsProcessing(false);
      Toast.show(t('language_selection_payment_failed_message'), Toast.LONG);
      return;
    }

    subscriptionIdRef.current = data.subscription_id;
    const session = new CFSubscriptionSession(
      data.subscription_session_id,
      data.subscription_id,
      toCFEnvironment(data.sdk_environment)
    );
    CFPaymentGatewayService.doSubscriptionPayment(session);
  };

  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      const token = authTokenRef.current ?? (await AuthStorage.getToken());
      if (!token) {
        Toast.show(t('paywall_trial_no_purchases_found'), Toast.LONG);
        return;
      }
      const { ok, data } = await fetchCashfreeSubscriptionStatus(token);
      if (ok && data?.active) {
        setPaymentSuccess({
          message: t('language_selection_premium_welcome_message'),
          learning: existingLearning ? { ...existingLearning, is_premium: true } : existingLearning,
        });
      } else {
        Toast.show(t('paywall_trial_no_purchases_found'), Toast.LONG);
      }
    } catch {
      Toast.show(t('language_selection_payment_failed_message'), Toast.LONG);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleScroll = (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollHint(distanceFromBottom > 40);
  };

  const handleScrollHintPress = () => {
    scrollRef.current?.scrollTo({ y: 9999, animated: true });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#080C16" translucent={false} />

      <View style={styles.bgOrbTop} pointerEvents="none" />
      <View style={styles.bgOrb1} pointerEvents="none" />
      <View style={styles.bgOrb2} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        {/* No skip control — both remaining triggers (TalkingSession,
            LanguageSelection) are real paid-content gates, not onboarding
            steps, so there's nothing free to skip to. */}

        <View style={styles.scrollWrap}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          onScroll={handleScroll}
          scrollEventThrottle={32}
        >
          <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
            {heroVideoUrl && (
              <View style={[styles.heroVideoWrap, !heroVideoReady && styles.heroVideoWrapCollapsed]}>
                <LinearGradient
                  colors={[COLORS.gradientStart ?? '#FF5B2E', COLORS.gradientEnd ?? '#FF8A4C']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Video
                  key={heroVideoUrl}
                  source={{ uri: heroVideoUrl }}
                  style={styles.heroVideo}
                  resizeMode="cover"
                  controls
                  paused={false}
                  onLoad={() => {
                    CrashlyticsHelper.log(`[PaywallScreen] heroVideo loaded: ${heroVideoUrl}`);
                    setHeroVideoReady(true);
                  }}
                  onError={(error) => {
                    CrashlyticsHelper.log(
                      `[PaywallScreen] heroVideo failed to load: videoUrl=${heroVideoUrl} error=${JSON.stringify(error)}`
                    );
                    setFailedVideoUrls((prev) => (prev.includes(heroVideoUrl) ? prev : [...prev, heroVideoUrl]));
                  }}
                  ignoreSilentSwitch="ignore"
                />
              </View>
            )}

            <View style={styles.headlineWrap}>
              <Text style={styles.headline}>{content?.heroTitle || t('paywall_trial_painpoint')}</Text>
              <View style={styles.squiggleWrap}>
                <View style={styles.squiggle} />
              </View>
            </View>

            <View style={styles.heroSection}>
              <Animated.View
                style={[styles.heroWrap, { transform: [{ scale: heroScaleAnim }, { translateY: heroBobY }] }]}
              >
                <Animated.View
                  style={[styles.heroGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
                />
                <View style={styles.heroRing} />
                <View style={styles.heroRingOuter} />
                <LinearGradient
                  colors={[COLORS.gradientStart ?? '#FF5B2E', COLORS.gradientEnd ?? '#FF8A4C']}
                  style={styles.heroCircle}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.faceEyesRow}>
                    <Animated.View style={[styles.faceEye, { transform: [{ scaleY: blinkAnim }] }]} />
                    <Animated.View style={[styles.faceEye, { transform: [{ scaleY: blinkAnim }] }]} />
                  </View>
                  <View style={styles.faceSmile} />
                </LinearGradient>
                <View style={styles.heroAiBadge}>
                  <Ionicons name="sparkles" size={12} color="#fff" />
                  <Text style={styles.heroAiBadgeText}>SuperBold</Text>
                </View>
                <Ionicons name="sparkles" size={16} color="rgba(255,255,255,0.4)" style={styles.sparkle1} />
                <Ionicons name="star" size={11} color="rgba(124,107,255,0.55)" style={styles.sparkle2} />
              </Animated.View>
              <Text style={styles.speakLearn}>{t('paywall_trial_speak_learn')}</Text>
            </View>

            <View style={styles.checksRow}>
              {CHECK_KEYS.map((key, i) => (
                <React.Fragment key={key}>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark" size={18} color={COLORS.accent ?? '#7C6BFF'} />
                    <Text style={styles.checkText} numberOfLines={1}>{t(key)}</Text>
                  </View>
                  {i < CHECK_KEYS.length - 1 && <View style={styles.checkDivider} />}
                </React.Fragment>
              ))}
            </View>

            <View style={styles.trustBanner}>
              <Ionicons name="ribbon" size={15} color="#F2C94C" />
              <Text style={styles.trustText}>{t('paywall_trial_trust_banner')}</Text>
              <Ionicons name="ribbon" size={15} color="#F2C94C" />
            </View>

            <View style={styles.statRow}>
              <Ionicons name="leaf-outline" size={16} color="#F2C94C" />
              <Ionicons name="star" size={14} color="#F2C94C" />
              <Text style={styles.statValue}>{t('paywall_trial_rating_value')}</Text>
              <Text style={styles.statLabel}>{t('paywall_trial_rating_label')}</Text>
              <View style={styles.statDivider} />
              <Text style={styles.statValue}>{t('paywall_trial_reviews_value')}</Text>
              <Text style={styles.statLabel}>{t('paywall_trial_reviews_label')}</Text>
              <Ionicons name="leaf-outline" size={16} color="#F2C94C" />
            </View>

            <Text style={styles.improveLine}>
              <Text style={styles.improvePercent}>{t('paywall_trial_improvement_percent')} </Text>
              {t('paywall_trial_improvement_text')}
            </Text>

            <View style={styles.offerCardOuter}>
              <View style={styles.offerCard}>
                <View style={styles.offerEyebrow}>
                  <Text style={styles.offerEyebrowText}>{box?.header || t('paywall_trial_special_offer')}</Text>
                </View>

                <View style={styles.timelineRow}>
                  <View style={styles.timelineNodeCol}>
                    <View style={styles.timelineNodeActive}>
                      <Ionicons name="flash" size={13} color="#fff" />
                    </View>
                    <View style={styles.timelineConnector} />
                  </View>
                  <View style={styles.timelineTextCol}>
                    <View style={styles.timelineTitleRow}>
                      <Text style={styles.timelinePriceText}>
                        {isFreeTrialOffer
                          ? t('paywall_trial_timeline_trial_title_free', { days: trialDays })
                          : (box?.trialTitle ||
                              (trialPrice !== null
                                ? t('paywall_trial_timeline_trial_title', { price: trialPrice, days: trialDays })
                                : '…'))}
                      </Text>
                    </View>
                    <Text style={styles.timelineDesc}>
                      {t('paywall_trial_timeline_trial_desc', { days: trialDays })}
                    </Text>
                  </View>
                </View>

                <View style={styles.timelineRow}>
                  <View style={styles.timelineNodeCol}>
                    <View style={styles.timelineNode}>
                      <Ionicons name="sync" size={13} color="rgba(255,255,255,0.6)" />
                    </View>
                  </View>
                  <View style={styles.timelineTextCol}>
                    <Text style={styles.timelineTitle}>
                      {box?.recurringTitle ||
                        (priceReady && monthlyPrice
                          ? t('paywall_trial_timeline_renew_title', { price: monthlyPrice })
                          : '…')}
                    </Text>
                    <Text style={styles.timelineDesc}>{t('paywall_trial_timeline_renew_desc')}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.benefitsCardOuter}>
              <View style={styles.benefitsLabelPill}>
                <Text style={styles.benefitsLabelText}>{t('paywall_trial_benefits_label')}</Text>
              </View>
              <View style={styles.benefitsGrid}>
                {(content?.features?.length ? content.features : null)?.map((feature, i) => (
                  <View key={feature} style={styles.benefitItem}>
                    <Ionicons name={BENEFITS[i % BENEFITS.length].icon} size={22} color={COLORS.accent ?? '#7C6BFF'} />
                    <Text style={styles.benefitText}>{feature}</Text>
                  </View>
                )) ??
                  BENEFITS.map(({ key, icon }) => (
                    <View key={key} style={styles.benefitItem}>
                      <Ionicons name={icon} size={22} color={COLORS.accent ?? '#7C6BFF'} />
                      <Text style={styles.benefitText}>{t(key)}</Text>
                    </View>
                  ))}
              </View>
            </View>

            <View style={styles.socialCard}>
              <View style={styles.avatarStack}>
                {AVATAR_STACK.map((a, i) => (
                  <View
                    key={a.initial}
                    style={[styles.avatarCircle, { backgroundColor: a.color }, i > 0 && styles.avatarOverlap]}
                  >
                    <Text style={styles.avatarInitial}>{a.initial}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.socialText}>{t('paywall_trial_trust_banner')}</Text>
            </View>
          </Animated.View>
        </ScrollView>

        {showScrollHint && (
          <TouchableOpacity
            style={styles.scrollHintBtn}
            onPress={handleScrollHintPress}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-down" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        </View>

        <View style={styles.ctaSheet}>
          {showTopBadge && (
            <View style={styles.discountFloatWrap}>
              <View style={styles.discountPill}>
                <Text style={styles.discountPillText}>{topBadgeText}</Text>
              </View>
            </View>
          )}

          <Animated.View
            style={[styles.ctaButtonShadow, { transform: [{ scale: ctaPressAnim }] }]}
          >
            <TouchableOpacity
              onPress={handleStartTrial}
              onPressIn={onCtaPressIn}
              onPressOut={onCtaPressOut}
              disabled={!isReady || isProcessing || !priceReady}
              activeOpacity={1}
              style={styles.ctaButton}
            >
              <LinearGradient
                colors={['#FF5B2E', '#FF8A4C']}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              {isProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={styles.ctaContentRow}>
                  <Text style={styles.ctaText}>
                    {isFreeTrialOffer
                      ? t('paywall_trial_cta_try_free')
                      : (trialPrice !== null
                          ? t('paywall_trial_cta_try_premium', { price: trialPrice })
                          : '…')}
                  </Text>
                  {isFreeTrialOffer && <Text style={styles.ctaStrike}>{priceReady ? monthlyPrice : '…'}</Text>}
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>

          <Text style={styles.ctaSub}>{content?.chargeReminder || t('paywall_pay_start_learning')}</Text>

          <View style={styles.footerLinksRow}>
            <TouchableOpacity onPress={handleRestore} disabled={isRestoring} activeOpacity={0.7}>
              <Text style={styles.footerLinkText}>
                {isRestoring ? t('paywall_trial_cta_processing') : (content?.restore || t('paywall_trial_footer_restore'))}
              </Text>
            </TouchableOpacity>
            <View style={styles.footerDot} />
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)} activeOpacity={0.7}>
              <Text style={styles.footerLinkText}>{content?.terms || t('paywall_trial_footer_terms')}</Text>
            </TouchableOpacity>
            <View style={styles.footerDot} />
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)} activeOpacity={0.7}>
              <Text style={styles.footerLinkText}>{content?.privacy || t('paywall_trial_footer_privacy')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {paymentSuccess && (
        <PaymentSuccessOverlay
          message={paymentSuccess.message}
          transactionId={paymentSuccess.transactionId}
          onContinueLearning={handlePaymentSuccessContinue}
          onGoToDashboard={handlePaymentSuccessDashboard}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080C16' },
  safeArea: { flex: 1 },

  bgOrbTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,91,46,0.05)',
    top: -40,
    left: '50%',
    marginLeft: -110,
  },
  bgOrb1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(124,107,255,0.08)',
    top: -100,
    left: -110,
  },
  bgOrb2: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(96,24,40,0.30)',
    bottom: -60,
    right: -90,
  },

  scrollWrap: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 32 },

  heroVideoWrap: {
    marginHorizontal: -22,
    marginTop: -10,
    marginBottom: 28,
    height: 220,
    overflow: 'hidden',
    backgroundColor: '#0D1422',
  },
  heroVideoWrapCollapsed: { height: 0, marginTop: 0, marginBottom: 0 },
  heroVideo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },

  headlineWrap: { marginBottom: 32 },
  headline: {
    fontSize: 25,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  squiggleWrap: { marginTop: 4, alignItems: 'flex-start' },
  squiggle: {
    width: 70,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F2C94C',
    transform: [{ rotate: '-4deg' }],
  },

  heroSection: { alignItems: 'center', marginBottom: 30 },
  heroWrap: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(124,107,255,0.22)',
  },
  heroRingOuter: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  heroRing: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF5B2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  faceEyesRow: { flexDirection: 'row', gap: 12, marginBottom: 7 },
  faceEye: { width: 8, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  faceSmile: {
    width: 28,
    height: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderBottomWidth: 3.5,
    borderColor: '#fff',
  },
  heroAiBadge: {
    position: 'absolute',
    bottom: 2,
    right: -6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.accent ?? '#7C6BFF',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: '#080C16',
  },
  heroAiBadgeText: { fontSize: 9.5, fontFamily: FONTS.bold, color: '#fff' },
  sparkle1: { position: 'absolute', top: -2, left: 4 },
  sparkle2: { position: 'absolute', bottom: 22, left: -10 },
  speakLearn: {
    marginTop: 20,
    marginBottom: 6,
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 25,
  },

  checksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 28,
  },
  checkItem: { alignItems: 'center', gap: 6 },
  checkText: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    color: 'rgba(255,255,255,0.85)',
  },
  checkDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.18)' },

  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(242,201,76,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(242,201,76,0.35)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 24,
    justifyContent: 'center',
  },
  trustText: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: '#F7D97A',
    textAlign: 'center',
    lineHeight: 19,
    flexShrink: 1,
  },

  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 10,
  },
  statValue: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.text },
  statLabel: { fontSize: 11, fontFamily: FONTS.medium, color: 'rgba(255,255,255,0.55)' },
  statDivider: { width: 1, height: 13, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 2 },

  improveLine: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 32,
  },
  improvePercent: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.accent ?? '#7C6BFF',
  },

  offerCardOuter: { width: '100%', marginBottom: 28 },
  offerCard: {
    backgroundColor: '#0D1422',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 21,
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  offerEyebrow: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124,107,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(124,107,255,0.32)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 18,
  },
  offerEyebrowText: { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.accent ?? '#7C6BFF', letterSpacing: 0.3 },

  timelineRow: { flexDirection: 'row' },
  timelineNodeCol: { alignItems: 'center', width: 28 },
  timelineNode: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineNodeActive: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineConnector: {
    width: 1.5,
    flex: 1,
    minHeight: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 2,
  },
  timelineTextCol: { flex: 1, paddingLeft: 14, paddingBottom: 20 },
  timelineTitleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  timelinePriceText: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.text },
  timelineTitle: { fontSize: 14.5, fontFamily: FONTS.semiBold, color: 'rgba(255,255,255,0.75)', marginBottom: 3 },
  timelineDesc: {
    fontSize: 12.5,
    fontFamily: FONTS.regular,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
    marginTop: 3,
  },

  benefitsCardOuter: {
    width: '100%',
    backgroundColor: '#0D1422',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 16,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  benefitsLabelPill: {
    backgroundColor: 'rgba(124,107,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(124,107,255,0.32)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 18,
  },
  benefitsLabelText: { fontSize: 12.5, fontFamily: FONTS.bold, color: COLORS.accent ?? '#7C6BFF', letterSpacing: 0.3 },
  benefitsGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  benefitItem: { width: '50%', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 8 },
  benefitText: { fontSize: 12, fontFamily: FONTS.semiBold, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },

  socialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0D1422',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#0D1422',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarOverlap: { marginLeft: -9 },
  avatarInitial: { fontSize: 11, fontFamily: FONTS.bold, color: '#fff' },
  socialText: { flex: 1, fontSize: 12, fontFamily: FONTS.semiBold, color: 'rgba(255,255,255,0.75)', flexShrink: 1 },

  scrollHintBtn: {
    position: 'absolute',
    right: 20,
    bottom: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.accent ?? '#7C6BFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  ctaSheet: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#0B0F1A',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  discountFloatWrap: { alignItems: 'center', marginBottom: -6 },
  discountPill: {
    backgroundColor: '#101828',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 5,
    zIndex: 1,
  },
  discountPillText: { fontSize: 11, fontFamily: FONTS.bold, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.3 },
  ctaButtonShadow: {
    borderRadius: 16,
    shadowColor: '#FF5B2E',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    shadowOpacity: 0.5,
    elevation: 14,
    marginTop: 12,
  },
  ctaButton: {
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 58,
  },
  ctaContentRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, zIndex: 1 },
  ctaText: { fontSize: 16, fontFamily: FONTS.bold, color: '#fff' },
  ctaStrike: { fontSize: 13, fontFamily: FONTS.medium, color: 'rgba(255,255,255,0.6)', textDecorationLine: 'line-through' },
  ctaSub: {
    textAlign: 'center',
    fontSize: 11.5,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.42)',
    marginTop: 10,
  },

  footerLinksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  footerLinkText: { fontSize: 11, fontFamily: FONTS.medium, color: 'rgba(255,255,255,0.4)' },
  footerDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.25)' },
});
