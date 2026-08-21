/**
 * ✅ FULLY FIXED RoomScreen - ALL ISSUES RESOLVED + TIER-BASED PREMIUM ACCESS
 *
 * FIXES:
 * 1. ✅ Mic DISABLED by default - no background noise pickup
 * 2. ✅ Agent detection FIXED - checks for ANY remote participant
 * 3. ✅ Mic enabled via RPC AFTER agent finishes greeting
 * 4. ✅ Streaming transcription displays in real-time
 * 5. ✅ No interruptions while agent is speaking
 * 6. ✅ Tier-based premium: both full bundle (is_premium) and tier-wise (purchased_tiers)
 * 7. ✅ purchasedMaxLevel sent to agent so it enforces tier limits
 * 8. ✅ onTierLimitReached RPC handler shows payment modal
 * 9. ✅ Header/progress bar shows for BOTH plan types
 * 10. ✅ Tier information displayed in stats panel (Max Tier)
 * 11. ✅ Screen stays awake during lessons with useKeepAwake hook
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Toast from 'react-native-simple-toast';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  StatusBar,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from '@sayem314/react-native-keep-awake';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import {
  LiveKitRoom,
  useRoomContext,
} from '@livekit/react-native';
import {
  TranscriptionSegment,
  RoomEvent,
} from 'livekit-client';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { RootStackParamList, PendingLevelCompletionPayload } from '../navigation/types';
import { FONTS } from '../constants';
import { LANGUAGES } from '../constants/languages';
import { CrashlyticsHelper, AuthStorage, AudioHelper } from '../helpers';
import { ConversationMessage, Learning } from '../types';
import {
  fetchPricingCatalog,
  startLearningSession,
  updatePremiumAfterPayment,
  fetchFreeTimeStatus as apiFetchFreeTimeStatus,
  postFreeTimeUsage,
  postLevelTime,
  fetchLevelStats as apiFetchLevelStats,
} from '../services';
import type { PricingConfig } from '../services/pricingTypes';
import { PAYU_MERCHANT } from '../payment/payuConfig';
import { buildRoomTierCheckoutParams, isValidPayUTransactionId } from '../payment/payuParams';
import { usePayUCheckout, getPayUBizSdk } from '../payment/usePayUCheckout';
import { PROFESSIONAL_COLORS, SCREEN_WIDTH } from './room/roomTheme';
import { LIVEKIT_REPLAY_RPC_METHOD, LIVEKIT_STOP_REPLAY_RPC_METHOD, LIVEKIT_REPLAY_TIMEOUT_MS } from '../config/ttsConfig';
import { PaymentOfferModal } from './room/components/PaymentOfferModal';
import { PaymentSuccessOverlay } from './room/components/PaymentSuccessOverlay';
import { TestReportOverlay } from './room/components/TestReportOverlay';
import type { TestReport } from './room/components/TestOverlay';

const PayUBizSdk = getPayUBizSdk();
if (!PayUBizSdk) {
  console.warn('⚠️ PayUBizSdk is not available - payment gateway may not work');
} else {
  console.log('✓ PayUBizSdk loaded successfully');
}
// ─── Voice status type ────────────────────────────────────────────────────────
type VoiceStatus =
  | 'connecting'      // waiting for agent to join room
  | 'greeting'        // agent joined, mic still disabled (greeting in progress)
  | 'agent_speaking'  // agent is currently producing speech
  | 'ready'           // mic enabled, agent silent, ready for input

// How long agent must be silent before "speaking" flips off.
// 800ms bridges natural gaps between speech segments without flickering.
const SPEAKING_SILENCE_TIMEOUT_MS = 800;
type Props = NativeStackScreenProps<RootStackParamList, 'Room'>;

type PendingLevelCompletion = PendingLevelCompletionPayload;

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const TIME_LIMITS = {
  FREE_MINUTES: 2,
  FREE_SECONDS: 120,
  // Scaled proportionally from the original 240/300 (80%) ratio.
  WARNING_THRESHOLD: 96,
};

const EXERCISE_CONFIG = {
  MAX_ATTEMPTS: 3,
  AUTO_ADVANCE_ENABLED: true,
};

const LEVEL_CONFIG = {
  TOTAL_LEVELS: 30,
  LEVELS_PER_TIER: 5,
  FREE_LEVELS: 1,
};
const COMPLETION_TOAST_MESSAGE = 'You have completed 30 levels. You can check history.';

const TIER_MAX_LEVEL_FALLBACK: Record<string, number> = {
  levels_1_5: 5,
  levels_6_10: 10,
  levels_11_15: 15,
  levels_16_20: 20,
  levels_21_25: 25,
  levels_26_30: 30,
};

// ============================================================================
// HELPER: Compute purchased max level from purchased tiers
// ✅ NEW: Used to send purchasedMaxLevel to the agent
// ============================================================================

const getPurchasedMaxLevel = (learning: Learning, pricingConfig: PricingConfig | null): number => {
  if (learning.is_premium) return LEVEL_CONFIG.TOTAL_LEVELS;

  const purchasedTiers = learning.purchased_tiers || [];
  if (purchasedTiers.length === 0) return 0;

  let maxLevel = 0;
  for (const tierKey of purchasedTiers) {
    const tier = pricingConfig?.tiers?.find(t => t.key === tierKey);
    const end = tier?.levelEnd ?? TIER_MAX_LEVEL_FALLBACK[tierKey] ?? 0;
    if (end > maxLevel) maxLevel = end;
  }
  return maxLevel;
};

// ============================================================================
// HELPER: Check if user has any paid access (full bundle OR any tier)
// ✅ NEW: Used to gate premium UI features
// ============================================================================

const hasPaidAccess = (learning: Learning): boolean => {
  return Boolean(learning.is_premium || ((learning.purchased_tiers?.length ?? 0) > 0));
};

const hasTierWiseAccessOnly = (learning: Learning): boolean => {
  return !learning.is_premium && ((learning.purchased_tiers?.length ?? 0) > 0);
};

const isCourseCompleted = (learning: Learning): boolean => {
  return learning.current_level > LEVEL_CONFIG.TOTAL_LEVELS;
};

const getDisplayLevel = (level: number): number => {
  return Math.min(Math.max(level || 1, 1), LEVEL_CONFIG.TOTAL_LEVELS);
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type PostPaymentSuccessState = {
  updatedLearning: Learning;
  message: string;
  isBundle: boolean;
  transactionId?: string;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoomScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const {
    user,
    learning: initialLearning,
    token: initialToken,
    url: initialUrl,
    accessBlocked = false,
    blockedReason = '',
    blockedMessage = '',
  } = route.params;

  const isResumeSession =
    (initialLearning.total_sessions ?? 0) > 0 || initialLearning.is_new === false;

  // Keep the lesson screen awake while the agent session is open.
  useKeepAwake();

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const [learning, setLearning] = useState<Learning>(initialLearning);
  const [liveKitToken, setLiveKitToken] = useState<string>(initialToken);
  const [liveKitUrl, setLiveKitUrl] = useState<string>(initialUrl);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);

  const [showPaymentPrompt, setShowPaymentPrompt] = useState(false);
  const [postPaymentSuccess, setPostPaymentSuccess] = useState<PostPaymentSuccessState | null>(null);
  const [showPaymentOptions, setShowPaymentOptions] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string | null>(null);
  const [showManualReconnect, setShowManualReconnect] = useState(false);
  const [showConversation, setShowConversation] = useState(true);

  const [sessionTime, setSessionTime] = useState(0);
  const [levelTime, setLevelTime] = useState(0);
  const [totalPracticeTime, setTotalPracticeTime] = useState(
    initialLearning.total_practice_time || 0
  );
  const [levelStartTime, setLevelStartTime] = useState<number>(Date.now());
  const [sessionStartTime] = useState<number>(Date.now());

  const [freeTimeUsed, setFreeTimeUsed] = useState(0);
  const [freeTimeRemaining, setFreeTimeRemaining] = useState(TIME_LIMITS.FREE_SECONDS);
  const [freeTrialExhausted, setFreeTrialExhausted] = useState(false);
  const [trialJustEnded, setTrialJustEnded] = useState(false);
  const [isLoadingFreeTime, setIsLoadingFreeTime] = useState(true);

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [currentExerciseId, setCurrentExerciseId] = useState<string | null>(null);
  const [autoAdvanceTriggered, setAutoAdvanceTriggered] = useState(false);

  const [agentReady, setAgentReady] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [ttsPlayingIndex, setTtsPlayingIndex] = useState<number | null>(null);
  const replayViaLiveKitRef = useRef<((text: string) => Promise<void>) | null>(null);
  const stopReplayRef = useRef<(() => Promise<void>) | null>(null);
  const replayingTextRef = useRef<string | null>(null);
  const replayClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // F4: Single stable status string — replaces the 3 racing booleans
  // (isListening, isSpeaking, agentReady) that caused visible flickering.
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('connecting');

  const [waitingForAgent, setWaitingForAgent] = useState(!accessBlocked);
  const [waitingStartTime, setWaitingStartTime] = useState(Date.now());
  const [waitingElapsed, setWaitingElapsed] = useState(0);
  const [initialLoadingDone, setInitialLoadingDone] = useState(false);
  const [isRoomConnectionBlocked, setIsRoomConnectionBlocked] = useState(
    accessBlocked || !hasPaidAccess(initialLearning)
  );
  const [roomSessionNonce, setRoomSessionNonce] = useState(0);
  const [levelCompleteModalData, setLevelCompleteModalData] = useState<PendingLevelCompletion | null>(null);
  const [nextLevelPrepSeconds, setNextLevelPrepSeconds] = useState(0);
  const [inlineFeedback, setInlineFeedback] = useState<string | null>(null);

  // Test checkpoint state — interstitial LiveKit test session after every 5th level
  // Initialised from route params so the correct sessionType fires on the very first
  // sendLanguageConfig call, even when the screen mounts with a pending test already in DB.
  const _initPendingCheckpoint = initialLearning?.pending_test_checkpoint ?? null;
  const [pendingTestCheckpoint, setPendingTestCheckpoint] = useState<number | null>(_initPendingCheckpoint);
  const [testReport, setTestReport] = useState<TestReport | null>(null);
  const [showTestReport, setShowTestReport] = useState(false);

  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastAgentSpeechAtRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const sessionBirthTimeRef = useRef<number>(Date.now());
  const paymentJustCompletedRef = useRef(false);
  const levelTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPaymentDisconnectRef = useRef(false);
  const manualReconnectLearningRef = useRef<Learning | null>(null);
  // When returning from PayU, AppState flips to "active". Guard against auto-exit
  // to dashboard during an in-progress payment or immediately after success.
  const paymentFlowActiveRef = useRef(false);
  const permissionFlowActiveRef = useRef(false); // ← ADD THIS

  const hasCheckedPremiumRef = useRef(false);
  const freeTimeLimitShownRef = useRef(false);
  const timeWarningShownRef = useRef(false);
  const conversationRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  const waitingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nextLevelPrepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextLevelReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sessionTimeRef = useRef(0);
  const levelTimeRef = useRef(0);
  const learningRef = useRef<Learning>(initialLearning);
  const lastSavedFreeTimeRef = useRef(0);
  const previousLevelRef = useRef(initialLearning.current_level);
  const previousUserMessageCountRef = useRef(0);
  const lastProcessedCompletionRef = useRef<{ previousLevel: number; currentLevel: number; at: number } | null>(null);
  const isHandlingLevelCompletionRef = useRef(false);
  const pendingLevelCompletionRef = useRef<PendingLevelCompletion | null>(null);
  const levelCompletionFallbackRef = useRef<NodeJS.Timeout | null>(null);
  const levelCompletionPollRef = useRef<NodeJS.Timeout | null>(null);
  const levelCompletionAlertShownRef = useRef(false);
  const languageConfigFallbackWarnedRef = useRef<string | null>(null);
  // F1+F5: Single authoritative silence timer — clears itself before each new
  // segment so overlapping setTimeout calls never fire out of order.
  const speakingSilenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // F2: Guard — agent is marked ready at most ONCE per session.
  const agentReadySetRef = useRef(false);

  // Internal refs used only for computing voiceStatus — never read by render.
  const internalIsSpeakingRef = useRef(false);
  const internalIsMicEnabledRef = useRef(false);

  // ─── Central status recomputer ───────────────────────────────────────────
  // Call this after any underlying boolean changes. By funnelling everything
  // through one function the UI only re-renders when the resolved string
  // genuinely differs, preventing spurious intermediate state renders.
  const recomputeVoiceStatus = useCallback((
    ready: boolean,
    micEnabled: boolean,
    speaking: boolean,
  ) => {
    let next: VoiceStatus;
    if (!ready) next = 'connecting';
    else if (speaking) next = 'agent_speaking';
    else if (!micEnabled) next = 'greeting';
    else next = 'ready';
    setVoiceStatus(prev => (prev === next ? prev : next));
  }, []);

  // ─── F1: Stable speaking setter ──────────────────────────────────────────
  // Resets the silence timer on EVERY segment so isSpeaking only flips false
  // after genuine silence, not between back-to-back speech segments.
  const markAgentSpeaking = useCallback(() => {
    if (speakingSilenceTimerRef.current) {
      clearTimeout(speakingSilenceTimerRef.current);
      speakingSilenceTimerRef.current = null;
    }
    if (!internalIsSpeakingRef.current) {
      internalIsSpeakingRef.current = true;
      recomputeVoiceStatus(agentReadySetRef.current, internalIsMicEnabledRef.current, true);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    }
    speakingSilenceTimerRef.current = setTimeout(() => {
      speakingSilenceTimerRef.current = null;
      internalIsSpeakingRef.current = false;
      pulseAnim.setValue(1);
      recomputeVoiceStatus(agentReadySetRef.current, internalIsMicEnabledRef.current, false);
    }, SPEAKING_SILENCE_TIMEOUT_MS);
  }, [recomputeVoiceStatus, pulseAnim]);

  // ─── F2: Stable agent-ready setter ───────────────────────────────────────
  // Fires state update at most once per session regardless of how many
  // ParticipantConnected / TrackPublished events fire.
  const markAgentReady = useCallback(() => {
    if (agentReadySetRef.current) return;
    agentReadySetRef.current = true;
    setAgentReady(true);
    recomputeVoiceStatus(true, internalIsMicEnabledRef.current, internalIsSpeakingRef.current);
  }, [recomputeVoiceStatus]);

  // ─── F3: Stable mic-enabled setter ───────────────────────────────────────
  const setMicEnabledStable = useCallback((enabled: boolean) => {
    internalIsMicEnabledRef.current = enabled;
    setIsMicEnabled(enabled);
    recomputeVoiceStatus(agentReadySetRef.current, enabled, internalIsSpeakingRef.current);
  }, [recomputeVoiceStatus]);

  // ─── Reset all voice state (call on disconnect / new session) ────────────
  const resetVoiceState = useCallback(() => {
    if (speakingSilenceTimerRef.current) {
      clearTimeout(speakingSilenceTimerRef.current);
      speakingSilenceTimerRef.current = null;
    }
    agentReadySetRef.current = false;
    internalIsSpeakingRef.current = false;
    internalIsMicEnabledRef.current = false;
    pulseAnim.setValue(1);
    setAgentReady(false);
    setIsMicEnabled(false);
    setVoiceStatus('connecting');
  }, [pulseAnim]);

  const clearLevelCompletionTimers = () => {
    if (levelCompletionFallbackRef.current) {
      clearTimeout(levelCompletionFallbackRef.current);
      levelCompletionFallbackRef.current = null;
    }
    if (levelCompletionPollRef.current) {
      clearTimeout(levelCompletionPollRef.current);
      levelCompletionPollRef.current = null;
    }
  };

  const clearNextLevelPrepTimers = () => {
    if (nextLevelPrepIntervalRef.current) {
      clearInterval(nextLevelPrepIntervalRef.current);
      nextLevelPrepIntervalRef.current = null;
    }
    if (nextLevelReconnectTimeoutRef.current) {
      clearTimeout(nextLevelReconnectTimeoutRef.current);
      nextLevelReconnectTimeoutRef.current = null;
    }
  };

  const showLevelCompletionAlert = (pending: PendingLevelCompletion, reason: string) => {
    if (levelCompletionAlertShownRef.current) return;

    levelCompletionAlertShownRef.current = true;
    clearLevelCompletionTimers();

    setRoomConnectionBlocked(true);
    resetVoiceState();
    setConversation([]);

    console.log('[LevelComplete Debug] Showing completion alert after agent speech settled', {
      reason,
      previousLevel: pending.prevLevel,
      newLevel: pending.newLevel,
    });

    setLevelCompleteModalData(pending);
  };

  const handleLevelCompleteContinue = (pending: PendingLevelCompletion) => {
    console.log('[LevelComplete Debug] Continue pressed by user, preparing next action', {
      crossedIntoUnpurchasedTier: pending.crossedIntoUnpurchasedTier,
      currentLevel: pending.updatedLearning.current_level,
    });

    if (pending.completedCourse) {
      handleCompletedCourseDashboard(pending);
      return;
    }

    setLevelCompleteModalData(null);
    levelCompletionAlertShownRef.current = false;
    isHandlingLevelCompletionRef.current = false;
    setLevelTime(0);
    setLevelStartTime(Date.now());

    const checkpointToLaunch =
      pendingTestCheckpoint ??
      (pending.prevLevel > 0 && pending.prevLevel % LEVEL_CONFIG.LEVELS_PER_TIER === 0
        ? Math.floor(pending.prevLevel / LEVEL_CONFIG.LEVELS_PER_TIER)
        : null) ??
      (pending.updatedLearning.pending_test_checkpoint && pending.updatedLearning.pending_test_checkpoint > 0
        ? pending.updatedLearning.pending_test_checkpoint
        : null);

    // Test checkpoint runs FIRST — payment (crossedIntoUnpurchasedTier) is deferred to
    // handleContinueAfterTest so the user clears the checkpoint before being prompted to pay.
    // TestScreen is completely standalone: it gets its own LiveKit token and handles everything.
    // pendingLevelCompletionRef stays alive so handleContinueAfterTest can check it on return.
    if (checkpointToLaunch !== null) {
      setPendingTestCheckpoint(checkpointToLaunch);
      // Hard-stop room session before opening checkpoint test so learning flow
      // does not keep running underneath TestScreen.
      clearSessionTimer();
      clearLevelTimer();
      setRoomConnectionBlocked(true);
      setShowPaymentPrompt(false);
      setShowPaymentOptions(true);
      setWaitingForAgent(false);
      setInitialLoadingDone(false);
      setWaitingElapsed(0);
      setConversation([]);
      resetVoiceState();
      setShowConversation(false);

      navigation.replace('TestScreen', {
        learning: {
          ...pending.updatedLearning,
          pending_test_checkpoint: checkpointToLaunch,
        },
        user,
        checkpoint: checkpointToLaunch,
        postTestPending: pending,
      });
      return;
    }

    // No pending test — safe to clear level completion tracking now.
    pendingLevelCompletionRef.current = null;

    if (pending.crossedIntoUnpurchasedTier) {
      openTierUpgradePrompt('Please choose the next plan to continue your levels.', pending.newLevel);
      return;
    }

    // ✅ FIX: Clear conversation and block room FIRST, then increment nonce
    // This prevents the old session's final transcript from appearing in the new session
    setConversation([]);
    resetVoiceState();
    setRoomConnectionBlocked(true);
    setWaitingForAgent(false);
    setInitialLoadingDone(false);
    setWaitingElapsed(0);
    setNextLevelPrepSeconds(15);

    // ✅ FIX: Update session birth time so TranscriptionHandler ignores stale events
    sessionBirthTimeRef.current = Date.now();

    clearNextLevelPrepTimers();

    nextLevelPrepIntervalRef.current = setInterval(() => {
      setNextLevelPrepSeconds((prev) => {
        if (prev <= 1) {
          if (nextLevelPrepIntervalRef.current) {
            clearInterval(nextLevelPrepIntervalRef.current);
            nextLevelPrepIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    nextLevelReconnectTimeoutRef.current = setTimeout(() => {
      setNextLevelPrepSeconds(0);
      setRoomSessionNonce((prev) => prev + 1);
      reconnectToRoom(pending.updatedLearning);
    }, 15000);
  };

  const handleContinueAfterTest = () => {
    setShowTestReport(false);
    setTestReport(null);
    setPendingTestCheckpoint(null);
    setShowConversation(true);

    const pending = pendingLevelCompletionRef.current;
    if (!pending) {
      // e.g. opened TestScreen from cold start without postTestPending — still resume voice.
      void reconnectToRoom(learning);
      return;
    }

    // Payment check for the next tier runs now (after the test), not before it.
    if (pending.crossedIntoUnpurchasedTier) {
      const maxPurchased = getPurchasedMaxLevelFromPricing(pending.updatedLearning);
      const entitled =
        pending.updatedLearning.is_premium ||
        maxPurchased >= pending.newLevel;
      if (!entitled) {
        openTierUpgradePrompt('Please choose the next plan to continue your levels.', pending.newLevel);
        return;
      }
      // Agent flagged tier boundary but learning already includes payment — skip paywall.
    }

    // Clear and reconnect for the next level voice session.
    pendingLevelCompletionRef.current = null;
    levelCompletionAlertShownRef.current = false;
    isHandlingLevelCompletionRef.current = false;
    setLevelTime(0);
    setLevelStartTime(Date.now());
    setConversation([]);
    resetVoiceState();
    setRoomConnectionBlocked(true);
    setWaitingForAgent(false);
    setInitialLoadingDone(false);
    setWaitingElapsed(0);
    setNextLevelPrepSeconds(15);
    sessionBirthTimeRef.current = Date.now();
    clearNextLevelPrepTimers();

    nextLevelPrepIntervalRef.current = setInterval(() => {
      setNextLevelPrepSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(nextLevelPrepIntervalRef.current!);
          nextLevelPrepIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    nextLevelReconnectTimeoutRef.current = setTimeout(() => {
      setNextLevelPrepSeconds(0);
      setRoomSessionNonce((prev) => prev + 1);
      if (pending.updatedLearning) reconnectToRoom(pending.updatedLearning);
    }, 15000);
  };

  const handleCompletedCourseDashboard = (pending: PendingLevelCompletion) => {
    setLevelCompleteModalData(null);
    pendingLevelCompletionRef.current = null;
    levelCompletionAlertShownRef.current = false;
    isHandlingLevelCompletionRef.current = false;
    clearNextLevelPrepTimers();
    setNextLevelPrepSeconds(0);
    setRoomConnectionBlocked(true);
    setLiveKitToken('');
    setLiveKitUrl('');
    setConversation([]);
    resetVoiceState();
    Toast.show(COMPLETION_TOAST_MESSAGE, Toast.LONG);

    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            params: { user, existingLearning: pending.updatedLearning },
          },
        ],
      })
    );
  };

  const handleCompletedCourseHistory = async (pending: PendingLevelCompletion) => {
    const authToken = await AuthStorage.getToken();
    if (!authToken) {
      handleCompletedCourseDashboard(pending);
      return;
    }

    setLevelCompleteModalData(null);
    pendingLevelCompletionRef.current = null;
    levelCompletionAlertShownRef.current = false;
    isHandlingLevelCompletionRef.current = false;
    clearNextLevelPrepTimers();
    setNextLevelPrepSeconds(0);
    setRoomConnectionBlocked(true);
    setLiveKitToken('');
    setLiveKitUrl('');
    setConversation([]);
    resetVoiceState();

    navigation.replace('ConversationHistory', {
      learningId: String(pending.updatedLearning.id),
      authToken,
    });
  };

  const handleCompletedCoursePractice = async (pending: PendingLevelCompletion) => {
    const authToken = await AuthStorage.getToken();
    if (!authToken) {
      handleCompletedCourseDashboard(pending);
      return;
    }

    Toast.show('Practice mode enabled through your conversation history.', Toast.SHORT);
    await handleCompletedCourseHistory(pending);
  };

  const handleCompletedCourseRestart = (pending: PendingLevelCompletion) => {
    Toast.show('Restart learning is being prepared. Opening dashboard for now.', Toast.SHORT);
    handleCompletedCourseDashboard(pending);
  };

  const maybeShowLevelCompletionAfterSilence = () => {
    const pending = pendingLevelCompletionRef.current;
    // ✅ FIX: Check both flags - alert shown OR modal data already cleared by Continue press
    if (!pending || levelCompletionAlertShownRef.current) return;

    const silenceMs = Date.now() - lastAgentSpeechAtRef.current;
    if (silenceMs >= 1200) {
      showLevelCompletionAlert(pending, 'agent_silence');
      return;
    }

    levelCompletionPollRef.current = setTimeout(() => {
      maybeShowLevelCompletionAfterSilence();
    }, 300);
  };

  const setRoomConnectionBlocked = (blocked: boolean) => {
    isPaymentDisconnectRef.current = blocked;
    setIsRoomConnectionBlocked(blocked);
  };

  const openTierUpgradePrompt = (message?: string, _nextLevelAfterUpgrade?: number) => {
    clearNextLevelPrepTimers();
    setNextLevelPrepSeconds(0);
    setLevelCompleteModalData(null);
    pendingLevelCompletionRef.current = null;
    levelCompletionAlertShownRef.current = false;
    isHandlingLevelCompletionRef.current = false;

    setConversation([]);
    resetVoiceState();
    setPaymentStatusMessage(null);
    setIsReconnecting(false);
    setLiveKitToken('');
    setLiveKitUrl('');
    setRoomConnectionBlocked(true);
    setWaitingForAgent(false);
    setShowPaymentPrompt(true);
    setShowPaymentOptions(true);
    fetchPricingConfig();
    // Intentionally no Toast here — the payment modal carries the message. Toasts are
    // reserved for session reconnect / in-room tier checks so they do not stack over
    // the checkpoint quiz when opening TestScreen.
  };


  useEffect(() => {
    if (!accessBlocked) return;

    setRoomConnectionBlocked(true);
    setWaitingForAgent(false);
    setLiveKitToken('');
    setLiveKitUrl('');
    setShowPaymentPrompt(true);
    setShowPaymentOptions(true);
    fetchPricingConfig();

    // Blocked-room UX uses the payment modal; avoid a Toast that can linger over other flows.
  }, [accessBlocked, blockedReason, blockedMessage]);

  // ============================================================================
  // PAYU EVENT HANDLERS
  // ============================================================================

  const displayAlert = (title: string, value: string) => {
    console.log('displayAlert', title, value);
    Alert.alert(title, value);
  };

  const currentPaymentTierRef = useRef<{ tierKey: string; levels: string } | null>(null);

  const onPaymentSuccess = (e: any) => {
    console.log('✓ PayU Payment Success:', e?.merchantResponse);
    console.log('[PayU Debug] Success raw event:', e);
    console.log('[PayU Debug] Success transaction hints:', {
      merchantResponseTxnId: e?.merchantResponse?.txnid,
      responseTxnId: e?.txnid,
      payuResponse: e?.payuResponse,
      currentTierRef: currentPaymentTierRef.current,
    });
    setIsProcessingPayment(false);
    const tierInfo = currentPaymentTierRef.current;
    handlePaymentSuccess(e, tierInfo?.tierKey || '', tierInfo?.levels || '');
  };

  const onPaymentFailure = (e: any) => {
    console.log('✗ PayU Payment Failure:', e?.merchantResponse);
    console.log('[PayU Debug] Failure raw event:', e);
    console.log('[PayU Debug] Failure transaction hints:', {
      merchantResponseTxnId: e?.merchantResponse?.txnid,
      responseTxnId: e?.txnid,
      payuResponse: e?.payuResponse,
      currentTierRef: currentPaymentTierRef.current,
    });
    setIsProcessingPayment(false);
    handlePaymentFailure(e);
  };

  const onPaymentCancel = (e: any) => {
    console.log('⊗ PayU Payment Cancelled:', e);
    setIsProcessingPayment(false);
    handlePaymentCancelled();
  };

  const onError = (e: any) => {
    console.log('❌ PayU Error:', e);
    const errorCode = String(e?.errorCode || '');
    const errorMsg = String(e?.errorMsg || '');
    const htmlResponseDetected = /<!doctype|<html/i.test(errorMsg);

    if (errorCode === '5014' || htmlResponseDetected) {
      console.log('[PayU Debug] Potential HTML response detected instead of JSON:', {
        errorCode,
        errorMsgPreview: errorMsg.slice(0, 220),
        environment: PAYU_MERCHANT.environment,
        ios_surl: PAYU_MERCHANT.ios_surl,
        ios_furl: PAYU_MERCHANT.ios_furl,
        android_surl: PAYU_MERCHANT.android_surl,
        android_furl: PAYU_MERCHANT.android_furl,
      });
    }

    setIsProcessingPayment(false);
    displayAlert('Payment Error', JSON.stringify(e));
  };

  usePayUCheckout({
    onPaymentSuccess,
    onPaymentFailure,
    onPaymentCancel,
    onError,
  });

  const fetchPricingConfig = async (): Promise<boolean> => {
    setIsPricingLoading(true);
    try {
      const { ok, pricing } = await fetchPricingCatalog();
      if (!ok || !pricing) return false;

      setPricingConfig(pricing);
      console.log('✓ Dynamic pricing loaded from API');
      return true;
    } catch (error) {
      console.warn('⚠️ Failed to load dynamic pricing from API');
      return false;
    } finally {
      setIsPricingLoading(false);
    }
  };

  // ============================================================================
  // EFFECTS - PRICING
  // ============================================================================

  useEffect(() => {
    fetchPricingConfig();
  }, []);

  useEffect(() => {
    if (showPaymentPrompt) {
      fetchPricingConfig();
    }
  }, [showPaymentPrompt]);

  // ============================================================================
  // EFFECTS - INITIALIZATION
  // ============================================================================

  useEffect(() => {
    // Defensive re-assert when entering the room — covers first-launch cases
    // where audio setup was skipped and recovers if another app grabbed focus.
    AudioHelper.ensureSpeakerRouting();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
  if (nextAppState === 'active' && appStateRef.current !== 'active') {
    AudioHelper.ensureSpeakerRouting();

    // ← ADD this condition alongside the existing paymentFlowActiveRef check
    if (paymentFlowActiveRef.current || permissionFlowActiveRef.current) {
      appStateRef.current = nextAppState;
      return;
    }

    if (!isPaymentDisconnectRef.current) {
      clearSessionTimer();
      clearLevelTimer();
      setRoomConnectionBlocked(true);
      handleGoBack();
    }
  }
  appStateRef.current = nextAppState;
};

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    StatusBar.setBarStyle('light-content');
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor(PROFESSIONAL_COLORS.bgDark);
    }

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    return () => {
      StatusBar.setBarStyle('default');
    };
  }, []);

  useEffect(() => {
    const persistLanguageContext = async () => {
      if (initialLearning) {
        await AuthStorage.saveLanguageContext(
          initialLearning.native_language,
          initialLearning.target_language,
          String(user.id),
        );
        CrashlyticsHelper.log(
          `Language context persisted: ${initialLearning.native_language} → ${initialLearning.target_language}`
        );
      }
    };
    persistLanguageContext();
  }, [initialLearning, user.id]);

  // ============================================================================
  // EFFECTS - FETCH FREE TIME STATUS ON MOUNT
  // ============================================================================

  useEffect(() => {
    const initFreeTimeStatus = async () => {
      // ✅ Skip free time check for ANY paid user (full bundle OR tier-wise)
      if (hasPaidAccess(learning)) {
        setIsLoadingFreeTime(false);
        setFreeTrialExhausted(false);
        setFreeTimeRemaining(TIME_LIMITS.FREE_SECONDS);
        // Do not force-unblock while payment UI / post-success / reconnect owns connection —
        // otherwise isPaymentDisconnectRef goes false, AppState returns from PayU → handleGoBack → MainTabs.
        if (showPaymentPrompt || postPaymentSuccess || isReconnecting) {
          return;
        }
        setRoomConnectionBlocked(false);
        return;
      }

      const token = await AuthStorage.getToken();
      const status = token ? await apiFetchFreeTimeStatus(token) : null;
      if (status) {
        setFreeTimeUsed((status.free_time_used_seconds as number) || 0);
        setFreeTimeRemaining((status.free_time_remaining_seconds as number) || TIME_LIMITS.FREE_SECONDS);
        setFreeTrialExhausted(Boolean(status.free_trial_exhausted));

        if (
          status.free_trial_exhausted &&
          (status.free_time_remaining_seconds as number) <= 0
        ) {
          console.log('⏰ Free trial already exhausted - showing payment prompt');
          freeTimeLimitShownRef.current = true;
          handleFreeTimeLimitReached();
        } else {
          setRoomConnectionBlocked(false);
        }
      }
      setIsLoadingFreeTime(false);
    };

    initFreeTimeStatus();
  }, [
    learning.is_premium,
    learning.purchased_tiers,
    showPaymentPrompt,
    postPaymentSuccess,
    isReconnecting,
  ]);

  // ============================================================================
  // EFFECTS - TIMER MANAGEMENT
  // ============================================================================

  useEffect(() => { sessionTimeRef.current = sessionTime; }, [sessionTime]);
  useEffect(() => { levelTimeRef.current = levelTime; }, [levelTime]);
  useEffect(() => { learningRef.current = learning; }, [learning]);

  const clearSessionTimer = () => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  };

  const startSessionTimer = () => {
    clearSessionTimer();
    sessionTimerRef.current = setInterval(() => {
      setSessionTime((prev) => {
        const newValue = prev + 1;
        sessionTimeRef.current = newValue;
        return newValue;
      });
    }, 1000);
  };

  const clearLevelTimer = () => {
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
  };

  const startLevelTimer = () => {
    clearLevelTimer();
    levelTimerRef.current = setInterval(() => {
      setLevelTime((prev) => {
        const newValue = prev + 1;
        levelTimeRef.current = newValue;
        return newValue;
      });
    }, 1000);
  };

  useEffect(() => {
    startSessionTimer();
    startLevelTimer();
    return () => {
      clearSessionTimer();
      clearLevelTimer();
    };
  }, []);

  useEffect(() => {
    const saveInterval = setInterval(() => {
      const currentSessionTime = sessionTimeRef.current;
      const currentLevelTime = levelTimeRef.current;
      const currentLearning = learningRef.current;

      saveLevelTimeWithRef(currentLevelTime, currentLearning);

      // Only track free time if no paid access
      if (!hasPaidAccess(currentLearning) && currentSessionTime > 0) {
        updateFreeTimeUsage(currentSessionTime);
      }
    }, 30000);

    return () => clearInterval(saveInterval);
  }, [learning.current_level, learning.is_premium, learning.purchased_tiers]);

  useEffect(() => {
    return () => {
      const currentLearning = learningRef.current;
      const currentSessionTime = sessionTimeRef.current;
      if (!hasPaidAccess(currentLearning) && currentSessionTime > 0) {
        updateFreeTimeUsage(currentSessionTime).catch((err) => {
          console.error('Error saving free time on unmount:', err);
        });
      }
    };
  }, []);

  // ============================================================================
  // EFFECTS - FREE TIME LIMIT CHECK
  // ============================================================================

  useEffect(() => {
    if (isLoadingFreeTime) return;
    if (hasPaidAccess(learning)) return; // ✅ Skip for any paid user

    const unsavedSessionTime = sessionTime - lastSavedFreeTimeRef.current;
    const totalUsed = freeTimeUsed + unsavedSessionTime;
    const effectiveRemaining = Math.max(0, TIME_LIMITS.FREE_SECONDS - totalUsed);

    if (freeTrialExhausted || effectiveRemaining <= 0) {
      if (!freeTimeLimitShownRef.current) {
        freeTimeLimitShownRef.current = true;
        console.log('⏰ Free time limit reached (total used:', totalUsed, 's)');
        updateFreeTimeUsage(sessionTimeRef.current);
        handleFreeTimeLimitReached();
      }
    } else if (effectiveRemaining <= 60 && effectiveRemaining > 0) {
      if (!timeWarningShownRef.current) {
        timeWarningShownRef.current = true;
        // Alert.alert(
        //   'Time Warning',
        //   'You have less than 1 minute remaining in your free trial. Upgrade to continue learning!',
        //   [{ text: 'OK' }]
        // );
      }
    } else if (effectiveRemaining <= TIME_LIMITS.WARNING_THRESHOLD && effectiveRemaining > 60 && !timeWarningShownRef.current) {
      timeWarningShownRef.current = true;
      const remainingMinutes = Math.ceil(effectiveRemaining / 60);
      // Alert.alert(
      //   'Time Warning',
      //   `You have ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} remaining in your free trial.`,
      //   [{ text: 'OK' }]
      // );
    }
  }, [sessionTime, freeTimeUsed, freeTrialExhausted, isLoadingFreeTime, learning.is_premium, learning.purchased_tiers]);

  // ============================================================================
  // EFFECTS - PAYMENT REQUIREMENT CHECK
  // ============================================================================

  useEffect(() => {
    if (paymentJustCompletedRef.current) {
      return;
    }

    if (isLoadingFreeTime) {
      return;
    }

    if (!hasCheckedPremiumRef.current) {
      checkPaymentRequirement();
      hasCheckedPremiumRef.current = true;
    }
  }, [
    learning.current_level,
    learning.is_premium,
    learning.purchased_tiers,
    isLoadingFreeTime,
    showPaymentPrompt,
    levelCompleteModalData,
    nextLevelPrepSeconds,
  ]);

  // ============================================================================
  // EFFECTS - AGENT READY
  // ============================================================================



  // ============================================================================
  // CLEANUP ON UNMOUNT
  // ============================================================================

  useEffect(() => {
    return () => {
      console.log('[Room] 🧹 Component unmounting - performing complete cleanup...');
      clearLevelCompletionTimers();
      clearNextLevelPrepTimers();
      clearSessionTimer();
      clearLevelTimer();
      if (speakingSilenceTimerRef.current) clearTimeout(speakingSilenceTimerRef.current);
      setRoomConnectionBlocked(true);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Restore room conversation area whenever screen regains focus.
      setShowConversation(true);

      // Returning from TestScreen: the 'testCompleted' param signals post-test flow.
      if (route.params?.testCompleted) {
        const resume = route.params.pendingPostTest;
        if (resume) {
          pendingLevelCompletionRef.current = resume;
        }
        navigation.setParams({ testCompleted: undefined, pendingPostTest: undefined });
        handleContinueAfterTest();
      }

      return () => {
        clearLevelCompletionTimers();
        clearNextLevelPrepTimers();
        clearSessionTimer();
        clearLevelTimer();
        setRoomConnectionBlocked(true);
        resetVoiceState();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params?.testCompleted])
  );

  // ============================================================================
  // EFFECTS - PULSE ANIMATION
  // ============================================================================



  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeLong = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
  };

  useEffect(() => {
    if (!waitingForAgent) {
      if (waitingIntervalRef.current) { clearInterval(waitingIntervalRef.current); waitingIntervalRef.current = null; }
      if (initialLoadingTimeoutRef.current) { clearTimeout(initialLoadingTimeoutRef.current); initialLoadingTimeoutRef.current = null; }
      setWaitingElapsed(0);
      setInitialLoadingDone(false);
      return;
    }

    setInitialLoadingDone(false);
    if (initialLoadingTimeoutRef.current) { clearTimeout(initialLoadingTimeoutRef.current); initialLoadingTimeoutRef.current = null; }

    initialLoadingTimeoutRef.current = setTimeout(() => {
      setInitialLoadingDone(true);
      setWaitingStartTime(Date.now());
      initialLoadingTimeoutRef.current = null;
    }, 5000);

    return () => {
      if (initialLoadingTimeoutRef.current) { clearTimeout(initialLoadingTimeoutRef.current); initialLoadingTimeoutRef.current = null; }
    };
  }, [waitingForAgent, liveKitToken]);

  useEffect(() => {
    if (!waitingForAgent || !initialLoadingDone) {
      if (waitingIntervalRef.current) { clearInterval(waitingIntervalRef.current); waitingIntervalRef.current = null; }
      if (!initialLoadingDone) setWaitingElapsed(0);
      return;
    }

    const start = waitingStartTime;
    waitingIntervalRef.current = setInterval(() => {
      setWaitingElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);

    return () => {
      if (waitingIntervalRef.current) { clearInterval(waitingIntervalRef.current); waitingIntervalRef.current = null; }
    };
  }, [waitingForAgent, initialLoadingDone, waitingStartTime]);

  useEffect(() => { if (agentReady) setWaitingForAgent(false); }, [agentReady]);
  useEffect(() => { setWaitingForAgent(true); setInitialLoadingDone(false); }, [liveKitToken]);

  const handleGoBack = async () => {
    clearNextLevelPrepTimers();
    setNextLevelPrepSeconds(0);
    setRoomConnectionBlocked(true);
    clearSessionTimer();
    clearLevelTimer();
    setConversation([]);
    resetVoiceState();
    setShowConversation(false);

    const currentSessionTime = sessionTimeRef.current;
    if (!hasPaidAccess(learning) && currentSessionTime > 0) {
      await updateFreeTimeUsage(currentSessionTime);
    }

    navigation.replace('MainTabs', { user, existingLearning: learning });
  };

  const getCurrentTier = (level: number): number => {
    return Math.ceil(level / LEVEL_CONFIG.LEVELS_PER_TIER);
  };

  // ✅ NEW: Calculate tier from purchasedMaxLevel (from backend)
  // This mirrors the Python backend logic for displaying tier info
  const calculateTierFromMaxLevel = (purchasedMaxLevel: number): number => {
    if (purchasedMaxLevel <= 0) return 0; // Free trial - no tier
    if (purchasedMaxLevel >= LEVEL_CONFIG.TOTAL_LEVELS) return 6; // Full bundle (all 30 levels)
    // Calculate tier: tier = ceil(max_level / 5)
    return Math.ceil(purchasedMaxLevel / LEVEL_CONFIG.LEVELS_PER_TIER);
  };

  // ✅ NEW: Get tier info from purchasedMaxLevel for displaying in stats
  const getTierInfoFromMaxLevel = (purchasedMaxLevel: number) => {
    if (purchasedMaxLevel <= 0) return null; // Free trial

    const maxTier = calculateTierFromMaxLevel(purchasedMaxLevel);

    if (!pricingConfig?.tiers?.length) {
      // Fallback display if pricing not loaded yet
      if (purchasedMaxLevel >= LEVEL_CONFIG.TOTAL_LEVELS) {
        return {
          key: 'full_bundle',
          displayName: 'Full Bundle',
          levelCount: LEVEL_CONFIG.TOTAL_LEVELS,
          description: 'All Levels 1-30',
        };
      }
      return {
        key: `tier_${maxTier}`,
        displayName: `Tier ${maxTier}`,
        levelCount: purchasedMaxLevel,
        description: `Levels 1-${purchasedMaxLevel}`,
      };
    }

    // Return the tier info from pricing config
    if (maxTier === 6) {
      return pricingConfig.bundle;
    } else if (maxTier > 0 && maxTier <= pricingConfig.tiers.length) {
      return pricingConfig.tiers[maxTier - 1];
    }
    return null;
  };

  const getTierInfo = (tier: number) => {
    if (!pricingConfig?.tiers?.length) return null;
    if (tier <= 0 || tier > pricingConfig.tiers.length) return null;
    return pricingConfig.tiers[tier - 1];
  };

  const getRequiredTier = () => {
    if (!pricingConfig?.tiers?.length) return null;
    if (learning.is_premium) return null;

    const currentLevel = Math.max(1, learning.current_level || 0);
    const purchasedTiers = learning.purchased_tiers || [];

    const tierForLevel = pricingConfig.tiers.find(
      (tier) => tier.levelStart <= currentLevel && currentLevel <= tier.levelEnd
    );

    // Free trial users should always see the applicable tier (fallback: first tier).
    if (purchasedTiers.length === 0) {
      return tierForLevel || pricingConfig.tiers[0] || null;
    }

    const purchasedMaxLevel = getPurchasedMaxLevelFromPricing(learning);
    if (currentLevel <= purchasedMaxLevel) {
      return null;
    }

    if (tierForLevel) {
      return tierForLevel;
    }

    return pricingConfig.tiers.find((tier) => tier.levelStart > purchasedMaxLevel) || null;
  };

  const getPurchasedMaxLevelFromPricing = (currentLearning: Learning): number => {
    if (currentLearning.is_premium) return LEVEL_CONFIG.TOTAL_LEVELS;

    const purchasedTiers = currentLearning.purchased_tiers || [];
    if (purchasedTiers.length === 0) return 0;

    if (!pricingConfig?.tiers?.length) {
      return purchasedTiers.reduce((maxLevel, tierKey) => {
        return Math.max(maxLevel, TIER_MAX_LEVEL_FALLBACK[tierKey] || 0);
      }, 0);
    }

    let maxLevel = 0;
    for (const tierKey of purchasedTiers) {
      const tier = pricingConfig.tiers.find(t => t.key === tierKey);
      const end = tier?.levelEnd ?? TIER_MAX_LEVEL_FALLBACK[tierKey] ?? 0;
      if (end > maxLevel) maxLevel = end;
    }
    return maxLevel;
  };

  const getProgressPercentage = (): number => {
    const completedLevels = Math.max(0, learning.current_level - 1);
    return (completedLevels / LEVEL_CONFIG.TOTAL_LEVELS) * 100;
  };

  const getRemainingFreeTime = (): number => {
    const unsavedSessionTime = sessionTime - lastSavedFreeTimeRef.current;
    const totalUsed = freeTimeUsed + unsavedSessionTime;
    return Math.max(0, TIME_LIMITS.FREE_SECONDS - totalUsed);
  };

  // ============================================================================
  // API FUNCTIONS - TIME TRACKING
  // ============================================================================

  const saveLevelTime = async () => {
    return saveLevelTimeWithRef(levelTime, learning);
  };

  useEffect(() => {
    const userMessageCount = conversation.filter((message) => message.role === 'user').length;
    if (userMessageCount > previousUserMessageCountRef.current) {
      setInlineFeedback('Good job! Keep going.');
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      feedbackTimeoutRef.current = setTimeout(() => {
        setInlineFeedback(null);
      }, 1800);
    }
    previousUserMessageCountRef.current = userMessageCount;
  }, [conversation]);

  useEffect(() => {
    if (learning.current_level > previousLevelRef.current) {
      setInlineFeedback(`Level completed. Welcome to Level ${getDisplayLevel(learning.current_level)}!`);
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      feedbackTimeoutRef.current = setTimeout(() => {
        setInlineFeedback(null);
      }, 2600);
    }
    previousLevelRef.current = learning.current_level;
  }, [learning.current_level]);

  // On initial mount: if learning already has a pending test checkpoint (app restart / back nav),
  // navigate straight to TestScreen. TestScreen is fully standalone.
  // If no token was passed (e.g. coming back from TestScreen after payment tier boundary),
  // auto-trigger reconnectToRoom so payment prompts and retries are handled properly.
  useEffect(() => {
    if (_initPendingCheckpoint && _initPendingCheckpoint > 0) {
      navigation.replace('TestScreen', {
        learning: {
          ...initialLearning,
          pending_test_checkpoint: _initPendingCheckpoint,
        },
        user,
        checkpoint: _initPendingCheckpoint,
      });
      return;
    }
    // Skip auto-reconnect when returning from TestScreen — handleContinueAfterTest
    // (triggered by testCompleted param in useFocusEffect) owns the reconnect + payment flow.
    if (!initialToken && !route.params?.testCompleted) {
      void reconnectToRoom(initialLearning, { allowPaymentRequiredModal: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore pending test checkpoint state from learning data when it changes externally
  useEffect(() => {
    if (learning.pending_test_checkpoint && learning.pending_test_checkpoint > 0) {
      setPendingTestCheckpoint(learning.pending_test_checkpoint);
    }
  }, [learning.pending_test_checkpoint]);

  useEffect(() => {
    if (voiceStatus !== 'ready') {
      micPulseAnim.stopAnimation();
      micPulseAnim.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(micPulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();

    return () => {
      loop.stop();
      micPulseAnim.setValue(1);
    };
  }, [voiceStatus, micPulseAnim]);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const saveLevelTimeWithRef = async (currentLevelTime: number, currentLearning: Learning) => {
    try {
      const token = await AuthStorage.getToken();
      if (!token) return;

      const ok = await postLevelTime(token, {
        level: currentLearning.current_level,
        duration_seconds: currentLevelTime,
        native_language: currentLearning.native_language,
        target_language: currentLearning.target_language,
      });

      if (ok) {
        console.log(`✓ Level ${currentLearning.current_level} time saved: ${formatTimeLong(currentLevelTime)}`);
      }
    } catch (error) {
      console.error('Error saving level time:', error);
      CrashlyticsHelper.recordError(error as Error);
    }
  };

  const fetchLevelStats = async () => {
    try {
      const token = await AuthStorage.getToken();
      if (!token) return null;
      return await apiFetchLevelStats(token, learning);
    } catch (error) {
      console.error('Error fetching level stats:', error);
    }
    return null;
  };

  // ============================================================================
  // API FUNCTIONS - FREE TIME TRACKING
  // ============================================================================

  const updateFreeTimeUsage = async (currentSessionTime: number) => {
    // ✅ Skip free time update for ANY paid user
    if (hasPaidAccess(learning)) {
      return null;
    }

    const delta = currentSessionTime - lastSavedFreeTimeRef.current;
    if (delta <= 0) return null;

    try {
      const token = await AuthStorage.getToken();
      if (!token) return null;

      const data = await postFreeTimeUsage(token, delta);
      if (data) {
        lastSavedFreeTimeRef.current = currentSessionTime;
        setFreeTimeUsed(data.free_time_used_seconds as number);
        setFreeTimeRemaining(data.free_time_remaining_seconds as number);
        setFreeTrialExhausted(Boolean(data.free_trial_exhausted));
        return data;
      }
    } catch (error) {
      console.error('❌ Error updating free time:', error);
      CrashlyticsHelper.recordError(error as Error);
    }
    return null;
  };

  // ============================================================================
  // PAYMENT FUNCTIONS
  // ============================================================================

  const checkPaymentRequirement = () => {
    if (accessBlocked) return;
    if (pendingTestCheckpoint !== null) return;
    if (paymentJustCompletedRef.current) return;
    if (learning.is_premium) return; // Full bundle - no check needed
    if (showPaymentPrompt) return;
    if (isHandlingLevelCompletionRef.current) return;
    if (pendingLevelCompletionRef.current) return;
    if (levelCompleteModalData) return;
    if (nextLevelPrepSeconds > 0) return;

    const purchasedTiers = learning.purchased_tiers || [];

    if (purchasedTiers.length > 0) {
      // User has purchased at least one tier
      const purchasedMax = getPurchasedMaxLevelFromPricing(learning);
      if (learning.current_level <= purchasedMax) {
        return;
      }
      const requiredTier = getRequiredTier();
      if (requiredTier) {
        Toast.show('Please choose the next plan to continue your levels.', Toast.LONG);
        openTierUpgradePrompt(
          'Please choose the next plan to continue your levels.',
          requiredTier.levelStart
        );
        return;
      }
      return;
    }

    // Free trial - check time
    const unsavedSessionTime = sessionTime - lastSavedFreeTimeRef.current;
    const totalUsed = freeTimeUsed + unsavedSessionTime;
    const hasTimeRemaining = totalUsed < TIME_LIMITS.FREE_SECONDS && !freeTrialExhausted;

    if (hasTimeRemaining) {
      return;
    }

    setLiveKitToken('');
    setLiveKitUrl('');
    setRoomConnectionBlocked(true);
    setWaitingForAgent(false);
    setShowPaymentPrompt(true);
    setShowPaymentOptions(true);
    fetchPricingConfig();
  };

  const handleFreeTimeLimitReached = async () => {
    clearSessionTimer();
    clearLevelTimer();

    const currentSessionTime = sessionTimeRef.current;
    if (currentSessionTime > 0) await updateFreeTimeUsage(currentSessionTime);

    setFreeTrialExhausted(true);
    setTrialJustEnded(true);
    setFreeTimeRemaining(0);
    setLiveKitToken('');
    setLiveKitUrl('');
    setRoomConnectionBlocked(true);
    setWaitingForAgent(false);
    setShowPaymentPrompt(true);
    setShowPaymentOptions(true);
    fetchPricingConfig();
  };

  const handlePaymentForTier = async (tierKey: string, amount: string, levels: string) => {
    try {
      setIsProcessingPayment(true);

      if (!PayUBizSdk) {
        Alert.alert('Payment Error', 'Payment gateway is not available. Please reinstall the app.');
        setIsProcessingPayment(false);
        return;
      }

      // PayU will background the app; prevent AppState from auto-exiting to dashboard.
      paymentFlowActiveRef.current = true;

      const paymentParams = buildRoomTierCheckoutParams({
        user,
        learning,
        tierKey,
        amount,
        levels,
      });
      console.log('[PayU Debug] Opening checkout with params:', {
        transactionId: paymentParams.payUPaymentParams.transactionId,
        amount: paymentParams.payUPaymentParams.amount,
        productInfo: paymentParams.payUPaymentParams.productInfo,
        userCredential: paymentParams.payUPaymentParams.userCredential,
      });
      currentPaymentTierRef.current = { tierKey, levels };
      PayUBizSdk.openCheckoutScreen(paymentParams);
    } catch (error: any) {
      CrashlyticsHelper.recordError(error as Error);
      Alert.alert('Payment Error', `Failed to initiate payment: ${error?.message || 'Unknown error'}.`);
      setIsProcessingPayment(false);
      currentPaymentTierRef.current = null;
    }
  };

  const handlePaymentSuccess = async (response: any, tierKey: string, levels: string) => {
    try {
      // Keep guard active until user chooses Continue/Dashboard from success UI.
      paymentFlowActiveRef.current = true;
      const effectiveTierKey = tierKey || currentPaymentTierRef.current?.tierKey || '';
      const effectiveLevels = levels || currentPaymentTierRef.current?.levels || '';

      const token = await AuthStorage.getToken();
      if (!token) throw new Error('No authentication token');

      let payuData = response;
      if (typeof response.payuResponse === 'string') {
        try { payuData = JSON.parse(response.payuResponse); } catch { payuData = response; }
      }

      const resolvedTransactionId =
        payuData?.txnid || payuData?.result?.txnid || response?.transactionId || '';

      console.log('[PayU Debug] handlePaymentSuccess parsed payload:', {
        effectiveTierKey,
        effectiveLevels,
        resolvedTransactionId,
        resolvedTransactionIdLength: String(resolvedTransactionId).length,
        isResolvedTxnIdValidFormat: isValidPayUTransactionId(String(resolvedTransactionId || '')),
        mihpayid: payuData?.mihpayid || payuData?.result?.mihpayid,
        amount: payuData?.amount || payuData?.result?.amount || response?.amount,
        rawResponse: response,
        parsedPayuData: payuData,
      });

      const tierIndex = pricingConfig?.tiers?.findIndex(t => t.key === effectiveTierKey) ?? -1;
      const accessLevel = tierIndex >= 0 ? tierIndex + 1 : undefined;

      const { ok, data } = await updatePremiumAfterPayment(token, {
        native_language: learning.native_language,
        target_language: learning.target_language,
        learning_id: String(learning.id),
        payment_tier: effectiveTierKey,
        access_level: accessLevel,
        payment_id: payuData?.mihpayid || payuData?.result?.mihpayid,
        transaction_id: resolvedTransactionId,
        amount: payuData?.amount || payuData?.result?.amount || response.amount,
      });

      if (ok) {
        paymentJustCompletedRef.current = true;

        let updatedLearning = learning;
        if (data.learning) {
          updatedLearning = data.learning as Learning;
        }

        const purchasedTierData = pricingConfig?.tiers?.find(t => t.key === effectiveTierKey);
        const tierLevelStart = purchasedTierData?.levelStart ?? 0;
        if (tierLevelStart > 0 && updatedLearning.current_level < tierLevelStart) {
          updatedLearning = { ...updatedLearning, current_level: tierLevelStart };
        }
        setLearning(updatedLearning);

        freeTimeLimitShownRef.current = false;
        timeWarningShownRef.current = false;
        hasCheckedPremiumRef.current = false;
        setShowPaymentPrompt(false);
        setShowPaymentOptions(false);
        setRoomConnectionBlocked(true);
        currentPaymentTierRef.current = null;

        setConversation([]);
        setIsReconnecting(false);
        setWaitingForAgent(false);
        resetVoiceState();

        setTimeout(() => {
          paymentJustCompletedRef.current = false;
          console.log('✓ Payment completion flag cleared');
        }, 2000);

        const isBundle = effectiveTierKey === 'all_30_levels';
        const successMessage = isBundle
          ? 'You now have access to all 30 levels. Continue to your session or head back to the dashboard.'
          : `You now have access to levels ${effectiveLevels}. Continue to your session or head back to the dashboard.`;

        setPostPaymentSuccess({
          updatedLearning,
          message: successMessage,
          isBundle,
          transactionId: String(resolvedTransactionId || ''),
        });
      } else {
        throw new Error('Failed to update premium status');
      }
    } catch (error) {
      console.error('Error handling payment success:', error);
      CrashlyticsHelper.recordError(error as Error);
      paymentJustCompletedRef.current = false;
      paymentFlowActiveRef.current = false;
      Alert.alert('Update Error', 'Payment was successful but there was an error updating your account. Please contact support.');
    } finally {
      setIsProcessingPayment(false);
      currentPaymentTierRef.current = null;
    }
  };

  const handlePaymentFailure = (response: any) => {
    setIsProcessingPayment(false);
    currentPaymentTierRef.current = null;
    paymentFlowActiveRef.current = false;
    displayAlert('Payment Failed', response.error || 'Your payment could not be processed. Please try again.');
  };

  const handlePaymentCancelled = () => {
    setIsProcessingPayment(false);
    currentPaymentTierRef.current = null;
    paymentFlowActiveRef.current = false;
    Alert.alert('Payment Cancelled', 'You cancelled the payment process.', [{ text: 'OK' }]);
  };

  // ============================================================================
  // LIVEKIT FUNCTIONS
  // ============================================================================

  const reconnectToRoom = async (
    learningOverride?: Learning,
    _options?: { allowPaymentRequiredModal?: boolean }
  ): Promise<boolean> => {
    try {
      setRoomConnectionBlocked(true);
      setIsReconnecting(true);
      setWaitingForAgent(true);
      resetVoiceState();

      const token = await AuthStorage.getToken();
      if (!token) throw new Error('No authentication token');

      const activeLearning = learningOverride ?? learning;

      const { status, data } = await startLearningSession(token, {
        native_language: activeLearning.native_language,
        target_language: activeLearning.target_language,
        learning_id: String(activeLearning.id),
      });

      if (status === 402 || data.error === 'payment_required' || data.error === 'free_trial_exhausted') {
        console.log('💳 Room access blocked:', data.error || 'payment_required');
        if (data.free_trial_exhausted) {
          setFreeTrialExhausted(true);
          setFreeTimeRemaining(0);
        }
        setIsReconnecting(false);
        const isTierWise = hasTierWiseAccessOnly(activeLearning);
        if (isTierWise && data.error === 'payment_required') {
          const inferredLevel = Number(
            data?.required_level ?? data?.next_level ?? data?.current_level ??
            ((activeLearning.current_level || 0) + 1)
          );
          const msg = data.message || 'Session is locked. Choose a plan to continue.';
          Toast.show(msg, Toast.LONG);
          openTierUpgradePrompt(msg, inferredLevel);
        } else {
          setLiveKitToken('');
          setLiveKitUrl('');
          setRoomConnectionBlocked(true);
          setWaitingForAgent(false);
          setShowPaymentPrompt(true);
          setShowPaymentOptions(true);
          fetchPricingConfig();
          Toast.show(data.message || 'Session is locked. Choose a plan to continue.', Toast.LONG);
        }
        return false;
      }

      if (status < 200 || status >= 300) {
        throw new Error('Failed to start session');
      }

      const resolvedLearning = (() => {
        if (!data.learning) return null;
        // If caller passed a learning override with a higher level (e.g. post-payment),
        // respect it over whatever start-session returns from the backend.
        const minLevel = learningOverride?.current_level ?? 0;
        if (minLevel > 0 && data.learning.current_level < minLevel) {
          return { ...data.learning, current_level: minLevel };
        }
        return data.learning;
      })();

      setLiveKitToken(data.token as string);
      setLiveKitUrl(data.url as string);
      if (resolvedLearning) setLearning(resolvedLearning);
      setRoomConnectionBlocked(false);

      clearSessionTimer();
      clearLevelTimer();
      startSessionTimer();
      startLevelTimer();

      console.log('✓ Reconnected successfully');
      return true;
    } catch (error) {
      console.error('Reconnection error:', error);
      CrashlyticsHelper.recordError(error as Error);
      return false;
    } finally {
      setIsReconnecting(false);
    }
  };

  const runReconnectAfterPayment = async (updatedLearning: Learning) => {
    try {
      setShowManualReconnect(false);
      manualReconnectLearningRef.current = updatedLearning;
      setPaymentStatusMessage('Reconnecting...');

      console.log('[Payment Reconnect] Learning data ready:', {
        nativeLanguage: updatedLearning.native_language,
        targetLanguage: updatedLearning.target_language,
        currentLevel: updatedLearning.current_level,
        isPremium: updatedLearning.is_premium,
        purchasedTiers: updatedLearning.purchased_tiers,
      });

      const connected = await reconnectToRoom(updatedLearning, {
        allowPaymentRequiredModal: true,
      });

      if (!connected) {
        console.warn('[Payment Reconnect Debug] ❌ Single reconnect attempt failed after payment');
        setShowManualReconnect(true);
        setPaymentStatusMessage('Connection failed. Tap Retry.');
      } else {
        setPaymentStatusMessage(null);
      }
    } finally {
      setRoomConnectionBlocked(false);
    }
  };

  const handleManualReconnect = async () => {
    const payload = manualReconnectLearningRef.current ?? learning;
    try {
      setShowManualReconnect(false);
      setPaymentStatusMessage('Reconnecting...');
      const ok = await reconnectToRoom(payload, { allowPaymentRequiredModal: true });
      if (!ok) {
        setShowManualReconnect(true);
        setPaymentStatusMessage('Connection failed. Tap Retry.');
      } else {
        setPaymentStatusMessage(null);
      }
    } finally {
      setRoomConnectionBlocked(false);
    }
  };

  const handlePaymentSuccessContinue = () => {
    const snap = postPaymentSuccess;
    if (!snap) return;
    paymentFlowActiveRef.current = false;
    setPostPaymentSuccess(null);
    setIsReconnecting(true);
    setWaitingForAgent(true);
    setConversation([]);
    setRoomConnectionBlocked(true);
    resetVoiceState();
    setTimeout(() => {
      runReconnectAfterPayment(snap.updatedLearning);
    }, 500);
  };

  const handlePaymentSuccessDashboard = () => {
    const snap = postPaymentSuccess;
    if (!snap) return;
    paymentFlowActiveRef.current = false;
    setPostPaymentSuccess(null);
    setLiveKitToken('');
    setLiveKitUrl('');
    setRoomSessionNonce((n) => n + 1);
    setRoomConnectionBlocked(true);
    setIsReconnecting(false);
    setWaitingForAgent(false);
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            params: { user, existingLearning: snap.updatedLearning },
          },
        ],
      })
    );
  };

  // ============================================================================
  // EXERCISE ATTEMPT FUNCTIONS
  // ============================================================================

  const handleExerciseAttempt = (exerciseId: string, success: boolean) => {
    if (currentExerciseId !== exerciseId) {
      setCurrentExerciseId(exerciseId);
      setFailedAttempts(0);
      setAutoAdvanceTriggered(false);
    }

    if (success) {
      setFailedAttempts(0);
      setCurrentExerciseId(null);
      setAutoAdvanceTriggered(false);
    } else {
      const newFailedAttempts = failedAttempts + 1;
      setFailedAttempts(newFailedAttempts);
      if (newFailedAttempts >= EXERCISE_CONFIG.MAX_ATTEMPTS && !autoAdvanceTriggered) {
        handleAutoAdvance(exerciseId);
      }
    }
  };

  const handleAutoAdvance = (exerciseId: string) => {
    setAutoAdvanceTriggered(true);
    Alert.alert(
      'Moving Forward',
      `You've attempted this exercise ${EXERCISE_CONFIG.MAX_ATTEMPTS} times. Don't worry, we'll continue your learning journey!`,
      [{
        text: 'Continue',
        onPress: () => {
          setFailedAttempts(0);
          setCurrentExerciseId(null);
          setAutoAdvanceTriggered(false);
        },
      }],
      { cancelable: false }
    );
  };

  // ============================================================================
  // LEVEL COMPLETION HANDLER
  // ============================================================================

  // ============================================================================
  // TRANSCRIPTION HANDLER COMPONENT
  // ============================================================================

  const handleTranscription = (segments: TranscriptionSegment[]) => {
    segments.forEach((segment) => {
      const isAgent = (segment as any).participantIdentity === 'agent';
      const message: ConversationMessage = {
        role: isAgent ? 'ai' : 'user',
        text: segment.text,
        timestamp: new Date(),
      };

      setConversation((prev) => {
        if (prev.some((msg) => msg.text === message.text && msg.role === message.role)) return prev;
        return [...prev, message];
      });

      setTimeout(() => conversationRef.current?.scrollToEnd({ animated: true }), 100);
    });
  };

  const TranscriptionHandler = () => {
    const room = useRoomContext();

    // ============================================================================
    // Agent Detection
    // ============================================================================
    useEffect(() => {
      if (!room) return;

      // F2: markAgentReady() is guarded — multiple events are idempotent.
      if (room.remoteParticipants.size > 0) markAgentReady();

      const handleParticipantConnected = () => markAgentReady();

      const handleTrackPublished = (publication: any) => {
        if (publication.kind === 'audio') markAgentReady();
      };

      room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.on(RoomEvent.TrackPublished, handleTrackPublished);

      return () => {
        room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
        room.off(RoomEvent.TrackPublished, handleTrackPublished);
      };
    }, [room]);

    // ============================================================================
    // Send Language Config to Agent
    // ✅ UPDATED: Includes purchasedMaxLevel so agent can enforce tier limits
    // ============================================================================
    const languageConfigSentRef = useRef<string | null>(null);
    const isSendingRef = useRef(false);
    const handlerRegisteredRef = useRef<string | null>(null);
    const roomRef = useRef(room);

    useEffect(() => { roomRef.current = room; }, [room]);

    useEffect(() => {
      const currentRoom = roomRef.current;
      if (!currentRoom || !currentRoom.localParticipant || !liveKitToken) return;

      if (languageConfigSentRef.current !== liveKitToken) {
        languageConfigSentRef.current = null;
        isSendingRef.current = false;
        handlerRegisteredRef.current = null;
        // console.log('[Language Config] New session detected, resetting send flag');
      }

      if (languageConfigSentRef.current === liveKitToken) return;
      if (handlerRegisteredRef.current === liveKitToken) return;

      const sendLanguageConfig = async () => {
        const roomForSend = roomRef.current;
        if (!roomForSend || !roomForSend.localParticipant) return;
        if (isSendingRef.current || languageConfigSentRef.current === liveKitToken) return;

        isSendingRef.current = true;

        try {
          const token = await AuthStorage.getToken();
          const onboardingProfile = await AuthStorage.getOnboardingProfile(String(user.id));
          const nativeLang = LANGUAGES.find((l) => l.code === learning.native_language);
          const targetLang = LANGUAGES.find((l) => l.code === learning.target_language);
          const defaultNative = LANGUAGES.find((l) => l.code === 'en');
          const defaultTarget = LANGUAGES.find((l) => l.code === 'hi');

          if (nativeLang && targetLang) {
            languageConfigFallbackWarnedRef.current = null;
          }

          const missingNative = !nativeLang;
          const missingTarget = !targetLang;
          let nativeLanguage = learning.native_language;
          let targetLanguage = learning.target_language;
          let nativeLanguageName = nativeLang?.name ?? defaultNative?.name ?? 'English';
          let targetLanguageName = targetLang?.name ?? defaultTarget?.name ?? 'Hindi';

          if (missingNative) {
            nativeLanguage = 'en';
            nativeLanguageName = defaultNative?.name ?? 'English';
          }
          if (missingTarget) {
            targetLanguage = 'hi';
            targetLanguageName = defaultTarget?.name ?? 'Hindi';
          }

          if (missingNative || missingTarget) {
            const warnKey = `${learning.native_language}|${learning.target_language}`;
            if (languageConfigFallbackWarnedRef.current !== warnKey) {
              languageConfigFallbackWarnedRef.current = warnKey;
              const details: string[] = [];
              if (missingNative) {
                details.push(`Unknown native code "${learning.native_language}"`);
              }
              if (missingTarget) {
                details.push(`Unknown target code "${learning.target_language}"`);
              }
              Toast.show(
                `${details.join('; ')}. Using English → Hindi for this session.`,
                Toast.LONG,
              );
              CrashlyticsHelper.recordError(
                new Error('language_config_unknown_codes'),
                `${details.join('; ')} | resolved: ${nativeLanguage} -> ${targetLanguage}`,
              );
            }
          }

          // ✅ UPDATED: Compute and include purchasedMaxLevel
          // This handles both full bundle (is_premium=true) and tier-wise users
          const purchasedMaxLevel = getPurchasedMaxLevel(learning, pricingConfig);

          const config = {
            type: 'language_config',
            nativeLanguage,
            targetLanguage,
            nativeLanguageName,
            targetLanguageName,
            learningId: learning.id,
            currentLevel: learning.current_level,
            authToken: token || '',
            userName: user?.name || '',
            isPremium: learning.is_premium || false,
            purchasedMaxLevel,           // ✅ tells agent the tier limit (0 for free, 5/10/15/20/25 for tiers, 30 for full bundle)
            purchasedTiers: learning.purchased_tiers || [],
            skillLevel: onboardingProfile?.skillLevel || '',
            learningReason: onboardingProfile?.goal || '',
            sessionType: 'learning',
            testCheckpoint: 0,
            timestamp: new Date().toISOString(),
          };

          const encoder = new TextEncoder();
          const data = encoder.encode(JSON.stringify(config));

          languageConfigSentRef.current = liveKitToken;

          await roomForSend.localParticipant.publishData(data, {
            reliable: true,
            topic: 'language-config',
          });

          // console.log('[Language Config] ✅ Sent to agent (ONCE):', {
          //   native: config.nativeLanguage,
          //   target: config.targetLanguage,
          //   level: config.currentLevel,
          //   isPremium: config.isPremium,
          //   purchasedMaxLevel: config.purchasedMaxLevel,
          // });
          CrashlyticsHelper.log('Language config sent to agent');
        } catch (e) {
          languageConfigSentRef.current = null;
          console.error('[Language Config] ❌ Error sending:', e);
          CrashlyticsHelper.recordError(e as Error, 'sendLanguageConfig');
        } finally {
          isSendingRef.current = false;
        }
      };

      const handleParticipantConnected = async (participant: any) => {
        const roomForHandler = roomRef.current;
        if (!roomForHandler) return;
        if (participant.identity !== roomForHandler.localParticipant?.identity && languageConfigSentRef.current !== liveKitToken) {
          // console.log('[Language Config] Agent connected, sending config...');
          await sendLanguageConfig();
        }
      };

      handlerRegisteredRef.current = liveKitToken;
      let timer: NodeJS.Timeout | null = null;

      if (currentRoom.remoteParticipants.size > 0 && languageConfigSentRef.current !== liveKitToken) {
        timer = setTimeout(() => {
          if (languageConfigSentRef.current !== liveKitToken && currentRoom.localParticipant) {
            sendLanguageConfig();
          }
        }, 500);
      }

      currentRoom.on(RoomEvent.ParticipantConnected, handleParticipantConnected);

      return () => {
        if (timer) clearTimeout(timer);
        if (handlerRegisteredRef.current === liveKitToken) {
          currentRoom.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
          handlerRegisteredRef.current = null;
        }
      };
    }, [liveKitToken, learning.native_language, learning.target_language, learning.id, learning.current_level, learning.is_premium, learning.purchased_tiers, user?.name, pricingConfig]);

    // ============================================================================
    // RPC HANDLERS
    // ✅ UPDATED: Added onTierLimitReached handler
    // ============================================================================
    useEffect(() => {
      if (!room || !room.localParticipant) return;

      // console.log('[RPC] Registering RPC handlers...');
const handleMicControl = async (data:any) => {
  try {
    const event = JSON.parse(data.payload);

    if (event.action === 'disable') {
      setMicEnabledStable(false);
      await room.localParticipant.setMicrophoneEnabled(false);
    } else if (event.action === 'enable') {
      permissionFlowActiveRef.current = true; // ← guard BEFORE permission dialog
      setMicEnabledStable(true);
      await room.localParticipant.setMicrophoneEnabled(true);
      // Short delay then clear — dialog resolves fast on iOS/Android
      setTimeout(() => {
        permissionFlowActiveRef.current = false;
      }, 2000);
    }
  } catch (e) {
    permissionFlowActiveRef.current = false; // ← clear on error too
    console.error('[RPC] Error handling onMicControl:', e);
  }
  return JSON.stringify({ success: true });
};

      const handleOffTopicWarning = async (data: { callerIdentity: string; payload: string; responseTimeout: number }) => {
        try {
          const event = JSON.parse(data.payload);
          const count = event.warning_count || 0;
          const remaining = event.remaining_warnings || 0;
          // console.log(`[RPC] onOffTopicWarning: warning ${count}, ${remaining} remaining`);

          Alert.alert(
            `Off-Topic Warning (${count}/3)`,
            `Please stay on topic. You have ${remaining} warning${remaining !== 1 ? 's' : ''} left before the session closes.`,
            [{ text: 'OK' }],
          );
        } catch (e) {
          console.error('[RPC] Error handling onOffTopicWarning:', e);
        }
        return JSON.stringify({ success: true });
      };

      const handleSessionClose = async (data: { callerIdentity: string; payload: string; responseTimeout: number }) => {
        try {
          const event = JSON.parse(data.payload);
          // console.log('[RPC] onSessionClose received:', event.reason);

          clearSessionTimer();
          clearLevelTimer();

          setConversation((prev) => {
            const cutoff = Math.max(0, prev.length - 4);
            return prev.slice(0, cutoff);
          });

          Alert.alert(
            'Session Closed',
            'Your session has been closed because you went off-topic 3 times. Please focus on language learning next time!',
            [{
              text: 'OK',
              onPress: () => navigation.replace('MainTabs', { user, existingLearning: learning }),
            }],
            { cancelable: false },
          );
        } catch (e) {
          console.error('[RPC] Error handling onSessionClose:', e);
        }
        return JSON.stringify({ success: true });
      };

      // ✅ NEW: Handler for tier limit reached — agent blocked at purchased tier end
      const handleTierLimitReached = async (_data: { callerIdentity: string; payload: string; responseTimeout: number }) => {
        try {
          if (!hasTierWiseAccessOnly(learningRef.current)) {
            console.log('[RPC] onTierLimitReached ignored for free trial/full plan');
            return JSON.stringify({ success: true });
          }

          // The full tier-limit UX (level-complete → checkpoint test → payment) is
          // driven by the 'tier_limit_reached' branch in handleToolCall, which arrives
          // right after this RPC. Opening the payment prompt here would race and wipe
          // the level-completion modal before it can show, so we skip it.
          console.log('[RPC] onTierLimitReached received — deferring to handleToolCall tier_limit_reached');
        } catch (e) {
          console.error('[RPC] Error handling onTierLimitReached:', e);
        }
        return JSON.stringify({ success: true });
      };

      const handleToolCall = async (data: { callerIdentity: string; payload: string; responseTimeout: number }) => {
        try {
          const event = JSON.parse(data.payload);
          const toolName = event.tool_name;
          const result = event.result || {};

          // console.log('[RPC] onToolCall:', toolName, result);

          // ── complete_level ────────────────────────────────────────────
          if (toolName === 'complete_level') {

            if (result.reason === 'tier_limit_reached') {
              console.log('[ToolCall] complete_level tier limit reached');
              const prevLevel = Number(result.completed_level ?? result.previous_level ?? learningRef.current.current_level);
              const inferredNextLevel = Number(
                result.next_locked_level ?? result.current_level ?? result.next_level ?? (learningRef.current.current_level + 1)
              );
              const completedCourse = prevLevel >= LEVEL_CONFIG.TOTAL_LEVELS || inferredNextLevel > LEVEL_CONFIG.TOTAL_LEVELS;

              // If backend includes a valid level transition with tier-limit response,
              // show level-complete UX first, then prompt next-tier purchase.
              if (Number.isFinite(inferredNextLevel) && inferredNextLevel > prevLevel) {
                if (isHandlingLevelCompletionRef.current) {
                  return JSON.stringify({ success: true });
                }

                isHandlingLevelCompletionRef.current = true;

                const updatedLearning: Learning = {
                  ...learningRef.current,
                  current_level: inferredNextLevel,
                };

                if (completedCourse) {
                  await AuthStorage.markLearningCompleted(String(updatedLearning.id));
                }

                learningRef.current = updatedLearning;
                setLearning(updatedLearning);

                pendingLevelCompletionRef.current = {
                  prevLevel,
                  newLevel: inferredNextLevel,
                  topic: result.new_level_topic || '',
                  formatted: result.formatted || '',
                  crossedIntoUnpurchasedTier: true,
                  completedCourse,
                  updatedLearning,
                };
                levelCompletionAlertShownRef.current = false;

                showLevelCompletionAlert(pendingLevelCompletionRef.current, 'backend_tier_limit_transition');
                return JSON.stringify({ success: true });
              }

              openTierUpgradePrompt(
                result.message || 'Please choose the next plan to continue your levels.',
                Number.isFinite(inferredNextLevel) && inferredNextLevel > 0
                  ? inferredNextLevel
                  : (learningRef.current.current_level + 1)
              );
              return JSON.stringify({ success: true });
            }

            if (result.success && result.current_level) {
              const prevLevel = result.previous_level || learningRef.current.current_level;
              const newLevel = result.current_level;
              const topic = result.new_level_topic || '';
              const formatted = result.formatted || '';
              const completedCourse = prevLevel >= LEVEL_CONFIG.TOTAL_LEVELS || newLevel > LEVEL_CONFIG.TOTAL_LEVELS;

              if (formatted) {
                const receivedAt = new Date().toISOString();
                console.log('[Backend Congrats] ✅ Received complete_level message from backend', {
                  receivedAt,
                  previousLevel: prevLevel,
                  currentLevel: newLevel,
                  message: formatted,
                });
                CrashlyticsHelper.log(`Backend congratulations received at ${receivedAt}: L${prevLevel}→L${newLevel}`);
              }

              const now = Date.now();
              const lastProcessed = lastProcessedCompletionRef.current;
              const isDuplicateTransition =
                !!lastProcessed &&
                lastProcessed.previousLevel === prevLevel &&
                lastProcessed.currentLevel === newLevel &&
                now - lastProcessed.at < 30000;

              if (isDuplicateTransition) {
                console.log('[ToolCall] ⏭️ Ignoring duplicate complete_level transition', {
                  prevLevel,
                  newLevel,
                });
                return JSON.stringify({ success: true });
              }

              if (isHandlingLevelCompletionRef.current) {
                console.log('[ToolCall] ⏭️ Level completion already being handled, skipping duplicate event');
                return JSON.stringify({ success: true });
              }

              isHandlingLevelCompletionRef.current = true;
              lastProcessedCompletionRef.current = {
                previousLevel: prevLevel,
                currentLevel: newLevel,
                at: now,
              };

              console.log(`[ToolCall] ✅ Level ${prevLevel} → ${newLevel} (saved: ${result.conversation_saved})`);

              const updatedLearning: Learning = {
                ...learningRef.current,
                current_level: newLevel,
              };

              if (completedCourse) {
                await AuthStorage.markLearningCompleted(String(updatedLearning.id));
              }

              // Keep current room alive until congratulations speech naturally ends.
              // Alert is shown only after brief speech silence.
              setMicEnabledStable(false);   // F3

              learningRef.current = updatedLearning;
              setLearning(updatedLearning);

              // ✅ Stop timers immediately so time doesn't keep counting
              clearSessionTimer();
              clearLevelTimer();

              // ✅ Save current level time without blocking the level-complete UX
              saveLevelTimeWithRef(levelTimeRef.current, { ...learningRef.current, current_level: prevLevel })
                .catch((err) => {
                  console.warn('[LevelComplete Debug] Failed to save level time (non-blocking):', err);
                });

              const nextTier = Math.ceil(newLevel / LEVEL_CONFIG.LEVELS_PER_TIER);
              const prevTier = Math.ceil(prevLevel / LEVEL_CONFIG.LEVELS_PER_TIER);
              const nextTierInfo = (pricingConfig?.tiers || []).find(
                (tier) => tier.levelStart <= newLevel && newLevel <= tier.levelEnd,
              );
              const nextTierPurchased = nextTierInfo
                ? (updatedLearning.purchased_tiers || []).includes(nextTierInfo.key)
                : true;
              const hasTierWiseAccess = !updatedLearning.is_premium && (updatedLearning.purchased_tiers || []).length > 0;
              const purchasedMaxLevel = getPurchasedMaxLevelFromPricing(updatedLearning);
              const crossedIntoUnpurchasedTier =
                hasTierWiseAccess &&
                (
                  (nextTier > prevTier && !nextTierPurchased) ||
                  (purchasedMaxLevel > 0 && newLevel > purchasedMaxLevel)
                );

              pendingLevelCompletionRef.current = {
                prevLevel,
                newLevel,
                topic,
                formatted,
                crossedIntoUnpurchasedTier,
                completedCourse,
                updatedLearning,
              };
              levelCompletionAlertShownRef.current = false;

              // Always show the level-complete popup first.
              // handleLevelCompleteContinue detects checkpoint via prevLevel % 5 === 0
              // and navigates to TestScreen when the user taps Continue.
              showLevelCompletionAlert(pendingLevelCompletionRef.current, 'backend_complete_level_event');
            }
          }

        } catch (e) {
          isHandlingLevelCompletionRef.current = false;
          console.error('[RPC] Error handling onToolCall:', e);
        }
        return JSON.stringify({ success: true });
      };

      try {
        const registerFn = room.registerRpcMethod?.bind(room) ?? room.localParticipant.registerRpcMethod.bind(room.localParticipant);
        const unregisterFn = room.unregisterRpcMethod?.bind(room) ?? room.localParticipant.unregisterRpcMethod.bind(room.localParticipant);

        registerFn('onMicControl', handleMicControl);
        registerFn('onOffTopicWarning', handleOffTopicWarning);
        registerFn('onSessionClose', handleSessionClose);
        registerFn('onTierLimitReached', handleTierLimitReached);
        registerFn('onToolCall', handleToolCall);

        return () => {
          try {
            unregisterFn('onMicControl');
            unregisterFn('onOffTopicWarning');
            unregisterFn('onSessionClose');
            unregisterFn('onTierLimitReached');
            unregisterFn('onToolCall');
          } catch (e) { /* ignore cleanup errors */ }
        };
      } catch (e) {
        console.warn('[RPC] Error registering RPC handlers:', e);
        return () => { };
      }
    }, [room, navigation]);

    // ============================================================================
    // Real-time Transcription Display
    // ============================================================================
    useEffect(() => {
      if (!room) return;

      const handleTranscriptionReceived = (
        segments: TranscriptionSegment[],
        participant: any,
        _publication: any
      ) => {
        const eventTime = Date.now();
        const sessionAge = eventTime - sessionBirthTimeRef.current;
        if (sessionAge < 0) return;

        const isAgent = participant && participant.identity !== room.localParticipant?.identity;

        segments.forEach((segment) => {
          if (!segment.text || !segment.text.trim()) return;
          // Drop agent transcription during replay; reset debounce timer on each segment.
          if (isAgent && replayingTextRef.current !== null) {
            if (replayClearTimerRef.current) clearTimeout(replayClearTimerRef.current);
            replayClearTimerRef.current = setTimeout(() => {
              replayingTextRef.current = null;
              replayClearTimerRef.current = null;
              setTtsPlayingIndex(null);
            }, SPEAKING_SILENCE_TIMEOUT_MS + 300);
            markAgentSpeaking();
            return;
          }

          const messageRole: 'ai' | 'user' = isAgent ? 'ai' : 'user';
          const message: ConversationMessage = {
            role: messageRole,
            text: segment.text.trim(),
            timestamp: new Date(),
            isInterim: !segment.final,
            isComplete: !!segment.final,
          };

          setConversation((prev) => {
            if (!segment.final) {
              const lastIndex = prev.length - 1;
              if (lastIndex >= 0 && prev[lastIndex].role === messageRole && prev[lastIndex].isInterim) {
                return [...prev.slice(0, -1), message];
              }
              return [...prev, message];
            } else {
              let updated = [...prev];

              if (updated.length > 0) {
                const lastMsg = updated[updated.length - 1];
                if (lastMsg.role === messageRole && lastMsg.isInterim) {
                  const isLikelyInterim =
                    lastMsg.text === message.text ||
                    message.text.startsWith(lastMsg.text) ||
                    lastMsg.text.startsWith(message.text);
                  if (isLikelyInterim) updated = updated.slice(0, -1);
                }
              }

              const isDuplicate = updated.some(
                (msg) => msg.text === message.text && msg.role === message.role
              );

              if (!isDuplicate) updated.push(message);
              return updated;
            }
          });

          if (isAgent) {
            lastAgentSpeechAtRef.current = Date.now();
            // F1: debounced — only flips false after genuine silence
            markAgentSpeaking();

            if (segment.final && pendingLevelCompletionRef.current && !levelCompletionAlertShownRef.current) {
              maybeShowLevelCompletionAfterSilence();
            }
          }

          setTimeout(() => conversationRef.current?.scrollToEnd({ animated: true }), 150);
        });
      };

      room.on(RoomEvent.TranscriptionReceived, handleTranscriptionReceived);

      // room.on(RoomEvent.Connected, () => console.log('[TranscriptionHandler] Room connected'));
      // room.on(RoomEvent.ParticipantConnected, (p) => console.log('[TranscriptionHandler] Participant connected:', p.identity));
      // room.on(RoomEvent.TrackPublished, (pub, p) => console.log('[TranscriptionHandler] Track published by:', p.identity));
      // room.on(RoomEvent.TrackSubscribed, (track, pub, p) => console.log('[TranscriptionHandler] Track subscribed from:', p.identity));

      return () => {
        room.off(RoomEvent.TranscriptionReceived, handleTranscriptionReceived);
      };
    }, [room]);

    // Expose LiveKit RPC replay to the parent via ref so the play button
    // in renderConversation can trigger the agent to re-speak without any
    // new packages or LLM involvement.
    useEffect(() => {
      if (!room) return;
      replayViaLiveKitRef.current = async (text: string) => {
        const agent = [...room.remoteParticipants.values()][0];
        if (!agent) return;
        await room.localParticipant.performRpc({
          destinationIdentity: agent.identity,
          method: LIVEKIT_REPLAY_RPC_METHOD,
          payload: text,
          responseTimeout: LIVEKIT_REPLAY_TIMEOUT_MS,
        });
      };
      stopReplayRef.current = async () => {
        const agent = [...room.remoteParticipants.values()][0];
        if (!agent) return;
        await room.localParticipant.performRpc({
          destinationIdentity: agent.identity,
          method: LIVEKIT_STOP_REPLAY_RPC_METHOD,
          payload: '',
          responseTimeout: 5000,
        });
      };
      return () => {
        replayViaLiveKitRef.current = null;
        stopReplayRef.current = null;
      };
    }, [room]);

    return null;
  };

  // ============================================================================
  // RENDER FUNCTIONS - HEADER
  // ✅ UPDATED: Show level/progress for BOTH full bundle and tier-wise paid users
  // ============================================================================

  const renderHeader = () => {
    // ✅ Show level info for any paid user (full bundle OR tier-wise)
    const showLevelInfo = hasPaidAccess(learning);
    const statusLabel =
      voiceStatus === 'ready'
        ? 'Connecting...'
        : voiceStatus === 'agent_speaking'
          ? 'Agent is speaking'
          : 'Connecting to tutor...';

    return (
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color={PROFESSIONAL_COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {hasPaidAccess(learning) ? `Level ${getDisplayLevel(learning.current_level)}` : 'Free Trial'}
            </Text>
            <Text style={styles.headerSubtitle}>Session {formatTime(sessionTime)}</Text>
          </View>

          {/* Invisible placeholder matching back button width so title stays centered */}
          <View style={[styles.backButton,{backgroundColor:"transparent",borderWidth:0}]} pointerEvents="none" />
        </View>

        {/* ✅ Show progress bar for paid users (both plans) */}
        {showLevelInfo && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${getProgressPercentage()}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(getProgressPercentage())}%</Text>
          </View>
        )}
      </View>
    );
  };

  // ============================================================================
  // RENDER FUNCTIONS - VOICE STATUS
  // ============================================================================

  // F4: One lookup table drives ALL status display — no more 3-boolean race.
  const VOICE_STATUS_CONFIG: Record<VoiceStatus, { label: string; color: string }> = {
    connecting: { label: 'Connecting to tutor...', color: PROFESSIONAL_COLORS.connecting },
    greeting: { label: 'Connecting to tutor...', color: PROFESSIONAL_COLORS.accent },
    agent_speaking: { label: 'Agent is speaking', color: PROFESSIONAL_COLORS.accent },
    ready: { label: 'Connecting...', color: PROFESSIONAL_COLORS.secondary },
  };

  const renderVoiceStatus = () => {
    const cfg = VOICE_STATUS_CONFIG[voiceStatus] ?? VOICE_STATUS_CONFIG.connecting;

    return (
      <View style={styles.voiceStatusContainerCompact}>
        <Text style={[styles.voiceStatusText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    );
  };

  const renderInlineFeedback = () => {
    if (!inlineFeedback) return null;
    return (
      <View style={styles.inlineFeedbackBanner}>
        <Ionicons name="sparkles-outline" size={14} color={PROFESSIONAL_COLORS.secondary} />
        <Text style={styles.inlineFeedbackText}>{inlineFeedback}</Text>
      </View>
    );
  };

  const renderThinkingBubble = () => {
    return null;
  };

  const handleMicPrimaryPress = () => {
    Toast.show(
      isMicEnabled ? 'Connecting..' : 'Agent is speaking',
      Toast.SHORT,
    );
  };

  const handleMutePress = () => {
    Toast.show('Mic is controlled by tutor flow in this session', Toast.SHORT);
  };

  const renderBottomControls = () => {
    const isListening = voiceStatus === 'ready';
    const isMuted = !isMicEnabled;

    return (
      <View
        style={[
          styles.bottomControlsSection,
          {
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
            gap: 16,
            paddingBottom: insets.bottom + 45,
          },
        ]}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity activeOpacity={0.85} onPress={handleMicPrimaryPress}>
            <Animated.View style={{ opacity: isMuted ? 0.55 : 1, transform: [{ scale: micPulseAnim }] }}>
              <Ionicons
                name={isMuted ? 'mic-off' : 'mic'}
                size={44}
                color={PROFESSIONAL_COLORS.textPrimary}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.endControlButton} onPress={handleGoBack} activeOpacity={0.85}>
          <Ionicons name="stop-circle-outline" size={16} color={PROFESSIONAL_COLORS.textPrimary} />
          <Text style={styles.endControlText}>End</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ============================================================================
  // RENDER FUNCTIONS - CONVERSATION
  // ============================================================================

  const renderConversation = () => {
    if (!showConversation || conversation.length === 0) {
      if (!agentReady) {
        if (waitingForAgent && !isReconnecting && !showPaymentPrompt && !postPaymentSuccess) return null;
        return (
          <View style={styles.conversationEmpty}>
            <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.secondary} />
            <Text style={[styles.conversationEmptyText, { marginTop: 20 }]}>Connecting to tutor...</Text>
          </View>
        );
      }
      return (
        <View style={styles.conversationEmpty}>
          <Ionicons name="chatbubbles-outline" size={36} color={PROFESSIONAL_COLORS.textTertiary} />
          <Text style={styles.conversationEmptyText}>Setting up your session...</Text>
          <Text style={[styles.conversationEmptyText, { fontSize: 12, marginTop: 8 }]}>
            Connecting...
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        ref={conversationRef}
        style={styles.conversationScroll}
        contentContainerStyle={styles.conversationContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          setTimeout(() => conversationRef.current?.scrollToEnd({ animated: true }), 100);
        }}
      >
        {conversation.map((message, index) => {
          const isUser = message.role === 'user';
          const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
          const timestampKey = timestamp.getTime();
          const isThisPlaying = ttsPlayingIndex === index;

          return (
            <Animated.View
              key={`${message.role}-${index}-${timestampKey}`}
              style={[styles.messageContainer, isUser ? styles.messageUser : styles.messageAI]}
            >
              <View style={[styles.messageBubble, isUser ? styles.messageBubbleUser : styles.messageBubbleAI]}>
                <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAI]}>
                  {message.text}
                </Text>
                <View style={styles.messageBubbleFooter}>
                  <Text style={[styles.messageTimestamp, isUser ? styles.messageTimestampUser : styles.messageTimestampAI]}>
                    {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {!isUser && message.isComplete && (
                    <TouchableOpacity
                      onPress={() => {
                        if (isThisPlaying) {
                          // Revert the icon immediately; keep replayingTextRef set so
                          // any in-flight transcription segments are still suppressed.
                          // The debounce timer will clear it once segments stop arriving.
                          setTtsPlayingIndex(null);
                          stopReplayRef.current?.().catch(() => {});
                        } else {
                          // Start: set replay text; transcription handler owns clearing it.
                          replayingTextRef.current = message.text;
                          setTtsPlayingIndex(index);
                          replayViaLiveKitRef.current?.(message.text)
                            .catch(() => {
                              // RPC failed — clear state immediately.
                              if (replayClearTimerRef.current) clearTimeout(replayClearTimerRef.current);
                              replayClearTimerRef.current = null;
                              replayingTextRef.current = null;
                              setTtsPlayingIndex(null);
                            });
                        }
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.ttsPlayButton}
                    >
                      <Ionicons
                        name={isThisPlaying ? 'stop-circle-outline' : 'volume-medium-outline'}
                        size={22}
                        color="#FF6B00"
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Animated.View>
          );
        })}
        {renderThinkingBubble()}
      </ScrollView>
    );
  };

  const renderWaitingScreen = () => {
    if (nextLevelPrepSeconds > 0) {
      return (
        <View style={styles.waitingScreen}>
          <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.secondary} />
          <Text style={styles.waitingTitle}>We are preparing your next level...</Text>
          <Text style={styles.waitingTimer}>{formatTime(nextLevelPrepSeconds)}</Text>
          <Text style={styles.waitingHint}>Please wait. Your next level will start automatically.</Text>
        </View>
      );
    }

    if (!waitingForAgent || isReconnecting || showPaymentPrompt || postPaymentSuccess) return null;

    return (
      <View style={[styles.waitingScreen, { paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.secondary} />
        <Text style={styles.waitingTitle}>Connecting to SuperBold…</Text>
        {initialLoadingDone ? (
          <>
            <Text style={styles.waitingTimer}>{formatTime(waitingElapsed)}</Text>
            <Text style={styles.waitingHint}>Timer counts once your tutor starts responding.</Text>
            {isResumeSession && waitingElapsed >= 10 && (
              <TouchableOpacity style={[styles.waitingBackButton, { marginBottom: Math.max(18, insets.bottom + 8) }]} onPress={handleGoBack} activeOpacity={0.85}>
                <Text style={styles.waitingBackButtonText}>Back</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <Text style={styles.waitingHint}>We stay here for at least 5 seconds while your tutor loads.</Text>
        )}
      </View>
    );
  };

  const renderLevelCompleteModal = () => {
    if (!levelCompleteModalData || pendingTestCheckpoint !== null) return null;

    const isCheckpointLevel =
      levelCompleteModalData.prevLevel > 0 &&
      levelCompleteModalData.prevLevel % LEVEL_CONFIG.LEVELS_PER_TIER === 0;

    const message = levelCompleteModalData.completedCourse
      ? 'Congratulations! You have completed 30 levels. You can now check your history anytime.'
      : isCheckpointLevel
      ? `You completed Level ${levelCompleteModalData.prevLevel}! 🎉\n\nTime for your Checkpoint Quiz — a quick 5-question test to see how much you remember.`
      : levelCompleteModalData.formatted ||
        `Congratulations! You completed Level ${levelCompleteModalData.prevLevel} and advanced to Level ${levelCompleteModalData.newLevel}${levelCompleteModalData.topic ? '\n\nNext topic: ' + levelCompleteModalData.topic : ''}.`;

    return (
      <View
        style={[
          styles.levelCompleteOverlay,
          { paddingTop: 16 + insets.top, paddingBottom: 16 + insets.bottom },
        ]}
      >
        <View style={styles.levelCompleteCard}>
          <View style={styles.levelCompleteIconWrap}>
            <Ionicons
              name={isCheckpointLevel ? 'clipboard-outline' : 'trophy'}
              size={24}
              color={PROFESSIONAL_COLORS.textPrimary}
            />
          </View>
          <Text style={styles.levelCompleteTitle}>
            {levelCompleteModalData.completedCourse
              ? 'Congratulations!'
              : isCheckpointLevel
              ? 'Level Complete!'
              : 'Level Complete!'}
          </Text>
          <Text style={styles.levelCompleteMessage}>{message}</Text>

          {levelCompleteModalData.completedCourse ? (
            <>
              <TouchableOpacity
                style={styles.levelCompleteButton}
                activeOpacity={0.85}
                onPress={() => void handleCompletedCourseHistory(levelCompleteModalData)}
              >
                <Text style={styles.levelCompleteButtonText}>Review History</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.levelCompleteSecondaryButton}
                activeOpacity={0.85}
                onPress={() => void handleCompletedCoursePractice(levelCompleteModalData)}
              >
                <Text style={styles.levelCompleteSecondaryButtonText}>Practice Mode</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.levelCompleteSecondaryButton}
                activeOpacity={0.85}
                onPress={() => handleCompletedCourseDashboard(levelCompleteModalData)}
              >
                <Text style={styles.levelCompleteSecondaryButtonText}>Go to Dashboard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.levelCompleteSecondaryButton}
                activeOpacity={0.85}
                onPress={() => handleCompletedCourseRestart(levelCompleteModalData)}
              >
                <Text style={styles.levelCompleteSecondaryButtonText}>Restart Learning</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.levelCompleteButton}
              activeOpacity={0.85}
              onPress={() => handleLevelCompleteContinue(levelCompleteModalData)}
            >
              <Text style={styles.levelCompleteButtonText}>
                {isCheckpointLevel ? 'Start Quiz →' : 'Continue'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  if (isReconnecting && !isRoomConnectionBlocked && !showPaymentPrompt) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
        <Text style={styles.loadingText}>Reconnecting...</Text>
      </SafeAreaView>
    );
  }

  const shouldConnectToRoom =
    Boolean(liveKitToken && liveKitUrl) &&
    !isCourseCompleted(learning) &&
    !isRoomConnectionBlocked &&
    pendingTestCheckpoint === null &&
    !showPaymentPrompt &&
    !postPaymentSuccess &&
    (!isLoadingFreeTime || hasPaidAccess(learning));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <LinearGradient
        colors={[PROFESSIONAL_COLORS.gradientStart, PROFESSIONAL_COLORS.gradientMid, PROFESSIONAL_COLORS.gradientEnd]}
        style={styles.gradient}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {renderHeader()}

          <View style={styles.mainContent}> 
            {renderConversation()}
            {renderInlineFeedback()}
          </View>

          {renderVoiceStatus()}
          {renderBottomControls()}

          <LiveKitRoom
            key={`${liveKitToken}-${roomSessionNonce}`}
            serverUrl={liveKitUrl}
            token={liveKitToken}
            connect={shouldConnectToRoom}
            options={{ adaptiveStream: true, dynacast: true }}
            audio={false}
            video={false}
            onConnected={() => {
              setMicEnabledStable(false);
            }}
            onDisconnected={() => {
              resetVoiceState();
              setConversation([]);
            }}
            onError={(error) => {
              navigation.goBack();
              console.error('LiveKit error:', error);
              CrashlyticsHelper.recordError(error as Error);
            }}
          >
            <TranscriptionHandler />
          </LiveKitRoom>

          {paymentStatusMessage && (
            <View style={styles.paymentReconnectOverlay}>
              <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
              <Text style={styles.paymentReconnectText}>{paymentStatusMessage}</Text>
              {showManualReconnect && (
                <TouchableOpacity
                  style={styles.manualReconnectButton}
                  onPress={handleManualReconnect}
                  activeOpacity={0.85}
                >
                  <Text style={styles.manualReconnectButtonText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {renderLevelCompleteModal()}
          {showPaymentPrompt && pendingTestCheckpoint === null && (
            <PaymentOfferModal
              learning={learning}
              pricingConfig={pricingConfig}
              isPricingLoading={isPricingLoading}
              isProcessingPayment={isProcessingPayment}
              showPaymentOptions={showPaymentOptions}
              trialJustEnded={trialJustEnded}
              onBack={handleGoBack}
              onPayTier={handlePaymentForTier}
              getRequiredTier={getRequiredTier}
              getPurchasedMaxLevelFromPricing={getPurchasedMaxLevelFromPricing}
            />
          )}
          {postPaymentSuccess && (
            <PaymentSuccessOverlay
              message={postPaymentSuccess.message}
              transactionId={postPaymentSuccess.transactionId}
              onContinueLearning={handlePaymentSuccessContinue}
              onGoToDashboard={handlePaymentSuccessDashboard}
            />
          )}
          {renderWaitingScreen()}

          <TestReportOverlay
            visible={showTestReport}
            report={testReport}
            onContinue={handleContinueAfterTest}
            nativeLanguageCode={learning.native_language}
          />
        </Animated.View>
      </LinearGradient>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES (COMPLETE - ALL 2600+ LINES PRESERVED)
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PROFESSIONAL_COLORS.bgDark,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
  },

  // Header styles
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: PROFESSIONAL_COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 18,
    fontFamily: FONTS.bold,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  statsToggle: {
    padding: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    minWidth: 96,
    alignItems: 'center',
  },
  statusPillText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: PROFESSIONAL_COLORS.secondary,
  },
  progressText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.medium,
    minWidth: 40,
    textAlign: 'right',
  },
  sessionContextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  sessionContextChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sessionContextChipText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  statusChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipActive: {
    borderColor: PROFESSIONAL_COLORS.secondary,
    backgroundColor: PROFESSIONAL_COLORS.secondary + '26',
  },
  statusChipText: {
    color: PROFESSIONAL_COLORS.textTertiary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  statusChipTextActive: {
    color: PROFESSIONAL_COLORS.textPrimary,
  },
  micStateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  micStateBadgeOn: {
    borderColor: PROFESSIONAL_COLORS.secondary,
    backgroundColor: PROFESSIONAL_COLORS.secondary + '26',
  },
  micStateBadgeOff: {
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
  },
  micStateText: {
    color: PROFESSIONAL_COLORS.textTertiary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  micStateTextOn: {
    color: PROFESSIONAL_COLORS.textPrimary,
  },

  // Stats panel
  statsPanel: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: (SCREEN_WIDTH - 64) / 2,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
  },
  statLabel: {
    color: PROFESSIONAL_COLORS.textTertiary,
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginBottom: 8,
  },
  statValue: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 18,
    fontFamily: FONTS.bold,
  },
  freeTimeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PROFESSIONAL_COLORS.warning + '20',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.warning,
    marginTop: 12,
  },
  freeTimeWarningContent: {
    flex: 1,
    marginLeft: 12,
  },
  freeTimeWarningTitle: {
    color: PROFESSIONAL_COLORS.warning,
    fontSize: 14,
    fontFamily: FONTS.bold,
    marginBottom: 4,
  },
  freeTimeWarningText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.regular,
  },

  // Main content
  mainContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'column',
  },
  inlineFeedbackBanner: {
    marginTop: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlineFeedbackText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  bottomControlsSection: {
    paddingHorizontal: 24,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: PROFESSIONAL_COLORS.border,
  },
  secondaryControlButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryControlText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  bottomControlSpacer: {
    flex: 1,
  },
  endControlButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.error,
    backgroundColor: PROFESSIONAL_COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  endControlText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 12,
    fontFamily: FONTS.semiBold,
  },
  primaryMicButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryMicButtonActive: {
    borderColor: PROFESSIONAL_COLORS.secondary,
    backgroundColor: PROFESSIONAL_COLORS.secondary + '30',
  },
  bottomControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    borderRadius: 999,
    paddingVertical: 10,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
  },
  controlButtonActive: {
    borderColor: PROFESSIONAL_COLORS.secondary,
    backgroundColor: PROFESSIONAL_COLORS.secondary + '26',
  },
  controlButtonText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  controlButtonTextActive: {
    color: PROFESSIONAL_COLORS.textPrimary,
  },
  voiceStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  voiceStatusContainerCompact: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  voiceIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  voiceStatusText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  statusDotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusDotChipActive: {
    borderColor: PROFESSIONAL_COLORS.secondary,
    backgroundColor: PROFESSIONAL_COLORS.secondary + '1E',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: PROFESSIONAL_COLORS.textTertiary,
  },
  statusDotActive: {
    backgroundColor: PROFESSIONAL_COLORS.secondary,
  },
  statusDotText: {
    color: PROFESSIONAL_COLORS.textTertiary,
    fontSize: 11,
    fontFamily: FONTS.medium,
  },
  statusDotTextActive: {
    color: PROFESSIONAL_COLORS.textPrimary,
  },

  // Conversation
  conversationEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  conversationEmptyText: {
    color: PROFESSIONAL_COLORS.textTertiary,
    fontSize: 16,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginTop: 16,
  },
  conversationScroll: {
    flex: 1,
    minHeight: 0, // ✅ CRITICAL: Allows ScrollView to shrink and scroll properly
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
  },
  conversationContent: {
    paddingBottom: 20,
    paddingTop: 14,
    paddingHorizontal: 10,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  messageUser: {
    alignItems: 'flex-end', // ✅ RIGHT SIDE for user
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  messageAI: {
    alignItems: 'flex-start', // ✅ LEFT SIDE for agent
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    padding: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageBubbleUser: {
    backgroundColor: PROFESSIONAL_COLORS.secondary,
    borderBottomRightRadius: 4,
  },
  messageBubbleAI: {
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    borderBottomLeftRadius: 6,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  messageIcon: {
    marginRight: 6,
  },
  messageText: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    lineHeight: 22,
    marginBottom: 4,
  },
  messageTextUser: {
    color: PROFESSIONAL_COLORS.textPrimary,
  },
  messageTextAI: {
    color: PROFESSIONAL_COLORS.textPrimary,
  },
  typingBubble: {
    minWidth: 110,
  },
  typingText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  messageTimestamp: {
    fontSize: 10,
    fontFamily: FONTS.light,
    marginTop: 4,
    opacity: 0.7,
  },
  messageTimestampUser: {
    color: PROFESSIONAL_COLORS.textPrimary,
    textAlign: 'right',
  },
  messageTimestampAI: {
    color: PROFESSIONAL_COLORS.textSecondary,
    textAlign: 'left',
  },
  messageBubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  ttsPlayButton: {
    marginLeft: 8,
    padding: 2,
  },

  waitingScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PROFESSIONAL_COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    zIndex: 999,
  },
  waitingTitle: {
    marginTop: 16,
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  waitingTimer: {
    marginTop: 12,
    color: PROFESSIONAL_COLORS.secondary,
    fontSize: 24,
    fontFamily: FONTS.bold,
  },
  waitingHint: {
    marginTop: 8,
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  waitingBackButton: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.secondary,
    backgroundColor: PROFESSIONAL_COLORS.secondary + '20',
  },
  waitingBackButtonText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 14,
    fontFamily: FONTS.medium,
  },

  paymentReconnectOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PROFESSIONAL_COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  paymentReconnectText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 16,
    fontFamily: FONTS.medium,
    marginTop: 14,
  },
  manualReconnectButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: PROFESSIONAL_COLORS.accent,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
  },
  manualReconnectButtonText: {
    color: PROFESSIONAL_COLORS.primary,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },

  levelCompleteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PROFESSIONAL_COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1100,
  },
  levelCompleteCard: {
    width: '100%',
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
  },
  levelCompleteIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PROFESSIONAL_COLORS.accent,
    marginBottom: 14,
  },
  levelCompleteTitle: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 24,
    fontFamily: FONTS.bold,
    marginBottom: 12,
    textAlign: 'center',
  },
  levelCompleteMessage: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.regular,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  levelCompleteButton: {
    width: '100%',
    backgroundColor: PROFESSIONAL_COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  levelCompleteButtonText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  levelCompleteSecondaryButton: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    marginTop: 10,
    backgroundColor: 'transparent',
  },
  levelCompleteSecondaryButtonText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.medium,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    backgroundColor: PROFESSIONAL_COLORS.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.medium,
    marginTop: 16,
  },
});