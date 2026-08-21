/**
 * TalkingScreen — 1:1 Daily Companion ("1:1 Talking")
 *
 * Minimal UI: countdown timer chip + AuraOrb + End button. No transcript.
 * Voice runs through Gemini Live (companion_agent.py) over LiveKit. Quota is
 * enforced by /api/token (returns 403 when daily limit hits 0) and re-enforced
 * client-side via the countdown.
 *
 * Reuses AuraOrb but stays fully isolated from RoomViewScreen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  BackHandler,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  LiveKitRoom,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTrackVolume,
} from '@livekit/react-native';
import type { Participant } from 'livekit-client';
import { Track } from 'livekit-client';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';
import Ionicons from 'react-native-vector-icons/Ionicons';

import AuraOrb from '../components/AuraOrb';
import { AudioHelper } from '../helpers/AudioHelper';
import { AuthStorage } from '../helpers/AuthStorage';
import { CrashlyticsHelper } from '../helpers/CrashlyticsHelper';
import { useI18n } from '../localization';
import {
  BACKEND_URL,
  COMPANION_SESSION_END_URL,
  COMPANION_SESSION_START_URL,
  FONTS,
} from '../constants';
import { COLORS } from '../constants';
import type { RootStackParamList } from '../navigation/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const ORB_SIZE = Math.min(SCREEN_WIDTH - 24, 380);
const ACCENT_WARM = '#FF7A45';
const BG = (COLORS as any).bg ?? '#0B0F1A';
const BG_CARD = (COLORS as any).cardBg ?? '#121826';
const TEXT_PRIMARY = (COLORS as any).text ?? '#FFFFFF';
const TEXT_SECONDARY = (COLORS as any).textSecondary ?? 'rgba(255,255,255,0.7)';

type Props = NativeStackScreenProps<RootStackParamList, 'TalkingSession'>;

type CompanionTokenResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  url?: string;
  token?: string;
  roomName?: string;
  tier?: 'free' | 'premium';
  remainingSeconds?: number;
  capSeconds?: number;
  resetAt?: string;
  lastLanguageUsed?: string | null;
};

type StartSessionResponse = {
  session_id?: string;
  tier?: 'free' | 'premium';
  last_language_used?: string | null;
};

function formatMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function TalkingScreen({ route, navigation }: Props) {
  const { user } = route.params;
  const { t } = useI18n();

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    'preparing' | 'connecting' | 'live' | 'ended' | 'disconnected' | 'error'
  >('preparing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [lkUrl, setLkUrl] = useState<string | null>(null);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [resetAt, setResetAt] = useState<string | null>(null);

  // Track refs to keep latest values inside cleanup paths.
  const sessionIdRef = useRef<string | null>(null);
  const endedRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Re-assert speaker routing on mount + on every app-resume — Android
  // demotes to earpiece when another app grabs focus, and iOS occasionally
  // routes through the receiver after a backgrounded period.
  useEffect(() => {
    AudioHelper.ensureSpeakerRouting();
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        AudioHelper.ensureSpeakerRouting();
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  // -----------------------------------------------------------------
  // Bootstrap: read auth token, start session row, fetch LK token.
  // -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        await AudioHelper.setupAudio();

        const token = await AuthStorage.getToken();
        if (!token) {
          throw new Error('Auth token missing');
        }
        if (cancelled) return;
        setAuthToken(token);

        // 1) Create a companion_sessions row up front so the agent has an id.
        const startResp = await fetch(COMPANION_SESSION_START_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });
        if (!startResp.ok) {
          throw new Error(`Failed to start session (${startResp.status})`);
        }
        const startData = (await startResp.json()) as StartSessionResponse;
        const newSessionId = startData.session_id ?? null;
        if (!newSessionId) {
          throw new Error('Session id missing from start response');
        }
        if (cancelled) return;
        setSessionId(newSessionId);

        // 2) Ask /api/token for a LiveKit token with companion dispatch.
        const tokenResp = await fetch(BACKEND_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionType: 'companion',
            companionSessionId: newSessionId,
            roomName: `companion-room-${user.id ?? 'anon'}-${Date.now()}`,
            participantName: user.name || `User-${user.id ?? ''}`,
            userName: user.name || '',
            authToken: token,
          }),
        });

        if (tokenResp.status === 403) {
          const data = (await tokenResp.json()) as CompanionTokenResponse;
          throw Object.assign(new Error(data?.message || 'Daily limit reached'), {
            code: 'quota_exhausted',
            resetAt: data?.resetAt ?? null,
          });
        }
        if (!tokenResp.ok) {
          throw new Error(`Token request failed (${tokenResp.status})`);
        }

        const tokenData = (await tokenResp.json()) as CompanionTokenResponse;
        if (cancelled) return;
        if (!tokenData.token || !tokenData.url) {
          throw new Error('Invalid token response');
        }

        setLkUrl(tokenData.url);
        setLkToken(tokenData.token);
        setRemainingSeconds(tokenData.remainingSeconds ?? 0);
        setResetAt(tokenData.resetAt ?? null);
        setPhase('connecting');
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || 'Could not start 1:1 Talking';
        setErrorMessage(msg);
        setPhase('error');
        if (err?.code === 'quota_exhausted') {
          Alert.alert(
            t('talking_screen_quota_alert_title'),
            err?.resetAt
              ? t('talking_screen_quota_alert_body_with_reset', {
                  resetAt: new Date(err.resetAt).toLocaleString(),
                })
              : t('talking_screen_quota_alert_body_default'),
            [{ text: t('talking_screen_alert_ok'), onPress: () => navigation.goBack() }],
            { cancelable: false },
          );
        }
        CrashlyticsHelper.recordError(err as Error, 'TalkingScreen.bootstrap');
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------
  // End-session helper (call once on unmount, End press, or timer hit 0).
  // -----------------------------------------------------------------
  const endCompanionSession = useCallback(
    async (reason: 'manual' | 'quota' | 'error' = 'manual') => {
      if (endedRef.current) return;
      endedRef.current = true;
      const sid = sessionIdRef.current;
      const token = authToken;
      if (!sid || !token) return;
      try {
        await fetch(COMPANION_SESSION_END_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sid }),
        });
      } catch (e) {
        CrashlyticsHelper.recordError(e as Error, `TalkingScreen.endCompanionSession(${reason})`);
      }
    },
    [authToken],
  );

  // -----------------------------------------------------------------
  // Countdown — runs once we're 'live'. At 0, end + leave.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'live') return;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
          }
          (async () => {
            await endCompanionSession('quota');
            try { await AudioHelper.stopAudio(); } catch {}
            Alert.alert(
              t('talking_screen_times_up_title'),
              t('talking_screen_times_up_body'),
              [{ text: t('talking_screen_alert_ok'), onPress: () => navigation.goBack() }],
              { cancelable: false },
            );
          })();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [phase, endCompanionSession, navigation]);

  // Hardware back / focus loss → end cleanly.
  useFocusEffect(
    useCallback(() => {
      const handler = BackHandler.addEventListener('hardwareBackPress', () => {
        handleEndPress();
        return true;
      });
      return () => handler.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useEffect(() => {
    return () => {
      endCompanionSession('manual');
      AudioHelper.stopAudio().catch(() => {});
    };
  }, [endCompanionSession]);

  const handleEndPress = useCallback(() => {
    (async () => {
      await endCompanionSession('manual');
      try { await AudioHelper.stopAudio(); } catch {}
      navigation.goBack();
    })();
  }, [endCompanionSession, navigation]);

  // -----------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------
  const timerLabel = useMemo(() => formatMMSS(remainingSeconds), [remainingSeconds]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <View style={styles.timerChip}>
          <Ionicons name="time-outline" size={14} color={TEXT_PRIMARY} />
          <Text style={styles.timerText}>{timerLabel}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={handleEndPress} hitSlop={12}>
          <Ionicons name="close" size={20} color={TEXT_PRIMARY} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{t('talking_screen_title')}</Text>

        {/* Phase-specific subtitle */}
        <Text style={styles.subtitle}>
          {phase === 'preparing' && t('talking_screen_subtitle_preparing')}
          {phase === 'connecting' && t('talking_screen_subtitle_connecting')}
          {phase === 'live' && t('talking_screen_subtitle_live')}
          {phase === 'error' && (errorMessage || t('talking_screen_error_title'))}
          {phase === 'ended' && t('talking_screen_subtitle_ended')}
          {phase === 'disconnected' && t('talking_screen_subtitle_disconnected')}
        </Text>

        <View style={styles.orbWrap}>
          {/* LOADING — preparing or connecting */}
          {(phase === 'preparing' || phase === 'connecting') && (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={ACCENT_WARM} />
              <Text style={styles.loadingHint}>
                {phase === 'preparing'
                  ? t('talking_screen_loading_preparing')
                  : t('talking_screen_loading_connecting')}
              </Text>
            </View>
          )}

          {/* DISCONNECTED — clean fallback with a Back-to-Home button */}
          {phase === 'disconnected' && (
            <View style={styles.fallbackState}>
              <Ionicons name="cloud-offline-outline" size={56} color={ACCENT_WARM} />
              <Text style={styles.fallbackTitle}>
                {t('talking_screen_disconnected_title')}
              </Text>
              <Text style={styles.fallbackBody}>
                {t('talking_screen_disconnected_body')}
              </Text>
              <TouchableOpacity
                style={styles.fallbackBtn}
                onPress={handleEndPress}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="home-outline"
                  size={16}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.fallbackBtnText}>
                  {t('talking_screen_back_home_button')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ERROR — same shape as disconnected but with the actual error */}
          {phase === 'error' && (
            <View style={styles.fallbackState}>
              <Ionicons name="alert-circle-outline" size={56} color={ACCENT_WARM} />
              <Text style={styles.fallbackTitle}>
                {t('talking_screen_error_title')}
              </Text>
              <Text style={styles.fallbackBody}>
                {errorMessage || t('talking_screen_error_default')}
              </Text>
              <TouchableOpacity
                style={styles.fallbackBtn}
                onPress={handleEndPress}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="home-outline"
                  size={16}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.fallbackBtnText}>
                  {t('talking_screen_back_home_button')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* LiveKitRoom is mounted for both 'connecting' and 'live' so that
              onConnected can fire — but the orb only renders when phase==='live'. */}
          {(phase === 'connecting' || phase === 'live') && lkUrl && lkToken && (
            <LiveKitRoom
              serverUrl={lkUrl}
              token={lkToken}
              connect
              audio
              video={false}
              options={{ adaptiveStream: true, dynacast: true }}
              onConnected={() => {
                setPhase('live');
                AudioHelper.ensureSpeakerRouting();
              }}
              onDisconnected={() => {
                // Only show the network-fallback if this wasn't a user-driven
                // end (manual / quota). The endedRef flag is set by
                // endCompanionSession before disconnect.
                if (endedRef.current) {
                  setPhase('ended');
                } else {
                  setPhase('disconnected');
                  AudioHelper.stopAudio().catch(() => {});
                }
              }}
              onError={(err) => {
                CrashlyticsHelper.recordError(err as Error, 'TalkingScreen.LiveKitRoom');
                setErrorMessage((err as Error)?.message || 'Connection error');
                setPhase('error');
              }}
            >
              {/* Orb only when fully live — keeps loading screen clean. */}
              {phase === 'live' && <OrbBridge />}
            </LiveKitRoom>
          )}
        </View>

        {/* End button only while live — fallback states have their own CTA. */}
        {phase === 'live' && (
          <TouchableOpacity style={styles.endBtn} onPress={handleEndPress} activeOpacity={0.85}>
            <Ionicons name="stop-circle-outline" size={18} color={TEXT_PRIMARY} />
            <Text style={styles.endBtnText}>{t('talking_screen_end_button')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * Internal bridge that lives inside <LiveKitRoom> so it has access to room
 * context. Pulls the agent + local audio tracks and renders the orb here
 * directly. Self-contained so RoomViewScreen never needs to share this code.
 */
type Speaker = 'agent' | 'user' | null;

function OrbBridge() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const agentParticipant: Participant | undefined = remoteParticipants[0];

  // ---- Track resolution (for the orb's amplitude visualization only) ----
  const [agentTrack, setAgentTrack] = useState<RemoteAudioTrack | null>(null);
  const [localTrack, setLocalTrack] = useState<LocalAudioTrack | null>(null);

  // ---- Server-authoritative speaker detection --------------------------
  // LiveKit's SFU runs an active-speaker detector on each track BEFORE
  // mixing/echo. That means agent audio bleeding back into the user's mic
  // CAN'T trick this — only the actual speaker is reported. We listen to
  // each participant's `isSpeakingChanged` event directly.
  const [agentSpeakingRaw, setAgentSpeakingRaw] = useState(false);
  const [userSpeakingRaw, setUserSpeakingRaw] = useState(false);

  // Amplitude purely for the orb's wave intensity (visual only — not used
  // for who-is-speaking decisions). `useTrackVolume` on the remote track
  // works fine; for the LOCAL mic it's unreliable on RN, so we additionally
  // poll `localParticipant.audioLevel` at 50 ms and take the max.
  const localVol = useTrackVolume(localTrack ?? undefined);
  const agentVol = useTrackVolume(agentTrack ?? undefined);
  const [localPolledLevel, setLocalPolledLevel] = useState(0);
  const [agentPolledLevel, setAgentPolledLevel] = useState(0);

  const [activeSpeaker, setActiveSpeaker] = useState<Speaker>(null);
  const speakerRef = useRef<Speaker>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Resolve audio tracks for the orb shader -------------------------
  useEffect(() => {
    if (!room) return;
    const resolve = () => {
      try {
        // Local mic — grab any audio publication, not just Source.Microphone
        // (some plugins publish with Unknown source).
        const localAudioPubs = [...(localParticipant?.audioTrackPublications?.values() ?? [])];
        setLocalTrack((localAudioPubs[0]?.audioTrack ?? null) as LocalAudioTrack | null);

        // Agent audio — same, iterate all audio pubs not just Microphone.
        const agentAudioPubs = [...(agentParticipant?.audioTrackPublications?.values() ?? [])];
        setAgentTrack((agentAudioPubs[0]?.audioTrack ?? null) as RemoteAudioTrack | null);
      } catch {
        // ignore
      }
    };
    resolve();
    const events = [
      'participantConnected',
      'participantDisconnected',
      'trackPublished',
      'trackSubscribed',
      'trackUnpublished',
      'trackUnsubscribed',
      'localTrackPublished',
      'localTrackUnpublished',
    ];
    events.forEach((e) => room.on(e as any, resolve));

    // 50 ms amplitude poll — purely for the orb's animation. The local mic's
    // `useTrackVolume` is unreliable on RN, but `participant.audioLevel` is
    // updated by the SDK from server speaker events + local stats.
    const poll = setInterval(() => {
      try {
        setLocalPolledLevel(localParticipant?.audioLevel ?? 0);
        setAgentPolledLevel(agentParticipant?.audioLevel ?? 0);
      } catch {
        // ignore
      }
    }, 50);

    return () => {
      events.forEach((e) => room.off(e as any, resolve));
      clearInterval(poll);
      setAgentTrack(null);
      setLocalTrack(null);
      setLocalPolledLevel(0);
      setAgentPolledLevel(0);
    };
  }, [room, localParticipant, agentParticipant]);

  // ---- Listen to per-participant isSpeakingChanged ---------------------
  useEffect(() => {
    if (!agentParticipant) return;
    const onChange = () => setAgentSpeakingRaw(agentParticipant.isSpeaking);
    onChange();
    agentParticipant.on('isSpeakingChanged' as any, onChange);
    return () => {
      agentParticipant.off('isSpeakingChanged' as any, onChange);
      setAgentSpeakingRaw(false);
    };
  }, [agentParticipant]);

  useEffect(() => {
    if (!localParticipant) return;
    const onChange = () => setUserSpeakingRaw(localParticipant.isSpeaking);
    onChange();
    localParticipant.on('isSpeakingChanged' as any, onChange);
    return () => {
      localParticipant.off('isSpeakingChanged' as any, onChange);
      setUserSpeakingRaw(false);
    };
  }, [localParticipant]);

  // ---- Strict turn-based speaker FSM -----------------------------------
  // Rules (matches "don't change until they finish"):
  //   1. The instant SuperBold starts speaking → label LOCKS to SUPERBOLD.
  //   2. While locked to SUPERBOLD, the YOU label is NEVER shown — even if
  //      the SFU briefly reports the user speaking (mic bleed / cross-talk).
  //   3. SUPERBOLD only releases after SuperBold has been continuously
  //      silent for AGENT_HOLD_MS. During the hold, every fresh
  //      `isSpeaking=true` resets the timer.
  //   4. After release, if YOU is then speaking, label flips to YOU and
  //      locks there until USER_HOLD_MS of continuous silence.
  //   5. Same lock rule applies to YOU — once SuperBold starts again the
  //      label flips back to SUPERBOLD instantly (NO_INTERRUPTION still
  //      lets SuperBold start a fresh turn — the lock is per-turn, not
  //      per-session).
  const AGENT_HOLD_MS = 1500;
  const USER_HOLD_MS = 800;

  useEffect(() => {
    const commit = (next: Speaker) => {
      if (next !== speakerRef.current) {
        speakerRef.current = next;
        setActiveSpeaker(next);
      }
    };

    // Clear any pending release — we're re-evaluating with fresh raw signals.
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    const current = speakerRef.current;

    // Rule 1 + 2: SuperBold actively speaking is ALWAYS instant SUPERBOLD.
    if (agentSpeakingRaw) {
      commit('agent');
      return;
    }

    // Rule 5: User speaking while NOT locked to agent → YOU.
    if (current !== 'agent' && userSpeakingRaw) {
      commit('user');
      return;
    }

    // Neither side actively speaking right now (or user trying to speak
    // while SuperBold is locked — ignored). Apply the hold.
    if (current === 'agent') {
      // Hold SUPERBOLD for AGENT_HOLD_MS of continuous silence. Any new
      // agentSpeakingRaw=true before that fires will retrigger this effect
      // and clear the timer above, so the lock is preserved across pauses.
      releaseTimerRef.current = setTimeout(() => {
        // After the hold — re-evaluate. If user is now speaking, switch;
        // else go idle.
        if (localParticipant?.isSpeaking) {
          commit('user');
        } else if (agentParticipant?.isSpeaking) {
          // Shouldn't happen (would have re-triggered), but be safe.
          commit('agent');
        } else {
          commit(null);
        }
      }, AGENT_HOLD_MS);
      return;
    }

    if (current === 'user') {
      releaseTimerRef.current = setTimeout(() => {
        if (agentParticipant?.isSpeaking) {
          commit('agent');
        } else if (localParticipant?.isSpeaking) {
          commit('user');
        } else {
          commit(null);
        }
      }, USER_HOLD_MS);
      return;
    }
    // Already idle, both silent — nothing to do.
  }, [agentSpeakingRaw, userSpeakingRaw, agentParticipant, localParticipant]);

  // Feed only the active speaker to the orb — the other side is fully muted
  // (track null + externalAmp 0) so the shader's mixer literally sees only
  // one source. Orb color is always orange.
  //
  // Amplitude wiring per speaker:
  //   • SuperBold → pass agentTrack so the orb's internal useTrackVolume
  //     reads RMS, AND boost the polled agent level via externalAmp as a
  //     belt-and-braces.
  //   • You → useTrackVolume on local is unreliable on RN, so we lean on
  //     the polled localParticipant.audioLevel and pass that as externalAmp.
  const boost = (v: number) => Math.min(1, Math.sqrt(Math.max(0, v)) * 1.8);
  const visibleAgentTrack = activeSpeaker === 'agent' ? agentTrack : null;

  let externalAmp = 0;
  if (activeSpeaker === 'user') {
    // Take the higher of the two local sources, then boost.
    externalAmp = boost(Math.max(localVol ?? 0, localPolledLevel));
  } else if (activeSpeaker === 'agent') {
    // The orb already reads agentTrack RMS internally — externalAmp acts as
    // a floor so the wave still moves on devices where remote RMS is weak.
    externalAmp = boost(Math.max(agentVol ?? 0, agentPolledLevel) * 0.6);
  }

  const speakerLabel =
    activeSpeaker === 'agent' ? 'SuperBold' : activeSpeaker === 'user' ? 'You' : '';

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <AuraOrb
        agentTrack={visibleAgentTrack}
        localTrack={null}
        externalAmp={externalAmp}
        size={ORB_SIZE}
        color={ACCENT_WARM}
      />
      <View style={styles.speakerLabelWrap}>
        <Text
          style={[
            styles.speakerLabel,
            !speakerLabel && styles.speakerLabelIdle,
          ]}
        >
          {speakerLabel || '...'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BG_CARD,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  timerText: {
    color: TEXT_PRIMARY,
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BG_CARD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    alignItems: 'center',
  },
  title: {
    color: TEXT_PRIMARY,
    fontFamily: FONTS.bold,
    fontSize: 22,
    marginTop: 8,
  },
  subtitle: {
    color: TEXT_SECONDARY,
    fontFamily: FONTS.regular,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  orbWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbPlaceholder: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: 'rgba(124, 107, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 40,
  },
  loadingHint: {
    color: TEXT_SECONDARY,
    fontFamily: FONTS.regular,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  fallbackState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 32,
    maxWidth: 360,
  },
  fallbackTitle: {
    color: TEXT_PRIMARY,
    fontFamily: FONTS.semiBold,
    fontSize: 18,
    marginTop: 4,
    textAlign: 'center',
  },
  fallbackBody: {
    color: TEXT_SECONDARY,
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  fallbackBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_WARM,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  fallbackBtnText: {
    color: '#FFFFFF',
    fontFamily: FONTS.semiBold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  speakerLabelWrap: {
    marginTop: 14,
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerLabel: {
    color: ACCENT_WARM,
    fontFamily: FONTS.semiBold,
    fontSize: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  speakerLabelIdle: {
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 4,
  },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E5484D',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5484D',
  },
  endBtnText: {
    color: TEXT_PRIMARY,
    fontFamily: FONTS.semiBold,
    fontSize: 15,
  },
});

export default TalkingScreen;
