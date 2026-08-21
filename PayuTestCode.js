/**
 * PayuTestCode.js — LIVE MODE + WEBHOOK SUPPORT
 * ─────────────────────────────────────────────────────────────────────────────
 * ALL FIXES INCLUDED:
 *  ✅ environment: '0'  →  Live/Production (real money charged)
 *  ✅ userCredential: '' → guest mode (avoids HTML error page onError)
 *  ✅ iOS UPI: {UPI: ''} → shows all UPI apps on iPhone
 *  ✅ Android UPI: {UPI: 'TEZ'} → Google Pay priority
 *  ✅ Static hashes: vas_for_mobile_sdk + payment_related_details_for_mobile_sdk
 *  ✅ surl/furl: cbjs.payu.in/sdk/success|failure
 *  ✅ Async state fix: launchPayU accepts direct params
 *  ✅ Webhook: verifies server-side payment status after success callback
 *
 * MERCHANT DETAILS:
 *  Key:  o70Png   (from RoomScreen — your live key)
 *  Salt: fPGgqmZlMo22G7XKa3wmcCh9YPUpqPgk
 *  Merchant: Svar Technology Private Limited
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {useState, useEffect} from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  NativeModules,
  Alert,
  ScrollView,
  NativeEventEmitter,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {sha512} from 'js-sha512';
import LinearGradient from 'react-native-linear-gradient';

const {PayUBizSdk} = NativeModules;

// ─────────────────────────────────────────────────────────────────────────────
// MERCHANT CONFIG — LIVE CREDENTIALS
// ─────────────────────────────────────────────────────────────────────────────
const MERCHANT_KEY  = 'oYuxe0';
const MERCHANT_SALT = 'hvBr4Zoa3ucIPDjmwAsHbCEFm53IXe99';
const MERCHANT_NAME = 'Svar Technology Private Limited';
const MERCHANT_LOGO = 'Jio';

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT
//   '0' = Live / Production  (real money charged)
//   '1' = Staging / Test
// ─────────────────────────────────────────────────────────────────────────────
const ENVIRONMENT = '0';

// ─────────────────────────────────────────────────────────────────────────────
// CALLBACK URLs — SDK callbacks
// ─────────────────────────────────────────────────────────────────────────────
const SURL = 'https://learning-backend.scaleu.ai/success';
const FURL = 'https://learning-backend.scaleu.ai/failure';

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK — your backend endpoint to verify payment server-side
// Replace with your actual BASE_URL / endpoint
// ─────────────────────────────────────────────────────────────────────────────
const WEBHOOK_VERIFY_URL = 'https://learning-backend.scaleu.ai/payment/verify'; // ← update this

// ─────────────────────────────────────────────────────────────────────────────
// STATIC HASH GENERATION
// Required by PayU iOS SDK — without these the SDK falls back to web checkout
// and returns HTML instead of native screen → onError fires
//
// Formulas:
//   vas_for_mobile_sdk:
//     sha512( key + "|vas_for_mobile_sdk|default|" + salt )
//
//   payment_related_details_for_mobile_sdk:
//     sha512( key + "|payment_related_details_for_mobile_sdk|" + salt )
// ─────────────────────────────────────────────────────────────────────────────
const generateStaticHashes = () => {
  const vasHash = sha512(
    `${MERCHANT_KEY}|vas_for_mobile_sdk|default|${MERCHANT_SALT}`
  );
  const paymentRelatedHash = sha512(
    `${MERCHANT_KEY}|payment_related_details_for_mobile_sdk|${MERCHANT_SALT}`
  );
  return {
    vas_for_mobile_sdk: vasHash,
    payment_related_details_for_mobile_sdk: paymentRelatedHash,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT MODES — platform-aware
// iOS  → {UPI: ''} shows all UPI apps (GPay, PhonePe, Paytm, BHIM)
// Android → {UPI: 'TEZ'} sets Google Pay as priority UPI app
// ─────────────────────────────────────────────────────────────────────────────
const getPaymentModesOrder = () => {
  if (Platform.OS === 'ios') {
    return [
      {UPI: ''},            // '' = all UPI apps on iOS
      {Wallets: 'PAYTM'},
      {Wallets: 'PHONEPE'},
      {EMI: ''},
      {NB: ''},
      {CARD: ''},
    ];
  }
  return [
    {UPI: 'TEZ'},           // TEZ = Google Pay priority on Android
    {Wallets: 'PAYTM'},
    {EMI: ''},
    {Wallets: 'PHONEPE'},
    {NB: ''},
    {CARD: ''},
  ];
};

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK VERIFICATION
// Called after onPaymentSuccess to confirm payment server-side.
// Your backend should call PayU's Verify Payment API and return status.
//
// Expected backend response shape:
//   { verified: true, status: 'success', mihpayid: '...', amount: '...' }
//   { verified: false, reason: 'hash_mismatch' }
// ─────────────────────────────────────────────────────────────────────────────
const verifyPaymentWithWebhook = async (paymentData, authToken) => {
  try {
    console.log('🔗 Calling webhook to verify payment...', {
      mihpayid: paymentData.mihpayid,
      txnid: paymentData.txnid,
    });

    const response = await fetch(WEBHOOK_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? {Authorization: `Bearer ${authToken}`} : {}),
      },
      body: JSON.stringify({
        mihpayid:    paymentData.mihpayid,
        txnid:       paymentData.txnid,
        amount:      paymentData.amount,
        productinfo: paymentData.productinfo,
        email:       paymentData.email,
        status:      paymentData.status,
        hash:        paymentData.hash,
      }),
    });

    if (!response.ok) {
      console.warn('⚠️ Webhook returned non-OK status:', response.status);
      return {verified: false, reason: `http_${response.status}`};
    }

    const result = await response.json();
    console.log('✅ Webhook verification result:', result);
    return result;
  } catch (error) {
    console.error('❌ Webhook verification failed:', error);
    return {verified: false, reason: error.message};
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const PayuTestCode = () => {

  // ── Payment field state ────────────────────────────────────────────────────
  const [amount,      setAmount]      = useState('1');
  const [productInfo, setProductInfo] = useState('productInfo');
  const [firstName,   setFirstName]   = useState('firstName');
  const [email,       setEmail]       = useState('jay886631@gmail.com');
  const [phone,       setPhone]       = useState('9999999999');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showAlert,       setShowAlert]       = useState(false);
  const [isLoading,       setIsLoading]       = useState(false);
  const [isVerifying,     setIsVerifying]     = useState(false);
  const [paymentStatus,   setPaymentStatus]   = useState(null);
  const [webhookResult,   setWebhookResult]   = useState(null);

  // ── Initialize PayU on Android ─────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'android' && PayUBizSdk?.setMerchantInfo) {
      try {
        PayUBizSdk.setMerchantInfo(MERCHANT_KEY, MERCHANT_SALT);
        console.log('✅ PayU merchant info initialized for Android');
      } catch (error) {
        console.error('⚠️ Failed to initialize PayU merchant info:', error);
      }
    }
  }, []);

  // ── PayU event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const emitter = new NativeEventEmitter(PayUBizSdk);

    const onSuccess  = emitter.addListener('onPaymentSuccess', handlePaymentSuccess);
    const onFailure  = emitter.addListener('onPaymentFailure', handlePaymentFailure);
    const onCancel   = emitter.addListener('onPaymentCancel',  handlePaymentCancel);
    const onError    = emitter.addListener('onError',          handleError);
    const onHash     = emitter.addListener('generateHash',     handleGenerateHash);

    return () => {
      onSuccess.remove();
      onFailure.remove();
      onCancel.remove();
      onError.remove();
      onHash.remove();
    };
  }, []);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handlePaymentSuccess = async (e) => {
    console.log('✅ onPaymentSuccess raw:', JSON.stringify(e));
    setIsLoading(false);
    setPaymentStatus('success');

    // Parse PayU response
    let payuData = e;
    if (typeof e.payuResponse === 'string') {
      try { payuData = JSON.parse(e.payuResponse); } catch { payuData = e; }
    }

    const mihpayid   = payuData?.mihpayid   || payuData?.result?.mihpayid   || '';
    const txnid      = payuData?.txnid      || payuData?.result?.txnid      || e?.transactionId || '';
    const paidAmount = payuData?.amount     || payuData?.result?.amount     || amount;
    const status     = payuData?.status     || payuData?.result?.status     || 'success';
    const hash       = payuData?.hash       || payuData?.result?.hash       || '';

    console.log('✅ Parsed payment data:', {mihpayid, txnid, paidAmount, status});

    // ── Webhook verification ──────────────────────────────────────────────
    // Always verify server-side — never trust client-side success alone
    setIsVerifying(true);
    const verifyResult = await verifyPaymentWithWebhook({
      mihpayid,
      txnid,
      amount:      paidAmount,
      productinfo: productInfo,
      email,
      status,
      hash,
    });
    setIsVerifying(false);
    setWebhookResult(verifyResult);

    if (verifyResult.verified) {
      showPopup(
        'Payment Verified ✅',
        `Payment confirmed server-side.\nMihpayid: ${mihpayid}\nAmount: ₹${paidAmount}`
      );
    } else {
      // Payment callback said success but server could not verify
      // Do NOT grant access — treat as failed until manually resolved
      setPaymentStatus('verification_failed');
      showPopup(
        'Verification Failed ⚠️',
        `Payment callback received but server verification failed.\nReason: ${verifyResult.reason || 'unknown'}\nMihpayid: ${mihpayid}\n\nPlease contact support with your transaction ID: ${txnid}`
      );
    }
  };

  const handlePaymentFailure = (e) => {
    console.log('❌ onPaymentFailure:', JSON.stringify(e));
    setIsLoading(false);
    setPaymentStatus('failed');
    showPopup('Payment Failed ❌', JSON.stringify(e));
  };

  const handlePaymentCancel = (e) => {
    console.log('🚫 onPaymentCancel:', JSON.stringify(e));
    setIsLoading(false);
    setPaymentStatus('cancelled');
    showPopup('Payment Cancelled 🚫', JSON.stringify(e));
  };

  const handleError = (e) => {
    console.log('⚠️ onError:', JSON.stringify(e));

    // Detect HTML-response error (errorCode 5014)
    const errorCode = String(e?.errorCode || '');
    const errorMsg  = String(e?.errorMsg  || '');
    const isHtmlResponse = errorCode === '5014' || /<!doctype|<html/i.test(errorMsg);

    if (isHtmlResponse) {
      console.warn(
        '[PayU Debug] HTML response received instead of JSON.',
        'Check: static hashes present? userCredential empty? live key/salt correct?',
        {errorCode, environment: ENVIRONMENT, key: MERCHANT_KEY}
      );
    }

    setIsLoading(false);
    setPaymentStatus('error');
    showPopup('Payment Error ⚠️', JSON.stringify(e));
  };

  // ── Hash generation ────────────────────────────────────────────────────────
  // SDK fires 'generateHash' for every internal API call.
  // Append our salt to e.hashString, compute sha512, send back.
  const handleGenerateHash = (e) => {
    console.log('🔑 generateHash | name:', e.hashName, '| string:', e.hashString);
    const hashValue = sha512(e.hashString + MERCHANT_SALT);
    PayUBizSdk.hashGenerated({[e.hashName]: hashValue});
  };

  // ── Build payment params ───────────────────────────────────────────────────
  // Pass overrideAmount / overrideTxnId directly to avoid stale React state
  const buildPaymentParams = (overrideAmount, overrideTxnId) => {
    const txnId         = overrideTxnId  || new Date().getTime().toString();
    const paymentAmount = overrideAmount || amount;
    const staticHashes  = generateStaticHashes();

    const payUPaymentParams = {
      key:           MERCHANT_KEY,
      transactionId: txnId,
      amount:        paymentAmount,
      productInfo:   productInfo,
      firstName:     firstName,
      email:         email,
      phone:         phone,
      ios_surl:      SURL,
      ios_furl:      FURL,
      android_surl:  SURL,
      android_furl:  FURL,
      environment:   ENVIRONMENT,

      // ✅ EMPTY STRING = guest mode
      // Avoids HTML error when email not registered on live merchant account
      userCredential: '',

      // ✅ REQUIRED STATIC HASHES for iOS SDK
      // Without these → SDK falls back to web mode → HTML response → onError
      additionalParam: {
        vas_for_mobile_sdk:                     staticHashes.vas_for_mobile_sdk,
        payment_related_details_for_mobile_sdk: staticHashes.payment_related_details_for_mobile_sdk,
      },
    };

    const payUCheckoutProConfig = {
      primaryColor:   '#667eea',
      secondaryColor: '#764ba2',
      merchantName:   MERCHANT_NAME,
      merchantLogo:   MERCHANT_LOGO,
      showExitConfirmationOnCheckoutScreen: true,
      showExitConfirmationOnPaymentScreen:  true,
      paymentModesOrder:       getPaymentModesOrder(),
      surePayCount:            1,
      merchantResponseTimeout: 10000,
      autoSelectOtp:           true,
      showCbToolbar:           true,
    };

    console.log('📦 payUPaymentParams:', JSON.stringify(payUPaymentParams));
    console.log('📦 Platform:', Platform.OS, '| env:', ENVIRONMENT, '| UPI mode:', getPaymentModesOrder()[0]);

    return {payUPaymentParams, payUCheckoutProConfig};
  };

  // ── Launch PayU ────────────────────────────────────────────────────────────
  const launchPayU = (overrideAmount, overrideTxnId) => {
    setIsLoading(true);
    setPaymentStatus(null);
    setWebhookResult(null);
    PayUBizSdk.openCheckoutScreen(buildPaymentParams(overrideAmount, overrideTxnId));
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const showPopup = (title, message) => {
    if (!showAlert) {
      setShowAlert(true);
      Alert.alert(title, message, [{text: 'OK', onPress: () => setShowAlert(false)}]);
    }
  };

  const resetTest = () => {
    setPaymentStatus(null);
    setWebhookResult(null);
    setIsLoading(false);
    setIsVerifying(false);
  };

  const statusColor = () => {
    switch (paymentStatus) {
      case 'success':              return '#4CAF50';
      case 'failed':               return '#F44336';
      case 'cancelled':            return '#FF9800';
      case 'verification_failed':  return '#E91E63';
      case 'error':                return '#E91E63';
      default:                     return '#667eea';
    }
  };

  const statusIcon = () => {
    switch (paymentStatus) {
      case 'success':              return '✅';
      case 'failed':               return '❌';
      case 'cancelled':            return '🚫';
      case 'verification_failed':  return '⚠️';
      case 'error':                return '⚠️';
      default:                     return '💳';
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── Header ── */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}>
          <Text style={styles.headerTitle}>PayU Payment</Text>
          <Text style={styles.headerSubtitle}>
            {Platform.OS === 'ios' ? '🍎 iOS' : '🤖 Android'}
            {'  •  '}
            🔴 Live
          </Text>
        </LinearGradient>

        {/* ── Environment badge ── */}
        <View style={[styles.badge, {backgroundColor: '#FFF3E0', borderLeftColor: '#F44336'}]}>
          <Text style={[styles.badgeText, {color: '#D32F2F'}]}>
            🔴 LIVE — Real money will be charged
          </Text>
        </View>

        {/* ── UPI mode badge ── */}
        <View style={[styles.badge, {
          backgroundColor: Platform.OS === 'ios' ? '#E3F2FD' : '#E8F5E9',
          borderLeftColor: Platform.OS === 'ios' ? '#1976D2' : '#4CAF50',
        }]}>
          <Text style={[styles.badgeText, {
            color: Platform.OS === 'ios' ? '#1565C0' : '#2E7D32',
          }]}>
            {Platform.OS === 'ios'
              ? '🍎 iOS UPI: all apps shown (GPay, PhonePe, Paytm, BHIM)'
              : '🤖 Android UPI: Google Pay (TEZ) priority'}
          </Text>
        </View>

        {/* ── Webhook badge ── */}
        <View style={[styles.badge, {backgroundColor: '#E8EAF6', borderLeftColor: '#3F51B5'}]}>
          <Text style={[styles.badgeText, {color: '#283593'}]}>
            🔗 Webhook verification enabled — server confirms every payment
          </Text>
        </View>

        {/* ── Payment details ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Details</Text>
          {[
            ['Amount',       `₹${amount}`],
            ['Product',      productInfo],
            ['Name',         firstName],
            ['Email',        email],
            ['Phone',        phone],
            ['Merchant Key', MERCHANT_KEY],
            ['Environment',  '🔴 Live (0)'],
            ['Webhook',      WEBHOOK_VERIFY_URL],
          ].map(([label, value], i, arr) => (
            <View
              key={label}
              style={[styles.row, i === arr.length - 1 && {borderBottomWidth: 0}]}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={[
                styles.rowValue,
                label === 'Environment' && {color: '#F44336'},
                label === 'Webhook' && {fontSize: 11, color: '#3F51B5'},
              ]}>
                {value}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Payment methods ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Payment Methods ({Platform.OS === 'ios' ? 'iOS' : 'Android'})
          </Text>
          {[
            ['📱', 'UPI',
              Platform.OS === 'ios'
                ? 'GPay, PhonePe, Paytm, BHIM & all UPI apps'
                : 'Google Pay (TEZ) + all UPI apps'],
            ['💰', 'Wallets',           'Paytm, PhonePe'],
            ['💳', 'Credit/Debit Card', 'Visa, Mastercard, RuPay'],
            ['📆', 'EMI',               'Easy monthly installments'],
            ['🏦', 'Net Banking',       '100+ banks supported'],
          ].map(([icon, name, desc]) => (
            <View key={name} style={styles.methodRow}>
              <Text style={styles.methodIcon}>{icon}</Text>
              <View style={{flex: 1}}>
                <Text style={styles.methodName}>{name}</Text>
                <Text style={styles.methodDesc}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Static hashes badge ── */}
        <View style={[styles.badge, {backgroundColor: '#F3E5F5', borderLeftColor: '#9C27B0'}]}>
          <Text style={[styles.badgeText, {color: '#6A1B9A'}]}>
            ✅ Static hashes: vas_for_mobile_sdk + payment_related_details_for_mobile_sdk
          </Text>
        </View>

        {/* ── Payment status ── */}
        {paymentStatus && (
          <View style={[styles.card, {
            flexDirection:  'row',
            alignItems:     'center',
            borderLeftWidth: 5,
            borderLeftColor: statusColor(),
          }]}>
            <Text style={{fontSize: 26, marginRight: 14}}>{statusIcon()}</Text>
            <Text style={{fontSize: 17, fontWeight: 'bold', flex: 1, color: statusColor()}}>
              Payment {paymentStatus.replace('_', ' ').charAt(0).toUpperCase() + paymentStatus.replace('_', ' ').slice(1)}
            </Text>
          </View>
        )}

        {/* ── Webhook result ── */}
        {isVerifying && (
          <View style={[styles.card, {flexDirection: 'row', alignItems: 'center', gap: 12}]}>
            <ActivityIndicator size="small" color="#3F51B5" />
            <Text style={{color: '#3F51B5', fontSize: 14, fontWeight: '600'}}>
              Verifying payment with server...
            </Text>
          </View>
        )}

        {webhookResult && !isVerifying && (
          <View style={[styles.card, {
            borderLeftWidth:  5,
            borderLeftColor:  webhookResult.verified ? '#4CAF50' : '#E91E63',
          }]}>
            <Text style={[styles.cardTitle, {color: webhookResult.verified ? '#4CAF50' : '#E91E63'}]}>
              {webhookResult.verified ? '🔗 Webhook: Verified ✅' : '🔗 Webhook: Failed ⚠️'}
            </Text>
            <Text style={{color: '#555', fontSize: 12}}>
              {JSON.stringify(webhookResult, null, 2)}
            </Text>
          </View>
        )}

        {/* ── Pay button ── */}
        <View style={styles.btnContainer}>
          <TouchableOpacity
            style={[styles.payBtn, (isLoading || isVerifying) && {opacity: 0.6}]}
            onPress={() => launchPayU()}
            disabled={isLoading || isVerifying}
            activeOpacity={0.85}>
            <LinearGradient
              colors={(isLoading || isVerifying) ? ['#bbb', '#999'] : ['#667eea', '#764ba2']}
              style={styles.gradient}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}>
              <Text style={styles.payBtnText}>
                {isLoading    ? '⏳ Processing...'
                 : isVerifying ? '🔗 Verifying...'
                 : `💳 Pay ₹${amount}`}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {paymentStatus && (
            <TouchableOpacity style={styles.resetBtn} onPress={resetTest}>
              <Text style={styles.resetBtnText}>🔄 Try Again</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>🔒 Secured by PayU</Text>
          <Text style={styles.footerSub}>Svar Technology Private Limited</Text>
        </View>

      </ScrollView>
    </>
  );
};

export default PayuTestCode;

// ─────────────────────────────────────────────────────────────────────────────
// BASKET.JS INTEGRATION GUIDE
// ─────────────────────────────────────────────────────────────────────────────
//
// Pass values directly to launchPayU to avoid stale React state:
//
//   // ❌ WRONG — setState is async, launchPayU reads stale values
//   setAmount(response.data.amount);
//   setPaymentId(response.data.payuTransactionId);
//   launchPayU();
//
//   // ✅ CORRECT
//   const newAmount = response.data.amount;
//   const newTxnId  = response.data.payuTransactionId;
//   setAmount(newAmount);
//   launchPayU(newAmount, newTxnId);
//
// buildPaymentParams() already includes:
//   userCredential: ''          ← guest mode, no HTML error
//   additionalParam: { vas_for_mobile_sdk, payment_related_details_for_mobile_sdk }
//
// After onPaymentSuccess fires, verifyPaymentWithWebhook() hits your backend.
// Your backend should:
//   1. Call PayU Verify Payment API:  https://info.payu.in/merchant/postservice?form=2
//   2. Validate hash with your salt
//   3. Return { verified: true/false, ... }
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  {flex: 1, backgroundColor: '#f5f6fa'},
  content:    {paddingBottom: 50},

  header: {
    paddingTop: 60, paddingBottom: 30,
    paddingHorizontal: 20, alignItems: 'center',
  },
  headerTitle: {
    fontSize: 26, fontWeight: 'bold', color: 'white', marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.9)',
  },

  badge: {
    marginHorizontal: 20, marginTop: 12,
    borderRadius: 10, padding: 12, borderLeftWidth: 4,
  },
  badgeText: {
    fontSize: 12, fontWeight: '600', textAlign: 'center',
  },

  card: {
    backgroundColor: 'white',
    marginHorizontal: 20, marginTop: 14,
    borderRadius: 14, padding: 18,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 14,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowLabel: {fontSize: 14, color: '#666', fontWeight: '500'},
  rowValue: {
    fontSize: 14, color: '#222', fontWeight: 'bold',
    maxWidth: '55%', textAlign: 'right',
  },

  methodRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  methodIcon: {fontSize: 20, marginRight: 14, width: 28},
  methodName: {fontSize: 14, fontWeight: '700', color: '#222', marginBottom: 2},
  methodDesc: {fontSize: 11, color: '#888'},

  btnContainer: {
    paddingHorizontal: 20, marginTop: 24, gap: 14,
  },
  payBtn: {
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  gradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnText: {
    color: 'white', fontSize: 17, fontWeight: 'bold', letterSpacing: 0.4,
  },
  resetBtn: {
    backgroundColor: 'white',
    paddingVertical: 15, borderRadius: 14,
    alignItems: 'center', borderWidth: 2, borderColor: '#667eea',
  },
  resetBtnText: {color: '#667eea', fontSize: 15, fontWeight: 'bold'},

  footer: {
    alignItems: 'center', marginTop: 30,
    paddingHorizontal: 20, paddingBottom: 10,
  },
  footerText: {fontSize: 13, color: '#888', marginBottom: 4},
  footerSub:  {fontSize: 11, color: '#bbb'},
});