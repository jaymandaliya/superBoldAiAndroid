import { User, Learning, OnboardingProfile, UserPath, OnboardingGoal } from '../types';

/** Serialized pending level completion for navigation (Room ↔ TestScreen). */
export type PendingLevelCompletionPayload = {
  prevLevel: number;
  newLevel: number;
  topic: string;
  formatted: string;
  crossedIntoUnpurchasedTier: boolean;
  completedCourse: boolean;
  updatedLearning: Learning;
};

export type BottomTabParamList = {
  LearnTab: {
    user: User;
    existingLearning?: Learning | null;
  };
  HistoryTab: {
    user: User;
    existingLearning?: Learning | null;
  };
  ProfileTab: {
    user: User;
    existingLearning?: Learning | null;
  };
};

export type RootStackParamList = {
  PermissionOnboarding: undefined;
  Login: undefined;
  PathChoice: {
    user: User;
    existingLearning?: Learning | null;
  };
  // Step 1 — name only. Chat path saves here directly (never asks age/goal/skill).
  UserNameCapture: {
    user: User;
    existingLearning?: Learning | null;
    pathChoice?: 'learn' | 'chat';
  };
  // Step 2 — age. Young-kid profiles (age < 13) finalize here directly, skipping
  // the goal/skill screens.
  AgeCapture: {
    user: User;
    existingLearning?: Learning | null;
    name: string;
  };
  // Step 3 — learning goal/reason. Reachable directly (skipping UserNameCapture/AgeCapture)
  // when name/age are already known, e.g. adding a second language for an existing user.
  LearningGoal: {
    user: User;
    existingLearning?: Learning | null;
    name: string;
    age: number | null;
  };
  // Step 4 — skill level; finalizes and saves the full onboarding profile.
  SkillLevel: {
    user: User;
    existingLearning?: Learning | null;
    name: string;
    age: number | null;
    goal: OnboardingGoal;
    goalLabel?: string;
  };
  MainTabs: {
    user: User;
    existingLearning?: Learning | null;
  };
  LanguageSelection: {
    user: User;
    existingLearning?: Learning | null;
    onboardingFlow?: boolean;
    gotoPathChoice?: boolean;
    gotoRoom?: boolean;
  };
  Room: {
    user: User;
    learning: Learning;
    token: string;
    url: string;
    onboardingContext?: OnboardingProfile | null;
    accessBlocked?: boolean;
    blockedReason?: string;
    blockedMessage?: string;
    testCompleted?: boolean;
    /** Restored after TestScreen replace so post-test reconnect still runs */
    pendingPostTest?: PendingLevelCompletionPayload;
  };
  ConversationHistory: {
    learningId: string;
    authToken: string;
  };
  NoInternet: undefined;
  ConnectionError: {
    errorMessage?: string;
  };
  Loading: {
    message?: string;
    retryCount?: number;
    showCancel?: boolean;
  };
  ContactSupport: undefined;
  TestScreen: {
    learning: Learning;
    user: User;
    checkpoint: number;
    /** Passed when replacing Room → TestScreen so we can resume after test */
    postTestPending?: PendingLevelCompletionPayload;
  };
  TalkingSession: {
    user: User;
  };
  OnboardingLanguageModal: {
    user: User;
    existingLearning?: Learning | null;
  };
  CashfreeSubscription: {
    user: User;
    existingLearning?: Learning | null;
  };
  // Forced pre-room paywall for non-paying users right after onboarding finishes —
  // mirrors iOS's PaywallScreen, Cashfree standing in for StoreKit on Android.
  Paywall: {
    user: User;
    existingLearning?: Learning | null;
    name: string;
    nextStep: 'TalkingSession' | 'LanguageSelection';
  };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
