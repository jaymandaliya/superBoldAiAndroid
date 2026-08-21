import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import { CrashlyticsHelper } from './CrashlyticsHelper';

let isConfigured = false;
let isSessionActive = false;

async function configureOnce(): Promise<void> {
  if (isConfigured) {
    return;
  }
  await AudioSession.configureAudio({
    android: {
      preferredOutputList: ['speaker'],
      audioTypeOptions: AndroidAudioTypePresets.communication,
    },
    ios: { defaultOutput: 'speaker' },
  });
  isConfigured = true;
}

export const AudioHelper = {
  async setupAudio(): Promise<void> {
    try {
      await configureOnce();
      await AudioSession.startAudioSession();
      isSessionActive = true;
      CrashlyticsHelper.log('Audio session started');
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AudioHelper.setupAudio');
    }
  },

  // Re-asserts speaker routing without restarting the session unnecessarily.
  // Android can demote audio routing to the earpiece when another app grabs
  // audio focus (phone call, PayU SDK, notification sound). Call on app-resume
  // or before joining a voice room.
  async ensureSpeakerRouting(): Promise<void> {
    try {
      await configureOnce();
      if (!isSessionActive) {
        await AudioSession.startAudioSession();
        isSessionActive = true;
      }
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AudioHelper.ensureSpeakerRouting');
    }
  },

  async stopAudio(): Promise<void> {
    try {
      if (isSessionActive) {
        await AudioSession.stopAudioSession();
        isSessionActive = false;
      }
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AudioHelper.stopAudio');
    }
  },
};
