export interface ForceUpdateInfo {
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
  update_url?: string;
  message?: string;
}

const normalizeVersion = (version: string): number[] => {
  const parts = (version || '0').split('.').map((segment) => {
    const digits = segment.replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  });
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts.slice(0, 3);
};

const isVersionLowerThan = (current: string, minimum: string): boolean => {
  const currentParts = normalizeVersion(current);
  const minimumParts = normalizeVersion(minimum);

  for (let index = 0; index < Math.max(currentParts.length, minimumParts.length); index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (currentPart < minimumPart) return true;
    if (currentPart > minimumPart) return false;
  }

  return false;
};

export const checkForceUpdate = async (
  baseUrl: string,
  platform: string,
  appVersion: string
): Promise<ForceUpdateInfo | null> => {
  const response = await fetch(
    `${baseUrl}/api/app-version?platform=${platform}&version=${encodeURIComponent(appVersion)}`
  );
console.log(`[VersionCheckHelper] Checking for updates: ${response.status} ${response.statusText}`); // Debug log 
  if (!response.ok) {
    return null;
  }

  const versionData: VersionCheckResponse = await response.json();
  const minimumVersion = versionData.minimum_version || '0.0.1';
  const forceUpdate = Boolean(versionData.force_update) || isVersionLowerThan(appVersion, minimumVersion);

  if (!forceUpdate) {
    return null;
  }

  return {
    minimumVersion,
    latestVersion: versionData.latest_version || minimumVersion,
    updateUrl: versionData.update_url,
    message: versionData.message || `Please update to version ${minimumVersion} or newer.`,
  };
};
