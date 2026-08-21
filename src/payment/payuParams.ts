import { Platform } from 'react-native';
import { PAYU_MERCHANT, PAYU_PAYMENT_MODES_ORDER, PAYU_ROOM_SDK_OPTIONS, PAYU_SUBSCRIPTION_PRODUCT } from './payuConfig';
import { User, Learning } from '../types';

export const generatePayUTransactionId = (): string => Date.now().toString();

export const isValidPayUTransactionId = (txnid: string): boolean =>
  /^[a-zA-Z0-9]{1,25}$/.test(txnid);

export const looksLikeCbjsCallback = (url: string): boolean =>
  /cbjs\.payu\.in\/sdk\/(success|failure)/i.test(url);

export const sanitizePayUText = (value: string, fallback: string): string => {
  const cleaned = value.replace(/[^a-zA-Z0-9\s._-]/g, '').trim();
  return cleaned || fallback;
};

export const sanitizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return '9999999999';
};

export const sanitizeUserCredential = (left: string, right: string): string => {
  const safeLeft = left.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 20) || 'user';
  const safeRight = right.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 20) || 'app';
  return `${safeLeft}:${safeRight}`;
};

type PayUPaymentParams = Record<string, string>;
type PayUCheckoutProConfig = Record<string, unknown>;

export function buildRoomTierCheckoutParams(args: {
  user: User;
  learning: Learning;
  tierKey: string;
  amount: string;
  levels: string;
}): { payUPaymentParams: PayUPaymentParams; payUCheckoutProConfig: PayUCheckoutProConfig } {
  const { user, learning, tierKey, amount, levels } = args;
  const txnid = generatePayUTransactionId();
  const productinfo = `${sanitizePayUText(
    `${learning.native_language}-${learning.target_language}-${tierKey}`,
    'productInfo'
  )}`;
  const firstname = sanitizePayUText(user.name || '', 'firstName');
  const email = sanitizePayUText(
    (user as { email?: string }).email || `user${user.id}@scaleu.app`,
    `user${user.id}@scaleu.app`
  );
  const phone = sanitizePhone(user.phone_number || '');
  const userCredential = sanitizeUserCredential(String(user.id), tierKey || 'room');

  const usingCbjsCallbacks =
    looksLikeCbjsCallback(PAYU_MERCHANT.ios_surl) ||
    looksLikeCbjsCallback(PAYU_MERCHANT.ios_furl) ||
    looksLikeCbjsCallback(PAYU_MERCHANT.android_surl) ||
    looksLikeCbjsCallback(PAYU_MERCHANT.android_furl);

  if (usingCbjsCallbacks) {
    console.warn(
      '[PayU Debug] Using cbjs callback URLs. For merchant key',
      PAYU_MERCHANT.key,
      'this can trigger 5014 if callback response is HTML instead of JSON. Prefer merchant-owned callback URLs.'
    );
  }

  const payUPaymentParams: PayUPaymentParams = {
    key: PAYU_MERCHANT.key,
    transactionId: txnid,
    amount,
    productInfo: productinfo,
    firstName: firstname,
    email,
    phone,
    ios_surl: PAYU_MERCHANT.ios_surl,
    ios_furl: PAYU_MERCHANT.ios_furl,
    android_surl: PAYU_MERCHANT.android_surl,
    android_furl: PAYU_MERCHANT.android_furl,
    surl: Platform.OS === 'ios' ? PAYU_MERCHANT.ios_surl : PAYU_MERCHANT.android_surl,
    furl: Platform.OS === 'ios' ? PAYU_MERCHANT.ios_furl : PAYU_MERCHANT.android_furl,
    environment: PAYU_MERCHANT.environment,
    userCredential,
  };

  const payUCheckoutProConfig: PayUCheckoutProConfig = {
    primaryColor: '#667eea',
    secondaryColor: '#764ba2',
    merchantName: PAYU_MERCHANT.merchantName,
    merchantLogo: PAYU_ROOM_SDK_OPTIONS.merchantLogo,
    showExitConfirmationOnCheckoutScreen: PAYU_ROOM_SDK_OPTIONS.showExitConfirmationOnCheckoutScreen,
    showExitConfirmationOnPaymentScreen: PAYU_ROOM_SDK_OPTIONS.showExitConfirmationOnPaymentScreen,
    paymentModesOrder: [...PAYU_PAYMENT_MODES_ORDER],
    surePayCount: PAYU_ROOM_SDK_OPTIONS.surePayCount,
    merchantResponseTimeout: PAYU_ROOM_SDK_OPTIONS.merchantResponseTimeout,
    autoSelectOtp: PAYU_ROOM_SDK_OPTIONS.autoSelectOtp,
    showCbToolbar: PAYU_ROOM_SDK_OPTIONS.showCbToolbar,
  };

  console.log('[PayU Debug] Creating payment params:', {
    txnid,
    txnidLength: txnid.length,
    isValidPayUTxnId: isValidPayUTransactionId(txnid),
    tierKey,
    amount,
    levels,
    userId: user.id,
    productinfo,
    native_language: learning.native_language,
    target_language: learning.target_language,
    userCredential,
  });

  return { payUPaymentParams, payUCheckoutProConfig };
}

export function buildSubscriptionYearlyCheckoutParams(user: User): {
  payUPaymentParams: PayUPaymentParams;
  payUCheckoutProConfig: PayUCheckoutProConfig;
} {
  const txnid = generatePayUTransactionId();
  const payUPaymentParams: PayUPaymentParams = {
    key: PAYU_MERCHANT.key,
    transactionId: txnid,
    amount: PAYU_SUBSCRIPTION_PRODUCT.amount,
    productInfo: PAYU_SUBSCRIPTION_PRODUCT.productInfo,
    firstName: user.phone_number,
    email: `${user.phone_number}@scaleu.ai`,
    phone: user.phone_number,
    ios_surl: PAYU_MERCHANT.ios_surl,
    ios_furl: PAYU_MERCHANT.ios_furl,
    android_surl: PAYU_MERCHANT.android_surl,
    android_furl: PAYU_MERCHANT.android_furl,
    environment: PAYU_MERCHANT.environment,
    userCredential: `${user.id}:yearly`,
  };

  const payUCheckoutProConfig: PayUCheckoutProConfig = {
    primaryColor: '#667eea',
    secondaryColor: '#764ba2',
    merchantName: PAYU_MERCHANT.merchantName,
    merchantLogo: PAYU_SUBSCRIPTION_PRODUCT.merchantLogo,
    showExitConfirmationOnCheckoutScreen: true,
    showExitConfirmationOnPaymentScreen: true,
    paymentModesOrder: [...PAYU_PAYMENT_MODES_ORDER],
    surePayCount: 1,
    merchantResponseTimeout: 10000,
    autoSelectOtp: true,
    showCbToolbar: true,
  };

  return { payUPaymentParams, payUCheckoutProConfig };
}
