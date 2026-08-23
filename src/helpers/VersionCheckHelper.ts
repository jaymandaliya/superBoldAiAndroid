export type UpdateTier = 'hard' | 'soft';

export interface AppVersionCheckResult {
  tier: UpdateTier;
  minimumVersion: string;
  latestVersion: string;
  updateUrl?: string;
  message: string;
}

interface VersionCheckResponse {
  success: boolean;
  minimum_version: string;
  latest_version: string;
  force_update: boolean;
  soft_update: boolean;
  update_url?: string;
  message?: string;
}

/**
 * Checks the backend-controlled version gate for this platform.
 * The backend owns the version comparison (current vs. minimum/latest) and any
 * manual kill-switch — the client just trusts force_update / soft_update as sent.
 * Returns null when neither flag is set — app is current, no popup needed.
 * Returns 'hard' when force_update is true (blocking, non-dismissible).
 * Returns 'soft' when soft_update is true (dismissible — see AuthStorage
 * dismissed-update-version tracking).
 */
export const checkAppVersion = async (
  baseUrl: string,
  platform: string,
  appVersion: string
): Promise<AppVersionCheckResult | null> => {
  const response = await fetch(
    `${baseUrl}/api/app-version?platform=${platform}&version=${encodeURIComponent(appVersion)}`
  );

  if (!response.ok) {
    return null;
  }

  const versionData: VersionCheckResponse = await response.json();
  const minimumVersion = versionData.minimum_version || '0.0.1';
  const latestVersion = versionData.latest_version || minimumVersion;

  if (versionData.force_update) {
    return {
      tier: 'hard',
      minimumVersion,
      latestVersion,
      updateUrl: versionData.update_url,
      message: versionData.message || `Please update to version ${minimumVersion} or newer.`,
    };
  }

  if (versionData.soft_update) {
    return {
      tier: 'soft',
      minimumVersion,
      latestVersion,
      updateUrl: versionData.update_url,
      message: versionData.message || `Version ${latestVersion} is available.`,
    };
  }

  return null;
};
