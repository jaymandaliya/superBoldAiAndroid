import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LiveKitRoom, useRoomContext } from '@livekit/react-native';
import { RoomEvent } from 'livekit-client';
import type { RootStackParamList } from '../navigation/types';
import { PROFESSIONAL_COLORS } from './room/roomTheme';
import { TestReportOverlay } from './room/components/TestReportOverlay';
import type { TestQuestion, TestReport } from './room/components/TestOverlay';
import { AuthStorage } from '../helpers';
import { startLearningSession } from '../services';
import { LANGUAGES } from '../constants/languages';
import { YOUR_COMPUTER_IP } from '../constants';
import { getLabel } from '../localization/translations';

type Props = NativeStackScreenProps<RootStackParamList, 'TestScreen'>;

const TEST_DURATION_SECONDS = 180;
const toSpokenText = (prompt: string) =>
  prompt.replace(/___/g, '... blank ...').replace(/ - /g, ' ').replace(/^-\s*/, '').replace(/\s-\s*$/, '').trim();
const CORRECT_BG = 'rgba(63, 185, 80, 0.18)';
const CORRECT_BORDER = '#3FB950';
const WRONG_BG = 'rgba(248, 81, 73, 0.18)';
const WRONG_BORDER = '#F85149';

// ─── Question Sub-Components ──────────────────────────────────────────────────

type DragInfo = { source: 'bank' | 'placed'; srcIdx: number; wordIdx: number };

function JumbledQuestion({
  question,
  questionNumber,
  onAnswer,
  showFeedback,
  isCorrect,
  tt,
}: {
  question: TestQuestion;
  questionNumber: number;
  onAnswer: (order: number[]) => void;
  showFeedback: boolean;
  isCorrect: boolean;
  tt: (key: string, params?: Record<string, string | number>) => string;
}) {
  const validIndices = (words: string[]) =>
    words.map((w, i) => ({ w, i })).filter(({ w }) => w.trim() !== '-').map(({ i }) => i);

  const [bank, setBank] = useState<number[]>(() => validIndices(question.words));
  const [placed, setPlaced] = useState<number[]>([]);

  // ── Drag state ────────────────────────────────────────────────────────
  const [activeDrag, setActiveDrag] = useState<DragInfo | null>(null);
  const [insertAt, setInsertAt] = useState(-1);
  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  // Layout references (measured on drag start)
  const containerRef = useRef<View>(null);
  const answerZoneRef = useRef<View>(null);
  const containerPos = useRef({ x: 0, y: 0 });
  const azPos = useRef({ x: 0, y: 0, w: 300, h: 60 });
  // Each placed chip's layout relative to answer zone, keyed by list position
  const chipLayouts = useRef<{ [pos: number]: { x: number; y: number; w: number; h: number } }>({});

  // Stable refs for PanResponder closures (avoid stale state)
  const placedRef = useRef(placed);
  const bankRef = useRef(bank);
  useEffect(() => { placedRef.current = placed; }, [placed]);
  useEffect(() => { bankRef.current = bank; }, [bank]);

  useEffect(() => {
    setBank(validIndices(question.words));
    setPlaced([]);
    setActiveDrag(null);
    setInsertAt(-1);
    chipLayouts.current = {};
  }, [question.question_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const measureLayout = useCallback(() => {
    containerRef.current?.measure((_a, _b, _c, _d, px, py) => {
      containerPos.current = { x: px, y: py };
    });
    answerZoneRef.current?.measure((_a, _b, w, h, px, py) => {
      azPos.current = { x: px, y: py, w, h };
    });
  }, []);

  // Determine where in placed[] to insert based on current touch page coords
  const getInsertIdx = useCallback((moveX: number, moveY: number): number => {
    const az = azPos.current;
    if (moveY < az.y - 40 || moveY > az.y + az.h + 50) { return -1; }
    const relX = moveX - az.x;
    const relY = moveY - az.y;
    const n = placedRef.current.length;
    if (n === 0) { return 0; }
    for (let i = 0; i < n; i++) {
      const c = chipLayouts.current[i];
      if (!c) { continue; }
      if (relY >= c.y - 6 && relY <= c.y + c.h + 6 && relX < c.x + c.w / 2) {
        return i;
      }
    }
    return n;
  }, []);

  // Build PanResponder for each chip — called during render
  const makePR = (source: 'bank' | 'placed', srcIdx: number, wordIdx: number) => {
    let moved = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !showFeedback,
      onMoveShouldSetPanResponder: (_e, gs) =>
        !showFeedback && (Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3),

      onPanResponderGrant: (e) => {
        moved = false;
        measureLayout();
        const { pageX, pageY } = e.nativeEvent;
        dragX.setValue(pageX - containerPos.current.x - 32);
        dragY.setValue(pageY - containerPos.current.y - 18);
        setActiveDrag({ source, srcIdx, wordIdx });
        setInsertAt(source === 'placed' ? srcIdx : placedRef.current.length);
      },

      onPanResponderMove: (_e, gs) => {
        moved = true;
        dragX.setValue(gs.moveX - containerPos.current.x - 32);
        dragY.setValue(gs.moveY - containerPos.current.y - 18);
        const idx = getInsertIdx(gs.moveX, gs.moveY);
        setInsertAt(idx >= 0 ? idx : (source === 'placed' ? srcIdx : placedRef.current.length));
      },

      onPanResponderRelease: (_e, gs) => {
        const p = placedRef.current;
        const b = bankRef.current;

        if (!moved) {
          // Treat as tap (no meaningful movement)
          if (source === 'bank') {
            const newPlaced = [...p, wordIdx];
            setPlaced(newPlaced);
            setBank(b.filter((_, i) => i !== srcIdx));
            onAnswer(newPlaced);
          } else {
            const newPlaced = p.filter((_, i) => i !== srcIdx);
            setPlaced(newPlaced);
            setBank([...b, wordIdx]);
            onAnswer(newPlaced);
          }
        } else {
          const dropIdx = getInsertIdx(gs.moveX, gs.moveY);
          if (dropIdx >= 0) {
            if (source === 'placed') {
              // Reorder within placed
              const next = [...p];
              next.splice(srcIdx, 1);
              next.splice(dropIdx > srcIdx ? dropIdx - 1 : dropIdx, 0, wordIdx);
              setPlaced(next);
              onAnswer(next);
            } else {
              // Bank → placed at specific position
              const next = [...p];
              next.splice(dropIdx, 0, wordIdx);
              setPlaced(next);
              setBank(b.filter((_, i) => i !== srcIdx));
              onAnswer(next);
            }
          } else if (source === 'placed') {
            // Dragged outside answer zone → return to bank
            const next = p.filter((_, i) => i !== srcIdx);
            setPlaced(next);
            setBank([...b, wordIdx]);
            onAnswer(next);
          }
          // Bank chip dragged outside → no-op (snap back)
        }
        setActiveDrag(null);
        setInsertAt(-1);
      },

      onPanResponderTerminate: () => {
        setActiveDrag(null);
        setInsertAt(-1);
      },
    });
  };

  const correctWords = question.correct_order.map(i => question.words[i]);
  const draggingWord = activeDrag ? question.words[activeDrag.wordIdx] : '';

  return (
    <View ref={containerRef} collapsable={false} onLayout={measureLayout}>
      {question.heading ? (
        <Text style={styles.headingPillText}>{question.heading}</Text>
      ) : null}

      <Text style={styles.questionPrompt}>{questionNumber}. {question.prompt}</Text>

      {/* ── Answer zone ── */}
      <Text style={styles.zoneLabel}>{tt('test_ui_your_answer')}</Text>
      <View
        ref={answerZoneRef}
        collapsable={false}
        style={[
          styles.answerZone,
          placed.length > 0 && styles.answerZoneFilled,
          showFeedback && { borderColor: isCorrect ? CORRECT_BORDER : WRONG_BORDER, backgroundColor: isCorrect ? CORRECT_BG : WRONG_BG },
        ]}
        onLayout={measureLayout}
      >
        {placed.length === 0 && !activeDrag && (
          <Text style={styles.answerZoneHint}>{tt('test_ui_tap_words_hint')}</Text>
        )}

        {placed.map((wordIdx, pos) => {
          const isGhost = activeDrag?.source === 'placed' && activeDrag.srcIdx === pos;
          const pr = makePR('placed', pos, wordIdx);
          return (
            <React.Fragment key={`placed-${wordIdx}-${pos}`}>
              {/* Drop gap indicator — shown before this chip when dragging */}
              {activeDrag && insertAt === pos && (
                <View style={styles.dropGap} />
              )}
              <Animated.View
                collapsable={false}
                style={[
                  styles.chip,
                  styles.chipPlaced,
                  isGhost && styles.chipGhost,
                  showFeedback && {
                    borderColor: isCorrect ? CORRECT_BORDER : WRONG_BORDER,
                    backgroundColor: isCorrect ? CORRECT_BG : 'rgba(124,107,255,0.20)',
                  },
                ]}
                onLayout={e => {
                  chipLayouts.current[pos] = {
                    x: e.nativeEvent.layout.x,
                    y: e.nativeEvent.layout.y,
                    w: e.nativeEvent.layout.width,
                    h: e.nativeEvent.layout.height,
                  };
                }}
                {...pr.panHandlers}
              >
                <Text style={styles.chipText}>{question.words[wordIdx]}</Text>
              </Animated.View>
            </React.Fragment>
          );
        })}

        {/* Drop gap at the end */}
        {activeDrag && insertAt === placed.length && (
          <View style={styles.dropGap} />
        )}
      </View>

      {/* ── Correct answer (shown when wrong) ── */}
      {showFeedback && !isCorrect && (
        <View style={styles.correctAnswerBlock}>
          <Text style={styles.correctAnswerLabel}>{tt('test_ui_correct_answer_label')}</Text>
          <View style={styles.answerZoneCorrect}>
            {correctWords.map((w, i) => (
              <View key={i} style={[styles.chip, { borderColor: CORRECT_BORDER, backgroundColor: CORRECT_BG }]}>
                <Text style={[styles.chipText, { color: CORRECT_BORDER }]}>{w}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Word bank ── */}
      {!showFeedback && (
        <>
          <View style={styles.bankDivider} />
          <View style={styles.wordBank}>
            {bank.map((wordIdx, bankPos) => {
              const isGhost = activeDrag?.source === 'bank' && activeDrag.srcIdx === bankPos;
              const pr = makePR('bank', bankPos, wordIdx);
              return (
                <Animated.View
                  key={`bank-${wordIdx}`}
                  style={[styles.chip, styles.chipBank, isGhost && styles.chipGhost]}
                  {...pr.panHandlers}
                >
                  <Text style={styles.chipText}>{question.words[wordIdx]}</Text>
                </Animated.View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Floating drag chip (rendered last = on top) ── */}
      {activeDrag && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chip,
            styles.chipDragging,
            { position: 'absolute', left: dragX, top: dragY, zIndex: 1000, elevation: 8 },
          ]}
        >
          <Text style={[styles.chipText, { color: '#FFFFFF' }]}>{draggingWord}</Text>
        </Animated.View>
      )}
    </View>
  );
}

function FillBlankQuestion({
  question,
  questionNumber,
  selected,
  onAnswer,
  showFeedback,
}: {
  question: TestQuestion;
  questionNumber: number;
  selected: number | null;
  onAnswer: (index: number) => void;
  showFeedback: boolean;
}) {
  const chipStyle = (i: number) => {
    if (!showFeedback) { return [styles.optionChip, selected === i && styles.optionChipSelected]; }
    if (i === question.correct_index) { return [styles.optionChip, styles.optionFeedbackCorrect]; }
    if (i === selected) { return [styles.optionChip, styles.optionFeedbackWrong]; }
    return [styles.optionChip];
  };

  const chipTextStyle = (i: number) => {
    if (!showFeedback) { return [styles.optionChipText, selected === i && styles.optionChipTextSelected]; }
    if (i === question.correct_index) { return [styles.optionChipText, { color: CORRECT_BORDER, fontFamily: 'IBMPlexSans-SemiBold' }]; }
    if (i === selected) { return [styles.optionChipText, { color: WRONG_BORDER, fontFamily: 'IBMPlexSans-SemiBold' }]; }
    return [styles.optionChipText, { opacity: 0.4 }];
  };

  return (
    <View>
      {question.heading ? (
        <Text style={styles.headingPillText}>{question.heading}</Text>
      ) : null}
      <Text style={styles.questionPrompt}>{questionNumber}. {question.prompt}</Text>
      <View style={styles.optionGrid}>
        {question.options.map((opt, i) => (
          <TouchableOpacity key={i} style={chipStyle(i)} onPress={() => !showFeedback && onAnswer(i)} activeOpacity={0.8}>
            <Text style={chipTextStyle(i)}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function MCQQuestion({
  question,
  questionNumber,
  selected,
  onAnswer,
  showFeedback,
}: {
  question: TestQuestion;
  questionNumber: number;
  selected: number | null;
  onAnswer: (index: number) => void;
  showFeedback: boolean;
}) {
  const letters = ['A', 'B', 'C', 'D'];

  const rowStyle = (i: number) => {
    if (!showFeedback) { return [styles.mcqOption, selected === i && styles.mcqOptionSelected]; }
    if (i === question.correct_index) { return [styles.mcqOption, styles.mcqOptionFeedbackCorrect]; }
    if (i === selected) { return [styles.mcqOption, styles.mcqOptionFeedbackWrong]; }
    return [styles.mcqOption, { opacity: 0.4 }];
  };

  const letterBubbleStyle = (i: number) => {
    if (!showFeedback) { return [styles.mcqLetter, selected === i && styles.mcqLetterSelected]; }
    if (i === question.correct_index) { return [styles.mcqLetter, { backgroundColor: CORRECT_BORDER, borderColor: CORRECT_BORDER }]; }
    if (i === selected) { return [styles.mcqLetter, { backgroundColor: WRONG_BORDER, borderColor: WRONG_BORDER }]; }
    return [styles.mcqLetter];
  };

  const letterTextStyle = (i: number) => {
    if (!showFeedback) { return [styles.mcqLetterText, selected === i && styles.mcqLetterTextSelected]; }
    if (i === question.correct_index || i === selected) { return [styles.mcqLetterText, { color: '#FFFFFF' }]; }
    return [styles.mcqLetterText];
  };

  return (
    <View>
      {question.heading ? (
        <Text style={styles.headingPillText}>{question.heading}</Text>
      ) : null}
      <Text style={styles.mcqQuestion}>{questionNumber}. {question.prompt}</Text>
      {question.options.map((opt, i) => (
        <TouchableOpacity key={i} style={rowStyle(i)} onPress={() => !showFeedback && onAnswer(i)} activeOpacity={0.8}>
          <View style={letterBubbleStyle(i)}>
            <Text style={letterTextStyle(i)}>{letters[i]}</Text>
          </View>
          <Text style={[styles.mcqOptionText, showFeedback && i === question.correct_index && { color: CORRECT_BORDER, fontFamily: 'IBMPlexSans-SemiBold' }]}>
            {opt}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Inner component: runs inside <LiveKitRoom> ───────────────────────────────

interface TestRoomHandlerProps {
  learning: RootStackParamList['TestScreen']['learning'];
  user: RootStackParamList['TestScreen']['user'];
  checkpoint: number;
  authToken: string;
  publishAnswerRef: React.RefObject<
    ((questionId: string, selectedIndex: number, selectedOrder?: number[]) => void) | null
  >;
  interruptSpeechRef: React.RefObject<(() => void) | null>;
  notifyNextRef: React.RefObject<(() => void) | null>;
  speakTextRef: React.RefObject<((text: string) => void) | null>;
  onTestQuestion: (question: TestQuestion, questionNumber: number, total: number) => void;
  onTestComplete: (report: TestReport) => void;
}

function TestRoomHandler({
  learning,
  user,
  checkpoint,
  authToken,
  publishAnswerRef,
  interruptSpeechRef,
  notifyNextRef,
  speakTextRef,
  onTestQuestion,
  onTestComplete,
}: TestRoomHandlerProps) {
  const room = useRoomContext();
  const sentRef = useRef(false);
  const roomRef = useRef(room);

  useEffect(() => { roomRef.current = room; }, [room]);

  // Expose notifyNext via ref — tells the agent the student tapped Next (triggers speech)
  useEffect(() => {
    notifyNextRef.current = () => {
      const r = roomRef.current;
      if (!r?.localParticipant) { return; }
      try {
        const encoder = new TextEncoder();
        r.localParticipant.publishData(
          encoder.encode(JSON.stringify({ type: 'next_question_ready' })),
          { reliable: true },
        );
      } catch (_) {}
    };
    return () => { notifyNextRef.current = null; };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose interruptSpeech via ref — sends a packet that causes the agent to stop speaking
  useEffect(() => {
    interruptSpeechRef.current = () => {
      const r = roomRef.current;
      if (!r?.localParticipant) { return; }
      try {
        const encoder = new TextEncoder();
        r.localParticipant.publishData(
          encoder.encode(JSON.stringify({ type: 'interrupt_speech' })),
          { reliable: true },
        );
      } catch (_) {}
    };
    return () => { interruptSpeechRef.current = null; };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose speakText via ref — calls replay_message RPC so agent speaks via Google TTS
  useEffect(() => {
    speakTextRef.current = (text: string) => {
      const r = roomRef.current;
      if (!r?.localParticipant) { return; }
      const agentIdentity = Array.from(r.remoteParticipants.values())
        .find(p => p.identity.startsWith('agent'))?.identity;
      if (!agentIdentity) { return; }
      try {
        r.localParticipant.performRpc({
          destinationIdentity: agentIdentity,
          method: 'replay_message',
          payload: text,
          responseTimeout: 30000,
        }).catch(() => {});
      } catch (_) {}
    };
    return () => { speakTextRef.current = null; };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose publishAnswer via ref so question UI can call it
  useEffect(() => {
    publishAnswerRef.current = (questionId: string, selectedIndex: number, selectedOrder?: number[]) => {
      const r = roomRef.current;
      if (!r?.localParticipant) { return; }
      try {
        const isTimeout = questionId === '__timeout__';
        const packet = isTimeout
          ? { type: 'test_timeout' }
          : { type: 'test_answer', question_id: questionId, selected_index: selectedIndex, selected_order: selectedOrder };
        const encoder = new TextEncoder();
        r.localParticipant.publishData(encoder.encode(JSON.stringify(packet)), { reliable: true });
      } catch (e) {
        console.error('[TestAnswer] publishData failed:', e);
      }
    };
    return () => { publishAnswerRef.current = null; };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register RPC handlers for test events
  useEffect(() => {
    if (!room) { return; }

    const handleTestQuestion = async (data: { callerIdentity: string; payload: string; responseTimeout: number }) => {
      try {
        const event = JSON.parse(data.payload);
        if (event.question) {
          onTestQuestion(event.question, event.question_number ?? 0, event.total ?? 10);
        }
      } catch (e) {
        console.error('[TestRoomHandler] onTestQuestion parse error:', e);
      }
      return JSON.stringify({ success: true });
    };

    const handleTestComplete = async (data: { callerIdentity: string; payload: string; responseTimeout: number }) => {
      try {
        const report = JSON.parse(data.payload);
        onTestComplete(report);
      } catch (e) {
        console.error('[TestRoomHandler] onTestComplete parse error:', e);
      }
      return JSON.stringify({ success: true });
    };

    try {
      const registerFn = (room as any).registerRpcMethod?.bind(room) ?? room.localParticipant.registerRpcMethod.bind(room.localParticipant);
      const unregisterFn = (room as any).unregisterRpcMethod?.bind(room) ?? room.localParticipant.unregisterRpcMethod.bind(room.localParticipant);

      registerFn('onTestQuestion', handleTestQuestion);
      registerFn('onTestComplete', handleTestComplete);

      return () => {
        try {
          unregisterFn('onTestQuestion');
          unregisterFn('onTestComplete');
        } catch (_) {}
      };
    } catch (e) {
      console.warn('[TestRoomHandler] RPC registration failed:', e);
      return () => {};
    }
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send language_config data packet as soon as room is connected
  useEffect(() => {
    if (!room?.localParticipant || sentRef.current) { return; }

    const send = async () => {
      if (sentRef.current) { return; }
      sentRef.current = true;
      try {
        const nativeLang = LANGUAGES.find(l => l.code === learning.native_language);
        const targetLang = LANGUAGES.find(l => l.code === learning.target_language);
        const config = {
          type: 'language_config',
          nativeLanguage: learning.native_language,
          targetLanguage: learning.target_language,
          nativeLanguageName: nativeLang?.name ?? 'English',
          targetLanguageName: targetLang?.name ?? 'Hindi',
          learningId: learning.id,
          currentLevel: learning.current_level,
          authToken,
          userName: user?.name || '',
          isPremium: learning.is_premium || false,
          purchasedMaxLevel: 0,
          purchasedTiers: learning.purchased_tiers || [],
          skillLevel: '',
          learningReason: '',
          sessionType: 'test',
          testCheckpoint: checkpoint,
          timestamp: new Date().toISOString(),
        };
        const encoder = new TextEncoder();
        await room.localParticipant.publishData(encoder.encode(JSON.stringify(config)), {
          reliable: true,
          topic: 'language-config',
        });
        console.log('[TestRoomHandler] language_config sent (test session, checkpoint', checkpoint, ')');
      } catch (e) {
        console.error('[TestRoomHandler] language_config send failed:', e);
        sentRef.current = false;
      }
    };

    // If already connected, send immediately; otherwise wait for the connect event
    if (room.localParticipant.connectionQuality !== undefined) {
      send();
    }

    const onConnected = () => send();
    room.on(RoomEvent.Connected, onConnected);
    return () => { room.off(RoomEvent.Connected, onConnected); };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ─── TestScreen ────────────────────────────────────────────────────────────────

export function TestScreen({ navigation, route }: Props) {
  const { learning, user, checkpoint } = route.params;
  const insets = useSafeAreaInsets();

  const tt = useMemo(
    () => (key: string, params?: Record<string, string | number>) =>
      getLabel(key, learning.native_language, params),
    [learning.native_language],
  );

  const [liveKitToken, setLiveKitToken] = useState('');
  const [liveKitUrl, setLiveKitUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadErrorMessage = useMemo(() => {
    if (!loadError) {
      return '';
    }
    if (loadError === 'Not authenticated') {
      return tt('test_ui_not_authenticated');
    }
    if (loadError === 'Connection error. Please try again.') {
      return tt('test_ui_connection_error');
    }
    if (loadError === 'Failed to start test session') {
      return tt('test_ui_failed_start_session');
    }
    return loadError;
  }, [loadError, tt]);

  const [currentQuestion, setCurrentQuestion] = useState<TestQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(10);

  const [testReport, setTestReport] = useState<TestReport | null>(null);
  const [showReport, setShowReport] = useState(false);

  const [timeLeft, setTimeLeft] = useState(TEST_DURATION_SECONDS);
  const [timedOut, setTimedOut] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [jumbledOrder, setJumbledOrder] = useState<number[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);
  const publishAnswerRef = useRef<((questionId: string, selectedIndex: number, selectedOrder?: number[]) => void) | null>(null);
  const interruptSpeechRef = useRef<(() => void) | null>(null);
  const notifyNextRef = useRef<(() => void) | null>(null);
  const speakTextRef = useRef<((text: string) => void) | null>(null);

  // Refs kept in sync so the timer callback (stale closure) can read current state
  const currentQuestionRef = useRef<TestQuestion | null>(null);
  const selectedIndexRef = useRef<number | null>(null);
  const jumbledOrderRef = useRef<number[]>([]);
  const showFeedbackRef = useRef(false);
  const questionNumberRef = useRef(0);

  // Buffer: next question from agent — applied only when user taps Next
  const pendingQuestionRef = useRef<{ q: TestQuestion; qNum: number; total: number } | null>(null);
  // Set true by handleNext when user taps Next before agent delivers next question
  const readyForNextRef = useRef(false);

  // Keep refs in sync with state (timer callback reads these, not stale state)
  useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { jumbledOrderRef.current = jumbledOrder; }, [jumbledOrder]);
  useEffect(() => { showFeedbackRef.current = showFeedback; }, [showFeedback]);
  useEffect(() => { questionNumberRef.current = questionNumber; }, [questionNumber]);

  // Fetch LiveKit token for the test session
  useEffect(() => {
    async function load() {
      try {
        const token = await AuthStorage.getToken();
        if (!token) { setLoadError('Not authenticated'); return; }
        setAuthToken(token);
        const { status, data } = await startLearningSession(token, {
          native_language: learning.native_language,
          target_language: learning.target_language,
          checkpoint_test: checkpoint,
        });
        if (status !== 200 || !data.token || !data.url) {
          setLoadError(data.message || 'Failed to start test session');
          return;
        }
        const normalizedUrl = String(data.url)
          .replace('localhost', YOUR_COMPUTER_IP)
          .replace('127.0.0.1', YOUR_COMPUTER_IP);
        setLiveKitToken(String(data.token));
        setLiveKitUrl(normalizedUrl);
      } catch (e) {
        setLoadError('Connection error. Please try again.');
      }
    }
    load();
  }, [checkpoint, learning.native_language, learning.target_language]);

  // Countdown timer — only starts after the first question arrives
  useEffect(() => {
    if (timedOut || showReport || !timerActive) { return; }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setTimedOut(true);
          // Submit the in-progress answer (if any) before signalling timeout
          const q = currentQuestionRef.current;
          if (q && !showFeedbackRef.current) {
            if (q.type === 'jumbled' && jumbledOrderRef.current.length > 0) {
              publishAnswerRef.current?.(q.question_id, -1, jumbledOrderRef.current);
            } else if (q.type !== 'jumbled' && selectedIndexRef.current !== null) {
              publishAnswerRef.current?.(q.question_id, selectedIndexRef.current);
            }
          }
          publishAnswerRef.current?.('__timeout__', -1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { clearInterval(timerRef.current!); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReport, timerActive]);

  const handleTestQuestion = useCallback((q: TestQuestion, qNum: number, total: number) => {
    if (questionNumberRef.current === 0) {
      setCurrentQuestion(q);
      setQuestionNumber(qNum);
      setTotalQuestions(total);
      setTimerActive(true);
      speakTextRef.current?.(toSpokenText(q.prompt));
    } else if (readyForNextRef.current) {
      readyForNextRef.current = false;
      setCurrentQuestion(q);
      setQuestionNumber(qNum);
      setTotalQuestions(total);
      setSelectedIndex(null);
      setJumbledOrder([]);
      setShowFeedback(false);
      setFeedbackCorrect(false);
      speakTextRef.current?.(toSpokenText(q.prompt));
    } else {
      pendingQuestionRef.current = { q, qNum, total };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTestComplete = useCallback((report: TestReport) => {
    clearInterval(timerRef.current!);
    clearTimeout(autoAdvanceRef.current!);
    setTestReport({ ...report, time_taken_seconds: TEST_DURATION_SECONDS - timeLeft, checkpoint });
    setShowReport(true);
  }, [timeLeft, checkpoint]);

  const handleContinueAfterReport = () => {
    const resumeLearning = route.params.postTestPending?.updatedLearning ?? learning;
    navigation.replace('MainTabs', { user, existingLearning: { ...resumeLearning, pending_test_checkpoint: 0 } });
  };

  /** Room opens TestScreen with `replace`, so there is often no stack entry — `goBack()` fails. */
  const exitTest = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('MainTabs', { user, existingLearning: learning });
    }
  }, [navigation, user, learning]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  const timerUrgent = timeLeft < 60;
  const isLastQuestion = questionNumber === totalQuestions;
  const isWaiting = !currentQuestion && questionNumber > 0;
  const isInitialConnecting = !loadError && !liveKitToken;
  const isAgentConnecting = liveKitToken && !currentQuestion && questionNumber === 0 && !showReport;

  const canProceed = (): boolean => {
    if (!currentQuestion || showFeedback) { return false; }
    if (currentQuestion.type === 'jumbled') { return jumbledOrder.length > 0; }
    return selectedIndex !== null && selectedIndex >= 0;
  };

  const handleSubmit = () => {
    if (!currentQuestion || !canProceed()) { return; }
    const isCorrect =
      currentQuestion.type === 'jumbled'
        ? JSON.stringify(jumbledOrder) === JSON.stringify(currentQuestion.correct_order)
        : selectedIndex === currentQuestion.correct_index;

    setFeedbackCorrect(isCorrect);
    setShowFeedback(true);

    interruptSpeechRef.current?.();

    // Stop timer on the last question — no point counting down further
    if (questionNumberRef.current >= totalQuestions) {
      clearInterval(timerRef.current!);
      setTimerActive(false);
    }

    if (currentQuestion.type === 'jumbled') {
      publishAnswerRef.current?.(currentQuestion.question_id, -1, jumbledOrder);
    } else {
      publishAnswerRef.current?.(currentQuestion.question_id, selectedIndex ?? -1);
    }
  };

  const handleNext = () => {
    // Signal agent — for the last question this triggers complete_test()
    notifyNextRef.current?.();

    const isLastQ = questionNumberRef.current >= totalQuestions;

    if (isLastQ) {
      // Last question done — do NOT set readyForNextRef (no more questions coming).
      // Just clear state and wait for onTestComplete RPC.
      pendingQuestionRef.current = null;
      readyForNextRef.current = false;
      setCurrentQuestion(null);
      setSelectedIndex(null);
      setJumbledOrder([]);
      setShowFeedback(false);
      setFeedbackCorrect(false);
      return;
    }

    const pending = pendingQuestionRef.current;
    if (pending) {
      pendingQuestionRef.current = null;
      setCurrentQuestion(pending.q);
      setQuestionNumber(pending.qNum);
      setTotalQuestions(pending.total);
      setSelectedIndex(null);
      setJumbledOrder([]);
      setShowFeedback(false);
      setFeedbackCorrect(false);
      speakTextRef.current?.(toSpokenText(pending.q.prompt));
    } else {
      // Question not yet delivered — show spinner
      readyForNextRef.current = true;
      setCurrentQuestion(null);
      setSelectedIndex(null);
      setJumbledOrder([]);
      setShowFeedback(false);
      setFeedbackCorrect(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

      {/* Header */}
      <View style={styles.header}>
        {/* Row 1: back + title + close */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={exitTest} activeOpacity={0.8}>
            <Text style={styles.backButtonText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>{tt('test_ui_quiz_title', { checkpoint })}</Text>
          </View>
          <Text style={[styles.timer, timerUrgent && styles.timerUrgent]}>{timerStr}</Text>
        </View>
      </View>

      {/* Progress bar */}
      {questionNumber > 0 && (
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${(questionNumber / totalQuestions) * 100}%` }]} />
        </View>
      )}

      {/* Content */}
      {loadError ? (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{loadErrorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={exitTest} activeOpacity={0.85}>
            <Text style={styles.nextButtonText}>{tt('test_ui_go_back')}</Text>
          </TouchableOpacity>
        </View>
      ) : isInitialConnecting ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
          <Text style={styles.loadingText}>{tt('test_ui_starting_session')}</Text>
        </View>
      ) : isAgentConnecting ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
          <Text style={styles.loadingText}>{tt('test_ui_connecting_examiner')}</Text>
          <Text style={styles.loadingSubText}>{tt('test_ui_listen_first_question')}</Text>
        </View>
      ) : isWaiting ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
          <Text style={styles.loadingText}>
            {questionNumber >= totalQuestions ? tt('test_report_calculating_score') : tt('test_ui_loading_next_question')}
          </Text>
        </View>
      ) : timedOut && !currentQuestion ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
          <Text style={styles.loadingText}>{tt('test_report_calculating_score')}</Text>
        </View>
      ) : currentQuestion ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {currentQuestion.type === 'jumbled' && (
            <JumbledQuestion
              question={currentQuestion}
              questionNumber={questionNumber}
              onAnswer={order => setJumbledOrder(order)}
              showFeedback={showFeedback}
              isCorrect={feedbackCorrect}
              tt={tt}
            />
          )}
          {currentQuestion.type === 'fill_blank' && (
            <FillBlankQuestion
              question={currentQuestion}
              questionNumber={questionNumber}
              selected={selectedIndex}
              onAnswer={idx => setSelectedIndex(idx)}
              showFeedback={showFeedback}
            />
          )}
          {currentQuestion.type === 'mcq' && (
            <MCQQuestion
              question={currentQuestion}
              questionNumber={questionNumber}
              selected={selectedIndex}
              onAnswer={idx => setSelectedIndex(idx)}
              showFeedback={showFeedback}
            />
          )}

          {showFeedback ? (
            <View style={styles.feedbackBlock}>
              <View style={[styles.feedbackStrip, feedbackCorrect ? styles.feedbackStripCorrect : styles.feedbackStripWrong]}>
                <Text style={styles.feedbackEmoji}>{feedbackCorrect ? '✓' : '✗'}</Text>
                <Text style={[styles.feedbackText, { color: feedbackCorrect ? CORRECT_BORDER : WRONG_BORDER }]}>
                  {feedbackCorrect ? tt('test_ui_feedback_correct') : tt('test_ui_feedback_wrong')}
                </Text>
              </View>
              <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.85}>
                <Text style={styles.nextButtonText}>{tt('test_ui_next')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.checkButton, !canProceed() && styles.nextButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canProceed()}
              activeOpacity={0.85}>
              <Text style={styles.nextButtonText}>{tt('test_ui_submit')}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : null}

      {/* LiveKit connection (invisible — just handles RPC and data) */}
      {liveKitToken ? (
        <LiveKitRoom
          serverUrl={liveKitUrl}
          token={liveKitToken}
          connect={true}
          options={{ adaptiveStream: false, dynacast: false }}
          audio={true}
          video={false}
          onConnected={() => { console.log('[TestScreen] LiveKit connected'); }}
          onDisconnected={() => { console.log('[TestScreen] LiveKit disconnected'); }}
          onError={e => { console.error('[TestScreen] LiveKit error:', e); }}
        >
          <TestRoomHandler
            learning={learning}
            user={user}
            checkpoint={checkpoint}
            authToken={authToken}
            publishAnswerRef={publishAnswerRef}
            interruptSpeechRef={interruptSpeechRef}
            notifyNextRef={notifyNextRef}
            speakTextRef={speakTextRef}
            onTestQuestion={handleTestQuestion}
            onTestComplete={handleTestComplete}
          />
        </LiveKitRoom>
      ) : null}

      {/* Test report overlay */}
      <TestReportOverlay
        visible={showReport}
        report={testReport}
        onContinue={handleContinueAfterReport}
        nativeLanguageCode={learning.native_language}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PROFESSIONAL_COLORS.bgDark,
  },
  header: {
    flexDirection: 'column',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: PROFESSIONAL_COLORS.border,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 11,
    fontFamily: 'IBMPlexSans-Medium',
    marginTop: 1,
  },
  headerMeta: {
    alignItems: 'center',
  },
  progressPill: {
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
  },
  progressText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Medium',
  },
  checkpointLabel: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Medium',
  },
  timer: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    minWidth: 52,
    textAlign: 'right',
  },
  timerUrgent: { color: PROFESSIONAL_COLORS.error },
  progressBarBg: {
    height: 3,
    backgroundColor: PROFESSIONAL_COLORS.border,
  },
  progressBarFill: {
    height: 3,
    backgroundColor: PROFESSIONAL_COLORS.accent,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Regular',
  },
  loadingSubText: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Regular',
  },
  errorText: {
    color: PROFESSIONAL_COLORS.error,
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Regular',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    backgroundColor: PROFESSIONAL_COLORS.secondary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 22, paddingBottom: 40 },
  questionTypeHeading: {
    color: PROFESSIONAL_COLORS.accent,
    fontSize: 12,
    fontFamily: 'IBMPlexSans-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  // ── Heading label (plain, no bubble) ────────────────────────────────────────
  headingPillText: {
    color: PROFESSIONAL_COLORS.accent,
    fontSize: 17,
    fontFamily: 'Montserrat-Bold',
    letterSpacing: 0.2,
    marginBottom: 12,
  },

  // ── Question text (no container — just breathing text) ────────────────────
  questionPrompt: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 22,
    fontFamily: 'Montserrat-Bold',
    lineHeight: 32,
    marginBottom: 28,
  },
  mcqQuestion: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 22,
    fontFamily: 'Montserrat-Bold',
    lineHeight: 32,
    marginBottom: 24,
  },

  // ── Jumbled: answer construction zone ────────────────────────────────────
  zoneLabel: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 11,
    fontFamily: 'IBMPlexSans-SemiBold',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  answerZone: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minHeight: 54,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(124,107,255,0.22)',
    backgroundColor: 'rgba(124,107,255,0.04)',
  },
  answerZoneFilled: {
    borderColor: 'rgba(124,107,255,0.45)',
    backgroundColor: 'rgba(124,107,255,0.08)',
  },
  answerZoneHint: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 14,
    fontFamily: 'IBMPlexSans-Regular',
    alignSelf: 'center',
    flex: 1,
    textAlign: 'center',
  },
  answerZoneCorrect: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CORRECT_BORDER,
    backgroundColor: CORRECT_BG,
    marginBottom: 12,
  },
  correctAnswerBlock: { marginBottom: 16 },
  correctAnswerLabel: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 11,
    fontFamily: 'IBMPlexSans-SemiBold',
    letterSpacing: 0.3,
    marginBottom: 8,
  },

  // ── Shared chip (pill) ─────────────────────────────────────────────────────
  chip: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
  },
  chipPlaced: {
    borderColor: PROFESSIONAL_COLORS.accent,
    backgroundColor: 'rgba(124,107,255,0.18)',
  },
  chipBank: {
    borderColor: 'rgba(255, 122, 69, 0.55)',
    backgroundColor: PROFESSIONAL_COLORS.bgMedium,
  },
  chipText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 15,
    fontFamily: 'IBMPlexSans-SemiBold',
  },

  // ── Word bank — no container, just floating pills ─────────────────────────
  bankDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 18,
    marginBottom: 16,
  },
  wordBank: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
    marginTop: 2,
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: PROFESSIONAL_COLORS.secondary,
    backgroundColor: 'rgba(255, 122, 69, 0.08)',
  },

  // ── Fill blank option grid ─────────────────────────────────────────────────
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  optionChip: {
    flexBasis: '47%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: PROFESSIONAL_COLORS.bgMedium,
  },
  optionChipSelected: {
    borderColor: PROFESSIONAL_COLORS.accent,
    backgroundColor: 'rgba(124,107,255,0.18)',
  },
  optionFeedbackCorrect: {
    borderColor: CORRECT_BORDER,
    backgroundColor: CORRECT_BG,
  },
  optionFeedbackWrong: {
    borderColor: WRONG_BORDER,
    backgroundColor: WRONG_BG,
  },
  optionChipText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 16,
    fontFamily: 'IBMPlexSans-SemiBold',
    textAlign: 'center',
  },
  optionChipTextSelected: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontFamily: 'Montserrat-SemiBold',
  },

  // ── MCQ options ────────────────────────────────────────────────────────────
  mcqOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: PROFESSIONAL_COLORS.bgMedium,
    marginBottom: 10,
    gap: 14,
  },
  mcqOptionSelected: {
    borderColor: PROFESSIONAL_COLORS.accent,
    backgroundColor: 'rgba(124,107,255,0.12)',
  },
  mcqOptionFeedbackCorrect: {
    borderColor: CORRECT_BORDER,
    backgroundColor: CORRECT_BG,
  },
  mcqOptionFeedbackWrong: {
    borderColor: WRONG_BORDER,
    backgroundColor: WRONG_BG,
  },
  mcqLetter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mcqLetterSelected: {
    backgroundColor: PROFESSIONAL_COLORS.accent,
    borderColor: PROFESSIONAL_COLORS.accent,
  },
  mcqLetterText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Bold',
  },
  mcqLetterTextSelected: { color: '#FFFFFF' },
  mcqOptionText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 16,
    fontFamily: 'IBMPlexSans-Medium',
    flex: 1,
  },

  feedbackBlock: { marginTop: 20, gap: 14 },
  feedbackStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    gap: 10,
  },
  feedbackStripCorrect: {
    backgroundColor: CORRECT_BG,
    borderColor: CORRECT_BORDER,
  },
  feedbackStripWrong: {
    backgroundColor: WRONG_BG,
    borderColor: WRONG_BORDER,
  },
  feedbackEmoji: {
    fontSize: 18,
    fontFamily: 'IBMPlexSans-SemiBold',
    color: PROFESSIONAL_COLORS.textPrimary,
  },
  feedbackText: {
    fontSize: 14,
    fontFamily: 'IBMPlexSans-Medium',
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    marginRight: 8,
  },
  backButtonText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 14,
    fontFamily: 'IBMPlexSans-Medium',
  },
  checkButton: {
    marginTop: 32,
    backgroundColor: PROFESSIONAL_COLORS.secondary,
    borderRadius: 16,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    backgroundColor: PROFESSIONAL_COLORS.secondary,
    borderRadius: 16,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonDisabled: { backgroundColor: PROFESSIONAL_COLORS.bgLight },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat-SemiBold',
  },
  // ── Drag-and-drop ──────────────────────────────────────────────────────
  chipGhost: {
    opacity: 0.25,
  },
  chipDragging: {
    borderColor: PROFESSIONAL_COLORS.accent,
    backgroundColor: PROFESSIONAL_COLORS.accent,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  dropGap: {
    width: 3,
    height: 40,
    borderRadius: 2,
    backgroundColor: PROFESSIONAL_COLORS.accent,
    alignSelf: 'center',
    marginHorizontal: 2,
  },
});
