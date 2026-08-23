import { COMPANION_PRICING_URL, COMPANION_PURCHASE_URL } from '../constants';
import { CompanionPricingConfig } from './companionPricingTypes';

export async function fetchCompanionPricing(): Promise<{
  ok: boolean;
  pricing: CompanionPricingConfig | null;
}> {
  try {
    const response = await fetch(COMPANION_PRICING_URL, { method: 'GET' });
    if (!response.ok) {
      return { ok: false, pricing: null };
    }

    const data = await response.json();
    if (!data?.packages?.length) {
      return { ok: false, pricing: null };
    }

    return { ok: true, pricing: { packages: data.packages } as CompanionPricingConfig };
  } catch {
    return { ok: false, pricing: null };
  }
}

/**
 * Confirms a successful one-time companion-minutes purchase and credits minutes.
 * The backend is the source of truth — it must verify the transaction with whichever
 * provider processed it (PayU) before crediting; this call is for immediate UX after
 * the client reports success, not the grant itself.
 * Unused: no purchase UI calls this yet, matching iOS parity (same status there) —
 * wire it up once a companion-minutes purchase screen exists.
 */
export async function creditCompanionMinutes(
  authToken: string,
  body: {
    package_key: string;
    payment_method: string;
    transaction_id: string;
    amount?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  data: { remainingSeconds?: number; resetAt?: string } & Record<string, unknown>;
}> {
  const response = await fetch(COMPANION_PURCHASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as { remainingSeconds?: number; resetAt?: string } & Record<
    string,
    unknown
  >;
  return { ok: response.ok, status: response.status, data };
}
