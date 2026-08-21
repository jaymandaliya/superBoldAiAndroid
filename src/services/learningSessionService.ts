import { LEARNING_SESSION_URL } from '../constants';
import { Learning } from '../types';

export type StartSessionResult = {
  status: number;
  data: Record<string, unknown> & {
    token?: string;
    url?: string;
    learning?: Learning;
    error?: string;
    free_trial_exhausted?: boolean;
    message?: string;
    required_level?: number;
    next_level?: number;
    current_level?: number;
  };
};

/**
 * Starts a LiveKit learning session (token + room URL).
 */
export async function startLearningSession(
  authToken: string,
  body: { native_language: string; target_language: string; learning_id?: string; checkpoint_test?: number }
): Promise<StartSessionResult> {
  const response = await fetch(`${LEARNING_SESSION_URL}/start-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as StartSessionResult['data'];
  return { status: response.status, data };
}

export type UpdatePremiumBody = {
  native_language: string;
  target_language: string;
  learning_id?: string;
  payment_tier: string;
  access_level?: number;
  payment_id?: string;
  transaction_id?: string;
  amount?: string;
};

export type UpdatePremiumResult = {
  ok: boolean;
  status: number;
  data: { learning?: Learning } & Record<string, unknown>;
};

/**
 * Confirms a successful PayU client checkout and updates premium / tier access.
 *
 * PayU server-to-server notifications are handled separately by the backend at
 * POST /api/payments/payu-webhook. Keep webhook verification and idempotency on
 * the server; this call is for immediate UX after the mobile SDK reports success.
 */
export async function updatePremiumAfterPayment(
  authToken: string,
  body: UpdatePremiumBody
): Promise<UpdatePremiumResult> {
  const response = await fetch(`${LEARNING_SESSION_URL}/update-premium`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as UpdatePremiumResult['data'];
  return { ok: response.ok, status: response.status, data };
}
