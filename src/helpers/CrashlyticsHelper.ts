import crashlytics from '@react-native-firebase/crashlytics';

// ============================================
// CRASHLYTICS HELPER
// ============================================
export const CrashlyticsHelper = {
  log(message: string) {
    try {
      crashlytics().log(message);
    } catch (e) {
      // no-op
    }
  },

  recordError(error: Error, context?: string) {
    try {
      if (context) {
        crashlytics().log(`Context: ${context}`);
      }
      crashlytics().recordError(error);
      console.error(`[Crashlytics Error] ${context || 'Unknown'}: ${error.message}`);
    } catch (e) {
      console.error(`[Error] ${context || 'Unknown'}: ${error.message}`);
    }
  },

  setUserId(userId: string) {
    try {
      crashlytics().setUserId(userId);
    } catch (e) {
      console.log(`[SetUserId] ${userId}`);
    }
  },

  setAttribute(key: string, value: string) {
    try {
      crashlytics().setAttribute(key, value);
    } catch (e) {
      console.log(`[SetAttribute] ${key}: ${value}`);
    }
  },
};