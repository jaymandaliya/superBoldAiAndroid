import { useEffect, useState } from 'react';
import { AudioCatalogHelper } from '../helpers';
import { AUDIO_CATALOG_SUPPORTED_LANGUAGES } from '../constants';
import { AudioCatalogEntry, OnboardingAudioKey } from '../types';

/** Onboarding voice-over clips for a native language, or {} if that language has none. */
export function useOnboardingClips(
  nativeLanguageCode: string,
): Partial<Record<OnboardingAudioKey, AudioCatalogEntry>> {
  const [clips, setClips] = useState<Partial<Record<OnboardingAudioKey, AudioCatalogEntry>>>({});

  useEffect(() => {
    let cancelled = false;

    if (!AUDIO_CATALOG_SUPPORTED_LANGUAGES.has(nativeLanguageCode)) {
      setClips({});
      return;
    }

    AudioCatalogHelper.getOnboardingClips(nativeLanguageCode).then(result => {
      if (!cancelled) setClips(result);
    });

    return () => { cancelled = true; };
  }, [nativeLanguageCode]);

  return clips;
}
