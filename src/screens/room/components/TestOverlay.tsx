import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PROFESSIONAL_COLORS } from '../roomTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestQuestion = {
  question_id: string;
  type: 'jumbled' | 'fill_blank' | 'mcq';
  prompt: string;
  heading?: string;
  words: string[];
  correct_order: number[];
  options: string[];
  correct_index: number;
  level: number;
  topic: string;
};

export type AnswerItem = {
  question_id: string;
  selected_index: number;
  selected_order?: number[];
};

export type TestReport = {
  score: number;
  total: number;
  percentage: number;
  strong_topics: string[];
  weak_topics: string[];
  recommendation: string;
  time_taken_seconds?: number;
  checkpoint?: number;
};

type Props = {
  visible: boolean;
  checkpoint: number;
  currentQuestion: TestQuestion | null;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (questionId: string, selectedIndex: number, selectedOrder?: number[]) => void;
  onTimeout: () => void;
  onBack: () => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_DURATION_SECONDS = 300;

const CORRECT_BG = 'rgba(63, 185, 80, 0.18)';
const CORRECT_BORDER = '#3FB950';
const WRONG_BG = 'rgba(248, 81, 73, 0.18)';
const WRONG_BORDER = '#F85149';

// ─── Question Sub-Components ──────────────────────────────────────────────────

function JumbledQuestion({
  question,
  onAnswer,
  showFeedback,
  isCorrect,
}: {
  question: TestQuestion;
  onAnswer: (order: number[]) => void;
  showFeedback: boolean;
  isCorrect: boolean;
}) {
  const [bank, setBank] = useState<number[]>(() => question.words.map((_, i) => i));
  const [placed, setPlaced] = useState<number[]>([]);

  useEffect(() => {
    setBank(question.words.map((_, i) => i));
    setPlaced([]);
  }, [question.question_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tapBank = (wordIndex: number) => {
    if (showFeedback) return;
    setBank(prev => prev.filter(i => i !== wordIndex));
    const newPlaced = [...placed, wordIndex];
    setPlaced(newPlaced);
    onAnswer(newPlaced);
  };

  const tapPlaced = (wordIndex: number) => {
    if (showFeedback) return;
    const newPlaced = placed.filter(i => i !== wordIndex);
    setPlaced(newPlaced);
    setBank(prev => [...prev, wordIndex]);
    onAnswer(newPlaced);
  };

  const correctWords = question.correct_order.map(i => question.words[i]);

  return (
    <View>
      <Text style={styles.questionPrompt}>{question.prompt}</Text>

      {/* Answer zone */}
      <View
        style={[
          styles.wordRow,
          showFeedback && { borderColor: isCorrect ? CORRECT_BORDER : WRONG_BORDER, backgroundColor: isCorrect ? CORRECT_BG : WRONG_BG },
        ]}>
        {placed.length === 0 ? (
          <Text style={styles.placeholderText}>Tap words below to arrange</Text>
        ) : (
          placed.map((idx, pos) => (
            <TouchableOpacity
              key={`${idx}-${pos}`}
              style={[
                styles.wordChipPlaced,
                showFeedback && {
                  borderColor: isCorrect ? CORRECT_BORDER : WRONG_BORDER,
                  backgroundColor: isCorrect ? CORRECT_BG : WRONG_BG,
                },
              ]}
              onPress={() => tapPlaced(idx)}
              activeOpacity={0.8}>
              <Text style={styles.wordChipText}>{question.words[idx]}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Correct answer (only when wrong) */}
      {showFeedback && !isCorrect && (
        <View style={styles.correctAnswerBlock}>
          <Text style={styles.correctAnswerLabel}>Correct answer:</Text>
          <View style={[styles.wordRow, { borderColor: CORRECT_BORDER, backgroundColor: CORRECT_BG }]}>
            {correctWords.map((w, i) => (
              <View key={i} style={[styles.wordChipPlaced, { borderColor: CORRECT_BORDER }]}>
                <Text style={styles.wordChipText}>{w}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Word bank — hidden during feedback */}
      {!showFeedback && (
        <View style={styles.wordRow}>
          {bank.map(idx => (
            <TouchableOpacity
              key={idx}
              style={styles.wordChipBank}
              onPress={() => tapBank(idx)}
              activeOpacity={0.8}>
              <Text style={styles.wordChipText}>{question.words[idx]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function FillBlankQuestion({
  question,
  selected,
  onAnswer,
  showFeedback,
}: {
  question: TestQuestion;
  selected: number | null;
  onAnswer: (index: number) => void;
  showFeedback: boolean;
}) {
  const chipStyle = (i: number) => {
    if (!showFeedback) return [styles.optionChip, selected === i && styles.optionChipSelected];
    if (i === question.correct_index) return [styles.optionChip, styles.optionFeedbackCorrect];
    if (i === selected) return [styles.optionChip, styles.optionFeedbackWrong];
    return [styles.optionChip];
  };

  const chipTextStyle = (i: number) => {
    if (!showFeedback) return [styles.optionChipText, selected === i && styles.optionChipTextSelected];
    if (i === question.correct_index) return [styles.optionChipText, { color: CORRECT_BORDER, fontFamily: 'IBMPlexSans-SemiBold' }];
    if (i === selected) return [styles.optionChipText, { color: WRONG_BORDER, fontFamily: 'IBMPlexSans-SemiBold' }];
    return [styles.optionChipText, { opacity: 0.4 }];
  };

  return (
    <View>
      <Text style={styles.questionPrompt}>{question.prompt}</Text>
      <View style={styles.optionGrid}>
        {question.options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={chipStyle(i)}
            onPress={() => !showFeedback && onAnswer(i)}
            activeOpacity={0.8}>
            <Text style={chipTextStyle(i)}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function MCQQuestion({
  question,
  selected,
  onAnswer,
  showFeedback,
}: {
  question: TestQuestion;
  selected: number | null;
  onAnswer: (index: number) => void;
  showFeedback: boolean;
}) {
  const letters = ['A', 'B', 'C', 'D'];

  const rowStyle = (i: number) => {
    if (!showFeedback) return [styles.mcqOption, selected === i && styles.mcqOptionSelected];
    if (i === question.correct_index) return [styles.mcqOption, styles.mcqOptionFeedbackCorrect];
    if (i === selected) return [styles.mcqOption, styles.mcqOptionFeedbackWrong];
    return [styles.mcqOption, { opacity: 0.4 }];
  };

  const letterBubbleStyle = (i: number) => {
    if (!showFeedback) return [styles.mcqLetter, selected === i && styles.mcqLetterSelected];
    if (i === question.correct_index) return [styles.mcqLetter, { backgroundColor: CORRECT_BORDER, borderColor: CORRECT_BORDER }];
    if (i === selected) return [styles.mcqLetter, { backgroundColor: WRONG_BORDER, borderColor: WRONG_BORDER }];
    return [styles.mcqLetter];
  };

  const letterTextStyle = (i: number) => {
    if (!showFeedback) return [styles.mcqLetterText, selected === i && styles.mcqLetterTextSelected];
    if (i === question.correct_index || i === selected) return [styles.mcqLetterText, { color: '#FFFFFF' }];
    return [styles.mcqLetterText];
  };

  return (
    <View>
      <Text style={styles.mcqQuestion}>{question.prompt}</Text>
      {question.options.map((opt, i) => (
        <TouchableOpacity
          key={i}
          style={rowStyle(i)}
          onPress={() => !showFeedback && onAnswer(i)}
          activeOpacity={0.8}>
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function TestOverlay({
  visible,
  checkpoint,
  currentQuestion,
  questionNumber,
  totalQuestions,
  onAnswer,
  onTimeout,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const [timeLeft, setTimeLeft] = useState(TEST_DURATION_SECONDS);
  const [timedOut, setTimedOut] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [jumbledOrder, setJumbledOrder] = useState<number[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTimeLeft(TEST_DURATION_SECONDS);
    setTimedOut(false);
  }, [visible]);

  useEffect(() => {
    setSelectedIndex(null);
    setJumbledOrder([]);
    setShowFeedback(false);
    setFeedbackCorrect(false);
  }, [questionNumber]);

  useEffect(() => {
    if (!visible || timedOut) return;
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          setTimedOut(true);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, timedOut]);

  const canProceed = (): boolean => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === 'jumbled') return jumbledOrder.length > 0;
    return selectedIndex !== null && selectedIndex >= 0;
  };

  const checkCorrect = (): boolean => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === 'jumbled') {
      return JSON.stringify(jumbledOrder) === JSON.stringify(currentQuestion.correct_order);
    }
    return selectedIndex === currentQuestion.correct_index;
  };

  const handleCheck = () => {
    if (!currentQuestion || !canProceed()) return;
    setFeedbackCorrect(checkCorrect());
    setShowFeedback(true);
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    if (currentQuestion.type === 'jumbled') {
      onAnswer(currentQuestion.question_id, -1, jumbledOrder);
    } else {
      onAnswer(currentQuestion.question_id, selectedIndex ?? -1);
    }
    setSelectedIndex(null);
    setJumbledOrder([]);
    setShowFeedback(false);
    setFeedbackCorrect(false);
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  const timerUrgent = timeLeft < 60;
  const isLastQuestion = questionNumber === (totalQuestions || 5);

  const isWaiting = !currentQuestion && questionNumber > 0;
  const isConnecting = !currentQuestion && questionNumber === 0;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
            <Text style={styles.backButtonText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {questionNumber > 0 ? `${questionNumber} / ${totalQuestions || 5}` : '– / –'}
            </Text>
          </View>
          <Text style={styles.checkpointLabel}>Checkpoint {checkpoint}</Text>
          <Text style={[styles.timer, timerUrgent && styles.timerUrgent]}>{timerStr}</Text>
        </View>

        {/* Progress bar */}
        {questionNumber > 0 && (
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(questionNumber / (totalQuestions || 5)) * 100}%` },
              ]}
            />
          </View>
        )}

        {isConnecting ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
            <Text style={styles.loadingText}>Connecting to your examiner…</Text>
            <Text style={styles.loadingSubText}>Listen for your first question</Text>
          </View>
        ) : isWaiting ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
            <Text style={styles.loadingText}>Loading next question…</Text>
          </View>
        ) : timedOut && !currentQuestion ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
            <Text style={styles.loadingText}>Calculating your score…</Text>
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
                onAnswer={order => setJumbledOrder(order)}
                showFeedback={showFeedback}
                isCorrect={feedbackCorrect}
              />
            )}
            {currentQuestion.type === 'fill_blank' && (
              <FillBlankQuestion
                question={currentQuestion}
                selected={selectedIndex}
                onAnswer={idx => setSelectedIndex(idx)}
                showFeedback={showFeedback}
              />
            )}
            {currentQuestion.type === 'mcq' && (
              <MCQQuestion
                question={currentQuestion}
                selected={selectedIndex}
                onAnswer={idx => setSelectedIndex(idx)}
                showFeedback={showFeedback}
              />
            )}

            {/* Step 1: Check button — shown until feedback */}
            {!showFeedback && (
              <TouchableOpacity
                style={[styles.checkButton, !canProceed() && styles.nextButtonDisabled]}
                onPress={handleCheck}
                disabled={!canProceed()}
                activeOpacity={0.85}>
                <Text style={styles.nextButtonText}>Check ✓</Text>
              </TouchableOpacity>
            )}

            {/* Step 2: feedback strip + Next button */}
            {showFeedback && (
              <View style={styles.feedbackBlock}>
                <View style={[styles.feedbackStrip, feedbackCorrect ? styles.feedbackStripCorrect : styles.feedbackStripWrong]}>
                  <Text style={[styles.feedbackEmoji]}>{feedbackCorrect ? '✓' : '✗'}</Text>
                  <Text style={[styles.feedbackText, { color: feedbackCorrect ? CORRECT_BORDER : WRONG_BORDER }]}>
                    {feedbackCorrect ? 'Correct!' : 'Not quite — see the correct answer above'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={handleNext}
                  activeOpacity={0.85}>
                  <Text style={styles.nextButtonText}>
                    {isLastQuestion ? 'Submit' : 'Next →'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PROFESSIONAL_COLORS.bgDark,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: PROFESSIONAL_COLORS.border,
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
  timerUrgent: {
    color: PROFESSIONAL_COLORS.error,
  },
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
  scroll: { flex: 1 },
  scrollContent: {
    padding: 22,
    paddingBottom: 40,
  },
  // Type heading
  questionTypeHeading: {
    color: PROFESSIONAL_COLORS.accent,
    fontSize: 12,
    fontFamily: 'IBMPlexSans-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  questionPrompt: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 17,
    fontFamily: 'Montserrat-SemiBold',
    lineHeight: 26,
    marginBottom: 24,
  },
  // Jumbled
  placeholderText: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 13,
    fontFamily: 'IBMPlexSans-Regular',
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  wordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minHeight: 48,
    marginBottom: 16,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgMedium,
  },
  wordChipBank: {
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
  },
  wordChipPlaced: {
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.accent,
  },
  wordChipText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 14,
    fontFamily: 'IBMPlexSans-Medium',
  },
  correctAnswerBlock: {
    marginBottom: 16,
  },
  correctAnswerLabel: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 12,
    fontFamily: 'IBMPlexSans-Regular',
    marginBottom: 6,
  },
  // Fill blank
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    flexBasis: '47%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgMedium,
  },
  optionChipSelected: {
    backgroundColor: PROFESSIONAL_COLORS.secondary,
    borderColor: PROFESSIONAL_COLORS.secondary,
  },
  optionFeedbackCorrect: {
    backgroundColor: CORRECT_BG,
    borderColor: CORRECT_BORDER,
  },
  optionFeedbackWrong: {
    backgroundColor: WRONG_BG,
    borderColor: WRONG_BORDER,
  },
  optionChipText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Medium',
    textAlign: 'center',
  },
  optionChipTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'IBMPlexSans-SemiBold',
  },
  // MCQ
  mcqPhrase: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 20,
    fontFamily: 'Montserrat-SemiBold',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 30,
  },
  mcqQuestion: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 16,
    fontFamily: 'Montserrat-SemiBold',
    marginBottom: 24,
    lineHeight: 24,
  },
  mcqOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    backgroundColor: PROFESSIONAL_COLORS.bgMedium,
    marginBottom: 10,
  },
  mcqOptionSelected: {
    borderColor: PROFESSIONAL_COLORS.success,
    backgroundColor: 'rgba(63, 162, 124, 0.12)',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mcqLetterSelected: {
    backgroundColor: PROFESSIONAL_COLORS.success,
    borderColor: PROFESSIONAL_COLORS.success,
  },
  mcqLetterText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 13,
    fontFamily: 'IBMPlexSans-SemiBold',
  },
  mcqLetterTextSelected: {
    color: '#FFFFFF',
  },
  mcqOptionText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Medium',
    flex: 1,
  },
  // Feedback
  feedbackBlock: {
    marginTop: 20,
    gap: 14,
  },
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
  // Buttons
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
  nextButtonDisabled: {
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat-SemiBold',
  },
});
