import { CFEnvironment } from 'cashfree-pg-api-contract';

/**
 * Cashfree recurring premium (RBI e-mandate: UPI Autopay / SI on cards) — Android only.
 *
 * Mirrors app/core/android-subscription-architecture.md on the backend. This sells the
 * SAME ₹199/month "all 30 levels + 3-day trial" premium iOS sells via StoreKit — through
 * Cashfree Subscriptions instead. PayU (one-time tier purchases) is untouched; a user may
 * hold both. Nothing here writes learnings.purchased_tiers or users.is_premium directly —
 * the backend derives entitlement the same way it does for iOS.
 *
 * Env-driven server behavior (nothing to configure client-side):
 *   ANDROID_SUBSCRIPTION_ENABLED defaults to false — GET /config below returns
 *   enabled:false until the backend flips it on, and the app must fall back to the
 *   existing PayU tier flow in that case. Never hardcode "enabled" on the client.
 */
export const CASHFREE_MERCHANT = {
  // ── SANDBOX ── the backend's CASHFREE_ENV controls this in reality; sdk_environment
  // returned by /create is the source of truth (see toCFEnvironment below). This is only
  // the fallback used before that response exists.
  environment: CFEnvironment.SANDBOX,
  merchantName: 'Svar Technology Private Limited',
} as const;

export function toCFEnvironment(sdkEnvironment: string | undefined): CFEnvironment {
  return sdkEnvironment === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
}

/**
 * Real API surface — see §10 "API surface" in android-subscription-architecture.md.
 * All paths are relative to BASE_URL.
 */
export const CASHFREE_SUBSCRIPTION_PATHS = {
  /** No auth. Pre-login-safe. Server-driven copy + offer.enabled + offer.planId. */
  paywall: '/api/paywall/android',
  /** JWT. enabled:false ⇒ fall back to PayU tier flow. */
  config: '/api/subscriptions/cashfree/config',
  /** JWT. Body: { planId }. planId is echoed from the paywall offer, never invented client-side. */
  create: '/api/subscriptions/cashfree/create',
  /** JWT. Body: { subscriptionId }. The ONLY thing that can grant access — never trust onVerify alone. */
  verify: '/api/subscriptions/cashfree/verify',
  /** JWT. Current mandate straight from Mongo. */
  status: '/api/subscriptions/cashfree/status',
  /** JWT. manage: CANCEL — keeps access until expires_date. */
  cancel: '/api/subscriptions/cashfree/cancel',
} as const;

/** Internal status vocabulary the backend derives — see §5 "Status machine". */
export type CashfreeSubscriptionStatus =
  | 'pending_authorization'
  | 'bank_approval_pending'
  | 'trialing'
  | 'active'
  | 'billing_retry'
  | 'grace'
  | 'paused'
  | 'cancelled'
  | 'expired'
  | 'revoked';

/** Statuses that currently grant access (§5) — cancelled still grants until expires_date. */
export const CASHFREE_GRANTING_STATUSES: ReadonlySet<CashfreeSubscriptionStatus> = new Set([
  'trialing',
  'active',
  'grace',
  'cancelled',
]);

/**
 * ⚠️ TEMPORARY DEV OVERRIDE — DO NOT SHIP AS true.
 *
 * The backend has ANDROID_SUBSCRIPTION_ENABLED=false (no Cashfree creds in staging yet),
 * so GET /config correctly returns enabled:false and the screen shows "Not Available Yet".
 * Setting this to true skips that check locally and renders the offer UI anyway (using
 * CASHFREE_FALLBACK_OFFER below) purely so the paywall screen can be eyeballed before the
 * backend is ready. Tapping "Start Free Trial" still calls the real /create endpoint and
 * will fail until the backend actually enables the feature — this only unlocks the UI.
 * Set back to false once the backend flips ANDROID_SUBSCRIPTION_ENABLED on, or the app
 * will show the offer to every user even when the server says it's off.
 */
export const CASHFREE_FORCE_SHOW_OFFER_FOR_TESTING = true;
