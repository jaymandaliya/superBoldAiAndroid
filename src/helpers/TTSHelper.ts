// Device TTS helper — wraps react-native-tts with config-driven
// rate/pitch. Used by ConversationHistoryScreen to replay saved
// sessions. Inside a live LiveKit room, audio replay is handled
// via LiveKit RPC (see RoomViewScreen / ttsConfig.ts) so the
// agent's Google Cloud TTS voice is used instead.

import Tts from 'react-native-tts';
import { TTS_CONFIG } from '../config/ttsConfig';
import { CrashlyticsHelper } from './CrashlyticsHelper';

let _initialized = false;

async function ensureInit(): Promise<void> {
  if (_initialized) return;
  try {
    await Tts.getInitStatus();
    Tts.setDefaultRate(TTS_CONFIG.defaultRate);
    Tts.setDefaultPitch(TTS_CONFIG.defaultPitch);
    _initialized = true;
  } catch (e) {
    CrashlyticsHelper.recordError(e as Error, 'TTSHelper.ensureInit');
  }
}

export const TTSHelper = {
  async speak(
    text: string,
    opts?: { languageCode?: string; onDone?: () => void },
  ): Promise<void> {
    await ensureInit();
    TTSHelper.stop();

    if (opts?.languageCode) {
      try { Tts.setDefaultLanguage(opts.languageCode); } catch { /* unsupported */ }
    }

    if (opts?.onDone) {
      let removed = false;
      const cleanup = () => {
        if (removed) return;
        removed = true;
        try { (finish as any)?.remove?.(); } catch { /* ignore */ }
        try { (cancel as any)?.remove?.(); } catch { /* ignore */ }
        opts.onDone!();
      };
      const finish = Tts.addEventListener('tts-finish', cleanup);
      const cancel = Tts.addEventListener('tts-cancel', cleanup);
    }

    Tts.speak(text);
  },

  stop(): void {
    try { Tts.stop(); } catch { /* ignore if not speaking */ }
  },
};
