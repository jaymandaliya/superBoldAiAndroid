import { BASE_URL } from '../constants';
import { PricingConfig } from './pricingTypes';

export async function fetchPricingCatalog(): Promise<{
  ok: boolean;
  pricing: PricingConfig | null;
}> {
  try {
    const response = await fetch(`${BASE_URL}/api/pricing`, { method: 'GET' });
    if (!response.ok) {
      return { ok: false, pricing: null };
    }

    const data = await response.json();
    if (!data?.pricing?.tiers?.length || !data?.pricing?.bundle) {
      return { ok: false, pricing: null };
    }

    return { ok: true, pricing: data.pricing as PricingConfig };
  } catch {
    return { ok: false, pricing: null };
  }
}
