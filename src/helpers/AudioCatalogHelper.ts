import Sound from 'react-native-sound';
import { fetchAudioCatalog } from '../services/audioCatalogService';
import { AuthStorage } from './AuthStorage';
import { CrashlyticsHelper } from './CrashlyticsHelper';
import { AudioCatalogEntry, OnboardingAudioKey } from '../types';

Sound.setCategory('Playback');

let currentSound: Sound | null = null;

function stopCurrent(): void {
  if (currentSound) {
    currentSound.stop();
    currentSound.release();
    currentSound = null;
  }
}

export const AudioCatalogHelper = {
  /** Onboarding voice-over clips (name/age/skill/reason) for a language. AsyncStorage-cached per language. */
  async getOnboardingClips(
    nativeLanguage: string,
  ): Promise<Partial<Record<OnboardingAudioKey, AudioCatalogEntry>>> {
    let entries = await AuthStorage.getAudioCatalogCache(nativeLanguage);
    if (entries) {
      console.log(`[AudioCatalog] cache HIT for "${nativeLanguage}" — ${entries.length} entries`);
    } else {
      console.log(`[AudioCatalog] cache MISS for "${nativeLanguage}" — fetching from network`);
      const token = await AuthStorage.getToken();
      entries = await fetchAudioCatalog(nativeLanguage, token);
      if (entries.length > 0) {
        await AuthStorage.saveAudioCatalogCache(nativeLanguage, entries);
      }
    }

    const onboarding: Partial<Record<OnboardingAudioKey, AudioCatalogEntry>> = {};
    entries
      .filter(entry => entry.category === 'onboarding')
      .forEach(entry => { onboarding[entry.key as OnboardingAudioKey] = entry; });
    console.log(
      `[AudioCatalog] onboarding clips for "${nativeLanguage}":`,
      Object.keys(onboarding).length ? onboarding : '(none — VoiceoverAvatar will stay hidden)'
    );
    return onboarding;
  },

  /** Plays a remote mp3, stopping any clip already playing. Fire-and-forget, never throws. */
  play(url: string, onComplete?: () => void): void {
    stopCurrent();
    try {
      const sound = new Sound(url, undefined, error => {
        if (error) {
          CrashlyticsHelper.recordError(new Error(String(error)), 'AudioCatalogHelper.play.load');
          return;
        }
        currentSound = sound;
        sound.play(success => {
          if (!success) {
            CrashlyticsHelper.log('AudioCatalogHelper.play: playback did not complete successfully');
          }
          stopCurrent();
          onComplete?.();
        });
      });
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AudioCatalogHelper.play');
    }
  },

  stop(): void {
    stopCurrent();
  },
};
