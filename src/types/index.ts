// ============================================
// Type Definitions for SuperBold App
// ============================================

export interface User {
  id: string;
  phone_number: string;
  name?: string | null;
  age?: number | null;
  is_new_user?: boolean;
  is_premium?: boolean;
}

export interface Learning {
  id: string;
  user_id: string;
  native_language: string;
  target_language: string;
  current_level: number;
  total_sessions: number;
  total_practice_time: number;
  last_session_at?: string | null;
  is_premium?: boolean;
  premium_activated_at?: string | null;
  purchased_tiers?: string[];  // Array of purchased tier keys: ['levels_1_5', 'levels_6_10', etc.]
  is_new?: boolean;
  skill?: string | null;
  learning_reason?: string | null;
  is_active?: boolean;
  pending_test_checkpoint?: number | null;
}

export type OnboardingGoal = 'travel' | 'career' | 'fluency' | 'confidence';
export type OnboardingSkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type UserPath = 'learn' | 'chat';

export interface OnboardingProfile {
  goal: OnboardingGoal;
  skillLevel: OnboardingSkillLevel;
  goalLabel?: string;
  skillLabel?: string;
  skillDescription?: string;
  updatedAt: string;
}

// Payment tier types
export type PaymentTierKey =
  | 'levels_1_5'
  | 'levels_6_10'
  | 'levels_11_15'
  | 'levels_16_20'
  | 'levels_21_25'
  | 'levels_26_30'
  | 'all_30_levels';

export interface PaymentTier {
  key: PaymentTierKey;
  displayName: string;
  levels: string;
  levelStart: number;
  levelEnd: number;
  amount: string;
  description: string;
}

export interface Language {
  code: string;
  name: string;
  flag: string;
  englishName?: string;
}

export interface Country {
  /** ISO 3166-1 alpha-2 code, e.g. "IN" */
  code: string;
  name: string;
  flag: string;
  /** E.164 dial code including the leading "+", e.g. "+91" */
  dialCode: string;
}

export interface ConversationMessage {
  id?: string;  // Unique identifier for the message
  role: 'user' | 'ai' | 'system';
  text: string;
  timestamp: Date | string;
  isInterim?: boolean;  // Indicates if this is an interim message (e.g., during speech recognition)
  isComplete?: boolean;  // Indicates if this message is fully written/spoken
}

export interface SavedConversation {
  id: string;
  learning_id: string;
  user_id: string;
  level: number;
  messages: SavedMessage[];
  message_count: number;
  created_at: string;
}

export interface SavedMessage {
  role: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
}