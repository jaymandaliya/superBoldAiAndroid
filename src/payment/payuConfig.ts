/**
 * Shared PayU merchant and checkout UI defaults (native SDK).
 */
export const PAYU_MERCHANT = {
  // ── SANDBOX ──
  // key: 'M8Djw1',
  // merchantSalt: 'zxJiSMlmVuva6W5Uww1Yibo1ojXIEQXX',
  // environment: '1',
  // ── LIVE (uncomment to go live) ──
  key: 'oYuxe0',
  merchantSalt: 'hvBr4Zoa3ucIPDjmwAsHbCEFm53IXe99',
  environment: '0',
  merchantName: 'Svar Technology Private Limited',
  ios_surl: 'https://cbjs.payu.in/sdk/success',
  ios_furl: 'https://cbjs.payu.in/sdk/failure',
  android_surl: 'https://cbjs.payu.in/sdk/success',
  android_furl: 'https://cbjs.payu.in/sdk/failure',
} as const;

/** Room / tier checkout: extra SDK chrome flags */
export const PAYU_ROOM_SDK_OPTIONS = {
  merchantLogo: 'Jio',
  showExitConfirmationOnCheckoutScreen: true,
  showExitConfirmationOnPaymentScreen: true,
  surePayCount: 1,
  merchantResponseTimeout: 10000,
  autoSelectOtp: true,
  showCbToolbar: true,
} as const;

export const PAYU_PAYMENT_MODES_ORDER = [
  { UPI: 'TEZ' },
  { Wallets: 'PAYTM' },
  { EMI: '' },
  { Wallets: 'PHONEPE' },
] as const;

/** Language selection — yearly subscription product line */
export const PAYU_SUBSCRIPTION_PRODUCT = {
  amount: '1000.00',
  productInfo: 'Language Learning Premium - 1 Year Subscription',
  merchantLogo: 'SuperBold',
} as const;
