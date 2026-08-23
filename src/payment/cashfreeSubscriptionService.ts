import { BASE_URL } from '../constants';
import { CASHFREE_SUBSCRIPTION_PATHS, CashfreeSubscriptionStatus } from './cashfreeConfig';

/**
 * Client for the Android Cashfree recurring-subscription API described in
 * android-subscription-architecture.md §10. Mirrors the fetch + Bearer-token style
 * used by authService.ts rather than introducing a new HTTP convention.
 *
 * GET /api/paywall/android's shape below is confirmed against a live response from
 * staging (learning-backend-staging.scaleu.ai). create/verify/status/cancel are still
 * this client's best-effort reading of the doc's literal pseudocode — Cashfree creds
 * aren't wired up on staging yet, so those haven't been exercised end-to-end. Every
 * parse stays defensive (optional fields, no throws on an unexpected shape).
 */

export type CashfreeAndroidOffer = {
  enabled: boolean;
  planId: string;
  platform?: string;
  provider?: string;
  sdkEnvironment?: string;
  currency?: string;
  currencySymbol?: string;
  trialDays?: number;
  discountLabel?: string;
  trialAmount?: string;
  originalAmount?: string;
  recurringAmount?: string;
  recurringPeriod?: string;
  trialPrice?: string;
  originalPrice?: string;
  recurringPrice?: string;
  authorizationAmount?: number;
  authorizationAmountRefunded?: boolean;
  maxAmount?: number;
};

export type CashfreeAndroidPaywallBox = {
  header?: string;
  discountBadge?: string | null;
  trialTitle?: string;
  trialOriginalPrice?: string | null;
  trialSubtitle?: string;
  recurringTitle?: string;
  recurringSubtitle?: string;
};

export type CashfreeAndroidPaywallContent = {
  aiCoachLabel?: string;
  heroTitle?: string;
  features?: string[];
  socialProof?: string;
  ratingValue?: string;
  ratingLabel?: string;
  reviewsCount?: string;
  reviewsLabel?: string;
  box?: CashfreeAndroidPaywallBox;
  ctaPrimary?: string;
  ctaDismiss?: string;
  chargeReminder?: string;
  restore?: string;
  terms?: string;
  privacy?: string;
};

export type CashfreeAndroidPaywall = {
  requestedLanguage?: string;
  resolvedLanguage?: string;
  targetLanguage?: string;
  videoUrl?: string;
  offer: CashfreeAndroidOffer;
  content?: CashfreeAndroidPaywallContent;
};

export async function fetchAndroidPaywall(
  nativeLanguage: string
): Promise<{ ok: boolean; paywall: CashfreeAndroidPaywall | null }> {
  try {
    const response = await fetch(
      `${BASE_URL}${CASHFREE_SUBSCRIPTION_PATHS.paywall}?nativeLanguage=${encodeURIComponent(nativeLanguage)}`
    );
    if (!response.ok) return { ok: false, paywall: null };
    const data = await response.json();
    const offer = data?.paywall?.offer;
    if (!offer || typeof offer.enabled !== 'boolean' || typeof offer.planId !== 'string') {
      return { ok: false, paywall: null };
    }
    return { ok: true, paywall: data.paywall as CashfreeAndroidPaywall };
  } catch {
    return { ok: false, paywall: null };
  }
}

export type CashfreeConfig = {
  enabled: boolean;
  planId?: string;
  amount?: string;
  currency?: string;
  trialDays?: number;
};

export async function fetchCashfreeConfig(
  authToken: string
): Promise<{ ok: boolean; config: CashfreeConfig | null }> {
  try {
    const response = await fetch(`${BASE_URL}${CASHFREE_SUBSCRIPTION_PATHS.config}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return { ok: false, config: null };
    const data = await response.json();
    if (typeof data?.enabled !== 'boolean') return { ok: false, config: null };
    return { ok: true, config: data as CashfreeConfig };
  } catch {
    return { ok: false, config: null };
  }
}

export type CashfreeCreateResponse = {
  subscription_id: string;
  subscription_session_id: string;
  sdk_environment?: string;
};

export async function createCashfreeSubscription(
  authToken: string,
  planId: string
): Promise<{ ok: boolean; status: number; data: CashfreeCreateResponse | null }> {
  const response = await fetch(`${BASE_URL}${CASHFREE_SUBSCRIPTION_PATHS.create}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ planId }),
  });

  if (!response.ok) return { ok: false, status: response.status, data: null };

  const data = await response.json();
  if (!data?.subscription_id || !data?.subscription_session_id) {
    return { ok: false, status: response.status, data: null };
  }
  return { ok: true, status: response.status, data: data as CashfreeCreateResponse };
}

export type CashfreeVerifyResponse = {
  status: CashfreeSubscriptionStatus | string;
  access_source?: string;
};

/**
 * Re-fetches from Cashfree server-side and grants if warranted.
 * Never treat the native SDK's onVerify callback itself as a grant — this call is
 * what actually decides. See §7.1 "the ONLY trusted source".
 */
export async function verifyCashfreeSubscription(
  authToken: string,
  subscriptionId: string
): Promise<{ ok: boolean; data: CashfreeVerifyResponse | null }> {
  try {
    const response = await fetch(`${BASE_URL}${CASHFREE_SUBSCRIPTION_PATHS.verify}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ subscriptionId }),
    });
    if (!response.ok) return { ok: false, data: null };
    const data = await response.json();
    if (typeof data?.status !== 'string') return { ok: false, data: null };
    return { ok: true, data: data as CashfreeVerifyResponse };
  } catch {
    return { ok: false, data: null };
  }
}

/**
 * Confirmed against a live staging response — the doc's own field names (`status`,
 * `product_id`, `payment_group`) don't match what the server actually returns.
 * `active` is the simplest ground truth; `subscription_status` carries the finer-grained
 * value from §5 (e.g. "trialing").
 */
export type CashfreeStatusResponse = {
  active?: boolean;
  subscription_status?: CashfreeSubscriptionStatus | string;
  auto_pay_enabled?: boolean;
  is_trial_period?: boolean;
  expires_date?: string;
  next_charge_date?: string;
  plan_id?: string;
  tier?: string;
  subscription_id?: string;
  payment_required?: boolean;
} | null;

export async function fetchCashfreeSubscriptionStatus(
  authToken: string
): Promise<{ ok: boolean; data: CashfreeStatusResponse }> {
  try {
    const response = await fetch(`${BASE_URL}${CASHFREE_SUBSCRIPTION_PATHS.status}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (response.status === 404) return { ok: true, data: null }; // no subscription row yet
    if (!response.ok) return { ok: false, data: null };
    const data = await response.json();
    return { ok: true, data: (data ?? null) as CashfreeStatusResponse };
  } catch {
    return { ok: false, data: null };
  }
}

export async function cancelCashfreeSubscription(
  authToken: string
): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(`${BASE_URL}${CASHFREE_SUBSCRIPTION_PATHS.cancel}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ action: 'CANCEL' }),
  });
  return { ok: response.ok, status: response.status };
}
