import { AUDIO_CATALOG_URL } from '../constants';
import { AudioCatalogEntry } from '../types';

/**
 * GET-only. Documented as a public/no-auth endpoint, but staging currently 401s
 * unauthenticated requests — so pass along the logged-in user's token when we have
 * one (always true post-OTP, which is the only time onboarding calls this) as a
 * pragmatic workaround. Returns [] on any failure so callers never need to branch on errors.
 */
export async function fetchAudioCatalog(nativeLanguage: string, token?: string | null): Promise<AudioCatalogEntry[]> {
  const url = `${AUDIO_CATALOG_URL}?native_language=${encodeURIComponent(nativeLanguage)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      return [];
    }

    const entries = data[nativeLanguage];
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries as AudioCatalogEntry[];
  } catch {
    return [];
  }
}
