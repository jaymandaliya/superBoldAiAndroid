import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_TOKEN_KEY, PERMISSION_SHOWN_KEY } from '../constants';
import { CrashlyticsHelper } from './CrashlyticsHelper';
import { OnboardingProfile, UserPath } from '../types';

// Storage keys
const LANGUAGE_CONTEXT_KEY = '@language_context';
const APP_LANGUAGE_KEY = '@app_language';
const LEARNING_COMPLETION_PREFIX = '@learning_completed_';
const ONBOARDING_PROFILE_PREFIX = '@onboarding_profile_';
const USER_PATH_PREFIX = '@user_path_';
const USER_AGE_PREFIX = '@user_age_';

// ============================================
// Auth Storage Helper with Language Persistence
// ============================================
export const AuthStorage = {
  async saveToken(token: string) {
    try {
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
      CrashlyticsHelper.log('Auth token saved');
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.saveToken');
    }
  },
  
  async getToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.getToken');
      return null;
    }
  },
  
  async clearAuth() {
    try {
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(APP_LANGUAGE_KEY); // Reset app language to English
      await AsyncStorage.removeItem(LANGUAGE_CONTEXT_KEY); // Clear language context
      CrashlyticsHelper.log('Auth and language context cleared');
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.clearAuth');
    }
  },

  async hasShownPermissionScreen(): Promise<boolean> {
    try {
      const shown = await AsyncStorage.getItem(PERMISSION_SHOWN_KEY);
      return shown === 'true';
    } catch (error) {
      return false;
    }
  },

  async setPermissionScreenShown() {
    try {
      await AsyncStorage.setItem(PERMISSION_SHOWN_KEY, 'true');
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.setPermissionScreenShown');
    }
  },

  // ============================================
  // NEW: Language Context Persistence
  // ============================================
  
  /**
   * Save language selection for this user only (avoids leaking prefs across accounts).
   */
  async saveLanguageContext(nativeLanguage: string, targetLanguage: string, userId?: string) {
    try {
      const context = {
        nativeLanguage,
        targetLanguage,
        userId: userId ?? null,
        timestamp: new Date().toISOString(),
      };
      await AsyncStorage.setItem(LANGUAGE_CONTEXT_KEY, JSON.stringify(context));
      CrashlyticsHelper.log(
        `Language context saved: ${nativeLanguage} → ${targetLanguage}${userId ? ` (user ${userId})` : ''}`,
      );
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.saveLanguageContext');
    }
  },

  /**
   * Get saved language context. Prefer validating with forUserId so another account
   * on the same device does not inherit the previous user's pair.
   */
  async getLanguageContext(forUserId?: string): Promise<{
    nativeLanguage: string;
    targetLanguage: string;
    userId: string | null;
  } | null> {
    try {
      const contextStr = await AsyncStorage.getItem(LANGUAGE_CONTEXT_KEY);
      if (!contextStr) {
        return null;
      }
      const context = JSON.parse(contextStr);
      const storedUserId =
        typeof context.userId === 'string' && context.userId.length > 0 ? context.userId : null;

      if (forUserId != null && forUserId !== '' && storedUserId !== forUserId) {
        CrashlyticsHelper.log(
          `Language context ignored: stored user ${storedUserId ?? 'none'} !== current ${forUserId}`,
        );
        return null;
      }

      if (forUserId != null && forUserId !== '' && storedUserId == null) {
        // Legacy payload (no userId) — do not apply to a logged-in user.
        CrashlyticsHelper.log('Language context ignored: legacy entry without userId');
        return null;
      }

      CrashlyticsHelper.log(`Language context retrieved: ${context.nativeLanguage} → ${context.targetLanguage}`);
      return {
        nativeLanguage: context.nativeLanguage,
        targetLanguage: context.targetLanguage,
        userId: storedUserId,
      };
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.getLanguageContext');
      return null;
    }
  },

  /**
   * Clear language context (useful for complete reset)
   */
  async clearLanguageContext() {
    try {
      await AsyncStorage.removeItem(LANGUAGE_CONTEXT_KEY);
      CrashlyticsHelper.log('Language context cleared');
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.clearLanguageContext');
    }
  },

  async saveAppLanguage(languageCode: string) {
    try {
      await AsyncStorage.setItem(APP_LANGUAGE_KEY, languageCode);
      CrashlyticsHelper.log(`App language saved: ${languageCode}`);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.saveAppLanguage');
    }
  },

  async getAppLanguage(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(APP_LANGUAGE_KEY);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.getAppLanguage');
      return null;
    }
  },

  getOnboardingProfileKey(userId: string) {
    return `${ONBOARDING_PROFILE_PREFIX}${userId}`;
  },

  async saveOnboardingProfile(userId: string, profile: OnboardingProfile) {
    try {
      await AsyncStorage.setItem(this.getOnboardingProfileKey(userId), JSON.stringify(profile));
      CrashlyticsHelper.log(`Onboarding profile saved for user ${userId}`);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.saveOnboardingProfile');
    }
  },

  async getOnboardingProfile(userId: string): Promise<OnboardingProfile | null> {
    try {
      const raw = await AsyncStorage.getItem(this.getOnboardingProfileKey(userId));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed?.goal || !parsed?.skillLevel) {
        return null;
      }

      return {
        goal: parsed.goal,
        skillLevel: parsed.skillLevel,
        goalLabel: parsed.goalLabel,
        skillLabel: parsed.skillLabel,
        skillDescription: parsed.skillDescription,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.getOnboardingProfile');
      return null;
    }
  },

  async clearOnboardingProfile(userId: string) {
    try {
      await AsyncStorage.removeItem(this.getOnboardingProfileKey(userId));
      CrashlyticsHelper.log(`Onboarding profile cleared for user ${userId}`);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.clearOnboardingProfile');
    }
  },

  // ── User Path (learn | chat) ─────────────────────────────────────────────
  async saveUserPath(userId: string, path: UserPath) {
    try {
      await AsyncStorage.setItem(`${USER_PATH_PREFIX}${userId}`, path);
      CrashlyticsHelper.log(`User path saved: ${path} for user ${userId}`);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.saveUserPath');
    }
  },

  async getUserPath(userId: string): Promise<UserPath | null> {
    try {
      const value = await AsyncStorage.getItem(`${USER_PATH_PREFIX}${userId}`);
      if (value === 'learn' || value === 'chat') return value;
      return null;
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.getUserPath');
      return null;
    }
  },

  async clearUserPath(userId: string) {
    try {
      await AsyncStorage.removeItem(`${USER_PATH_PREFIX}${userId}`);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.clearUserPath');
    }
  },

  async saveUserAge(userId: string, age: number) {
    try {
      await AsyncStorage.setItem(`${USER_AGE_PREFIX}${userId}`, String(age));
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.saveUserAge');
    }
  },

  async getUserAge(userId: string): Promise<number | null> {
    try {
      const val = await AsyncStorage.getItem(`${USER_AGE_PREFIX}${userId}`);
      if (val === null) return null;
      const n = parseInt(val, 10);
      return isNaN(n) ? null : n;
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.getUserAge');
      return null;
    }
  },

  getLearningCompletionKey(learningId: string) {
    return `${LEARNING_COMPLETION_PREFIX}${learningId}`;
  },

  async markLearningCompleted(learningId: string) {
    try {
      await AsyncStorage.setItem(this.getLearningCompletionKey(learningId), 'true');
      CrashlyticsHelper.log(`Learning marked completed: ${learningId}`);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.markLearningCompleted');
    }
  },

  async isLearningCompleted(learningId: string): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(this.getLearningCompletionKey(learningId))) === 'true';
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'AuthStorage.isLearningCompleted');
      return false;
    }
  },

  async normalizeCompletedLearning<T extends { id: string; current_level: number }>(learning: T | null) {
    if (!learning) return null;
    if (learning.current_level > 30) return learning;

    const isCompleted = await this.isLearningCompleted(String(learning.id));
    if (!isCompleted) return learning;

    return {
      ...learning,
      current_level: 31,
    };
  },
};