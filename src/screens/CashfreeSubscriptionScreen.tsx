import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { CFPaymentGatewayService, CFErrorResponse } from 'react-native-cashfree-pg-sdk';
import { CFSubscriptionSession } from 'cashfree-pg-api-contract';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS } from '../constants';
import {
  GRADIENT_TAB_TOP_BAR,
  GRADIENT_TAB_HEADER_TITLE,
  GRADIENT_TAB_BODY_PADDING_TOP,
} from '../constants/screenHeader';
import { CrashlyticsHelper, AuthStorage } from '../helpers';
import { CASHFREE_GRANTING_STATUSES, toCFEnvironment } from '../payment/cashfreeConfig';
import {
  fetchAndroidPaywall,
  fetchCashfreeConfig,
  createCashfreeSubscription,
  verifyCashfreeSubscription,
  fetchCashfreeSubscriptionStatus,
  cancelCashfreeSubscription,
  CashfreeAndroidOffer,
  CashfreeAndroidPaywallContent,
  CashfreeStatusResponse,
} from '../payment/cashfreeSubscriptionService';
import { useCashfreeSubscription } from '../payment/useCashfreeSubscription';

type Props = NativeStackScreenProps<RootStackParamList, 'CashfreeSubscription'>;

type Phase =
  | 'loading'
  | 'unavailable'
  | 'active'
  | 'offer'
  | 'creating'
  | 'authorizing'
  | 'verifying'
  | 'success'
  | 'failed';

export function CashfreeSubscriptionScreen({ navigation, route }: Props) {
  const { user, existingLearning } = route.params;

  const [phase, setPhase] = useState<Phase>('loading');
  const [offer, setOffer] = useState<CashfreeAndroidOffer | null>(null);
  const [content, setContent] = useState<CashfreeAndroidPaywallContent | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<CashfreeStatusResponse>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const authTokenRef = useRef<string | null>(null);
  const subscriptionIdRef = useRef<string | null>(null);

  // §11 mobile integration: this sheet must never render on iOS (App Store 3.1.1 forbids
  // external purchase flows for digital content). ProfileScreen already gates the entry
  // point to Platform.OS === 'android'; this is defense in depth.
  useEffect(() => {
    if (Platform.OS !== 'android') {
      navigation.goBack();
    }
  }, [navigation]);

  const loadState = async () => {
    setPhase('loading');
    setErrorMessage(null);

    const token = await AuthStorage.getToken();
    if (!token) {
      setPhase('unavailable');
      return;
    }
    authTokenRef.current = token;

    const { ok: configOk, config } = await fetchCashfreeConfig(token);
    console.log('[CF-DEBUG] config:', JSON.stringify({ configOk, config }));
    if (!configOk || !config?.enabled) {
      // ANDROID_SUBSCRIPTION_ENABLED=false (the shipped default) lands here —
      // fall back to the existing PayU tier flow, nothing more to do on this screen.
      setPhase('unavailable');
      return;
    }

    const { ok: statusOk, data: status } = await fetchCashfreeSubscriptionStatus(token);
    console.log('[CF-DEBUG] status:', JSON.stringify({ statusOk, status }));
    if (statusOk && status?.active) {
      setSubscriptionStatus(status);
      setPhase('active');
      return;
    }

    const nativeLanguage = existingLearning?.native_language || 'en';
    const { ok: paywallOk, paywall } = await fetchAndroidPaywall(nativeLanguage);
    console.log('[CF-DEBUG] paywall:', JSON.stringify({ paywallOk, paywall }));
    if (!paywallOk || !paywall?.offer?.enabled) {
      setPhase('unavailable');
      return;
    }

    setOffer(paywall.offer);
    setContent(paywall.content ?? null);
    setPhase('offer');
  };

  useEffect(() => {
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native SDK fires this after the mandate authorization UI it opened is done — it only
  // confirms the client-side flow ended. /verify re-fetches from Cashfree server-side and
  // is the only thing that actually grants access. Never treat onVerify itself as a grant.
  useCashfreeSubscription({
    onVerify: async () => {
      const token = authTokenRef.current;
      const subscriptionId = subscriptionIdRef.current;
      if (!token || !subscriptionId) {
        setPhase('failed');
        return;
      }
      setPhase('verifying');
      const { ok, data } = await verifyCashfreeSubscription(token, subscriptionId);
      console.log('[CF-DEBUG] verify:', JSON.stringify({ ok, data, subscriptionId }));
      if (ok && data && CASHFREE_GRANTING_STATUSES.has(data.status as any)) {
        CrashlyticsHelper.log(`[CashfreeSubscription] verified status=${data.status}`);
        setPhase('success');
      } else {
        CrashlyticsHelper.log(`[CashfreeSubscription] verify did not grant: ${JSON.stringify(data)}`);
        setPhase('failed');
      }
    },
    onError: (error: CFErrorResponse, orderID: string) => {
      console.log(
        '[CF-DEBUG] onError:',
        JSON.stringify({ orderID, status: error.getStatus(), message: error.getMessage() })
      );
      CrashlyticsHelper.log(
        `[CashfreeSubscription] onError orderID=${orderID} status=${error.getStatus()} message=${error.getMessage()}`
      );
      setPhase('failed');
    },
  });

  const handleStartTrial = async () => {
    const token = authTokenRef.current;
    const planId = offer?.planId;
    if (!token || !planId) {
      setPhase('failed');
      return;
    }

    setPhase('creating');
    const { ok, status, data } = await createCashfreeSubscription(token, planId);
    console.log('[CF-DEBUG] create:', JSON.stringify({ ok, status, data, planId }));
    if (!ok || !data) {
      setErrorMessage('Could not start the mandate. Please try again in a moment.');
      setPhase('failed');
      return;
    }

    subscriptionIdRef.current = data.subscription_id;
    setPhase('authorizing');

    const session = new CFSubscriptionSession(
      data.subscription_session_id,
      data.subscription_id,
      toCFEnvironment(data.sdk_environment)
    );
    CFPaymentGatewayService.doSubscriptionPayment(session);
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Auto-Pay?',
      'You will keep premium access until the end of the current billing cycle, then it will not renew.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Auto-Pay',
          style: 'destructive',
          onPress: async () => {
            const token = authTokenRef.current;
            if (!token) return;
            const { ok } = await cancelCashfreeSubscription(token);
            if (ok) {
              loadState();
            } else {
              Alert.alert('Something went wrong', 'Could not cancel right now. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.bg, COLORS.bgLight, COLORS.bgLighter]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Premium Auto-Pay</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {phase === 'loading' && (
            <View style={styles.card}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          )}

          {phase === 'unavailable' && (
            <View style={styles.card}>
              <Ionicons name="time-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
              <Text style={styles.cardTitle}>Not Available Yet</Text>
              <Text style={styles.helperText}>
                Auto-Pay subscriptions aren't live for your account yet. You can still unlock
                levels from your Profile using the existing payment options.
              </Text>
            </View>
          )}

          {phase === 'active' && subscriptionStatus && (
            <View style={styles.card}>
              <View style={styles.resultIconWrap}>
                <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
              </View>
              <Text style={styles.cardTitle}>Auto-Pay Active</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Status</Text>
                <Text style={styles.summaryValue}>
                  {subscriptionStatus.subscription_status || 'active'}
                </Text>
              </View>
              {subscriptionStatus.expires_date && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Access Until</Text>
                  <Text style={styles.summaryValue}>{subscriptionStatus.expires_date}</Text>
                </View>
              )}
              {subscriptionStatus.next_charge_date && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Next Charge</Text>
                  <Text style={styles.summaryValue}>{subscriptionStatus.next_charge_date}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.secondaryButton} onPress={handleCancel}>
                <Text style={styles.secondaryButtonText}>Cancel Auto-Pay</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'offer' && offer && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{content?.heroTitle || 'Go Premium'}</Text>
              <Text style={styles.helperText}>
                {content?.box?.trialSubtitle || 'Unlock all 30 levels with a free trial.'}
              </Text>
              {offer.discountLabel && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Offer</Text>
                  <Text style={styles.summaryValue}>{offer.discountLabel}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Trial</Text>
                <Text style={styles.summaryValue}>
                  {content?.box?.trialTitle || `${offer.trialDays ?? 3} days free`}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Then</Text>
                <Text style={styles.summaryValue}>
                  {content?.box?.recurringTitle ||
                    `${offer.currencySymbol || '₹'}${offer.recurringAmount || '199'} / ${offer.recurringPeriod || 'month'}`}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Customer</Text>
                <Text style={styles.summaryValue}>
                  {user.name || 'User'} · {user.phone_number}
                </Text>
              </View>
              {content?.chargeReminder && (
                <Text style={[styles.helperText, { marginTop: 12, marginBottom: 0 }]}>
                  {content.chargeReminder}
                </Text>
              )}

              <TouchableOpacity style={styles.primaryButton} onPress={handleStartTrial} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>{content?.ctaPrimary || 'Start Free Trial'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'creating' && (
            <View style={styles.card}>
              <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.cardTitle}>Setting up…</Text>
            </View>
          )}

          {phase === 'authorizing' && (
            <View style={styles.card}>
              <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.cardTitle}>Authorizing…</Text>
              <Text style={styles.helperText}>
                Complete the mandate authorization in the Cashfree checkout.
              </Text>
            </View>
          )}

          {phase === 'verifying' && (
            <View style={styles.card}>
              <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.cardTitle}>Verifying…</Text>
              <Text style={styles.helperText}>Confirming your mandate before activating premium.</Text>
            </View>
          )}

          {(phase === 'success' || phase === 'failed') && (
            <View style={styles.card}>
              <View style={styles.resultIconWrap}>
                <Ionicons
                  name={phase === 'success' ? 'checkmark-circle' : 'close-circle'}
                  size={56}
                  color={phase === 'success' ? COLORS.success : COLORS.error}
                />
              </View>
              <Text style={styles.resultTitle}>
                {phase === 'success' ? 'Premium Activated' : 'Something Went Wrong'}
              </Text>
              <Text style={styles.helperText}>
                {phase === 'success'
                  ? 'Your 3-day free trial has started. All 30 levels are unlocked.'
                  : errorMessage || 'The mandate authorization was not completed. You can try again.'}
              </Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={loadState}>
                <Text style={styles.secondaryButtonText}>
                  {phase === 'success' ? 'Done' : 'Try Again'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  safeArea: { flex: 1 },
  header: {
    ...GRADIENT_TAB_TOP_BAR,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  headerTitle: {
    ...GRADIENT_TAB_HEADER_TITLE,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: GRADIENT_TAB_BODY_PADDING_TOP,
    paddingBottom: 60,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    marginBottom: 12,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    lineHeight: 20,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textDim,
    fontFamily: FONTS.regular,
  },
  summaryValue: {
    fontSize: 13,
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONTS.bold,
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  resultIconWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
});
