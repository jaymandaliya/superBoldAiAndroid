import { APP_SETTINGS_URL } from '../constants';

export type AppSettings = {
  _id: string;
  isCompanionFlow: boolean;
};

/** GET-only — this is a remote feature flag the app reads, not something it writes. */
export async function fetchAppSettings(): Promise<{ ok: boolean; settings: AppSettings | null }> {
  try {
    const response = await fetch(APP_SETTINGS_URL, { method: 'GET' });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, settings: null };
    }

    // GET wraps the resource as `{ settings: {...} }`; be defensive in case a future
    // response (or the POST update endpoint) ever returns it unwrapped instead.
    const settings = typeof data?.settings?.isCompanionFlow === 'boolean'
      ? data.settings
      : typeof data?.isCompanionFlow === 'boolean'
        ? data
        : null;

    if (!settings) {
      return { ok: false, settings: null };
    }

    return { ok: true, settings: settings as AppSettings };
  } catch {
    return { ok: false, settings: null };
  }
}
