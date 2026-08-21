import { User, Learning, OnboardingProfile, UserPath } from '../types';

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
  // In navigation/types.ts — add pathChoice to UserNameCapture params
UserNameCapture: {
  user: User;
  existingLearning?: Learning | null;
  initialStep?: 1 | 2 | 3;
  pathChoice?: 'learn' | 'chat';  // ADD THIS
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
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
