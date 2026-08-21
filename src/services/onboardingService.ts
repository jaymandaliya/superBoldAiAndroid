import { BASE_URL } from '../constants';

export interface OnboardingOptions {
  learningReasons: string[];
  currentSkillLevels: string[];
}

interface RawOnboardingOptionsResponse {
  learning_reasons?: unknown;
  current_skill_levels?: unknown;
}

const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'label' in item && typeof (item as { label?: unknown }).label === 'string') {
          return String((item as { label: string }).label);
        }
        if (item && typeof item === 'object' && 'name' in item && typeof (item as { name?: unknown }).name === 'string') {
          return String((item as { name: string }).name);
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => (typeof item === 'string' ? item : null))
      .filter((item): item is string => Boolean(item));
  }

  return [];
};

export async function fetchOnboardingOptions(nativeLanguage: string): Promise<OnboardingOptions | null> {
  try {
    const response = await fetch(
      `${BASE_URL}/api/onboarding/options?native_language=${encodeURIComponent(nativeLanguage)}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as RawOnboardingOptionsResponse;

    return {
      learningReasons: normalizeStringList(data.learning_reasons),
      currentSkillLevels: normalizeStringList(data.current_skill_levels),
    };
  } catch {
    return null;
  }
}
