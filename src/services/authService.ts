import { AUTH_URL } from '../constants';
import { Learning, User } from '../types';

export type AuthMeResponse = {
  user: User;
  learning?: Learning | null;
  learnings?: Learning[];
};

/**
 * GET /api/auth/me — optional reconciliation after payment if server state lags the mobile
 * `update-premium` / `subscribe` call. PayU authoritative processing uses POST /api/payments/payu-webhook on the server, not the app.
 */
export async function fetchAuthMe(authToken: string): Promise<AuthMeResponse | null> {
  try {
    const response = await fetch(`${AUTH_URL}/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthMeResponse;
  } catch {
    return null;
  }
}

export async function subscribeYearlyPremium(
  authToken: string,
  body: {
    payment_id: string;
    transaction_id: string;
    amount: string;
    plan: string;
  }
): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(`${AUTH_URL}/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status };
}
