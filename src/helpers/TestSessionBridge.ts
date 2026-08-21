import type { TestQuestion, TestReport } from '../screens/room/components/TestOverlay';

type AnswerFn = (questionId: string, selectedIndex: number, selectedOrder?: number[]) => void;
type VoidFn = () => void;

interface BridgeState {
  isActive: boolean;
  checkpoint: number;
  currentQuestion: TestQuestion | null;
  questionNumber: number;
  totalQuestions: number;
}

const state: BridgeState = {
  isActive: false,
  checkpoint: 1,
  currentQuestion: null,
  questionNumber: 0,
  totalQuestions: 10,
};

let _onAnswer: AnswerFn | null = null;
let _onTimeout: VoidFn | null = null;
let _onBack: VoidFn | null = null;

const stateListeners = new Set<VoidFn>();
const completeListeners = new Set<(report: TestReport) => void>();

function notifyState() {
  stateListeners.forEach(fn => fn());
}

export const TestSessionBridge = {
  getState(): Readonly<BridgeState> {
    return { ...state };
  },

  setup(params: {
    checkpoint: number;
    onAnswer: AnswerFn;
    onTimeout: VoidFn;
    onBack: VoidFn;
  }) {
    state.isActive = true;
    state.checkpoint = params.checkpoint;
    state.currentQuestion = null;
    state.questionNumber = 0;
    state.totalQuestions = 10;
    _onAnswer = params.onAnswer;
    _onTimeout = params.onTimeout;
    _onBack = params.onBack;
    notifyState();
  },

  update(data: Partial<Pick<BridgeState, 'currentQuestion' | 'questionNumber' | 'totalQuestions'>>) {
    if (data.currentQuestion !== undefined) { state.currentQuestion = data.currentQuestion; }
    if (data.questionNumber !== undefined) { state.questionNumber = data.questionNumber; }
    if (data.totalQuestions !== undefined) { state.totalQuestions = data.totalQuestions; }
    notifyState();
  },

  notifyComplete(report: TestReport) {
    completeListeners.forEach(fn => fn(report));
  },

  clear() {
    state.isActive = false;
    state.currentQuestion = null;
    state.questionNumber = 0;
    _onAnswer = null;
    _onTimeout = null;
    _onBack = null;
    notifyState();
  },

  answer(questionId: string, selectedIndex: number, selectedOrder?: number[]) {
    _onAnswer?.(questionId, selectedIndex, selectedOrder);
  },

  timeout() {
    _onTimeout?.();
  },

  back() {
    _onBack?.();
  },

  subscribeState(fn: VoidFn): () => void {
    stateListeners.add(fn);
    return () => { stateListeners.delete(fn); };
  },

  subscribeComplete(fn: (report: TestReport) => void): () => void {
    completeListeners.add(fn);
    return () => { completeListeners.delete(fn); };
  },
};
