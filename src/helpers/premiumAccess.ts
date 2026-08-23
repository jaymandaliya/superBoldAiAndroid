import { Learning } from '../types';

/** True if this learning has any real paid access — an active subscription
 * (`is_premium`) or any one-time tier pack (`purchased_tiers`). Shared by every
 * paywall-gating check in the app so "what counts as paid" never drifts between
 * call sites (LanguageSelectionScreen's Start Learning gate, onboarding's
 * finalize step, the header level/plan label, etc). */
export const hasPaidAccess = (learning: Learning | undefined | null): boolean => {
  if (!learning) return false;
  return Boolean(learning.is_premium) || (Array.isArray(learning.purchased_tiers) && learning.purchased_tiers.length > 0);
};
