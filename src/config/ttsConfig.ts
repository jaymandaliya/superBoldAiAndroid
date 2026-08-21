// ============================================================
// App-level TTS Configuration
//
// This config controls the fallback device TTS that is used in
// ConversationHistoryScreen (replaying saved sessions).
//
// Inside a live LiveKit room the "play again" button on agent
// messages fires a LiveKit RPC call to the agent instead — the
// agent re-speaks via its Google Cloud TTS pipeline so the audio
// comes back through the same LiveKit stream. No extra packages
// required.
// ============================================================

export interface TTSConfig {
  // Speaking rate for react-native-tts (device TTS).
  // 0.01 – 0.99 where 0.5 = normal, higher = faster.
  defaultRate: number;
  // Pitch for react-native-tts. 0.5 – 2.0.
  defaultPitch: number;
}

export const TTS_CONFIG: TTSConfig = {
  defaultRate: 0.55,  // slightly faster than normal
  defaultPitch: 1.0,
};

// ── LiveKit RPC config ────────────────────────────────────────
// The RPC method name the agent registers to replay a message.
export const LIVEKIT_REPLAY_RPC_METHOD = 'replay_message';
// The RPC method name the agent registers to stop an in-progress replay.
export const LIVEKIT_STOP_REPLAY_RPC_METHOD = 'stop_replay';

// How long (ms) to wait for the agent to finish speaking before giving up.
// Agent awaits session.say() before returning "ok", so this must be longer
// than the longest possible agent utterance (set to 60 s to be safe).
export const LIVEKIT_REPLAY_TIMEOUT_MS = 60_000;
