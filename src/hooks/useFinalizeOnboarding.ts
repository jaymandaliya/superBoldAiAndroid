import { useState } from 'react';
import Toast from 'react-native-simple-toast';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { AUTH_URL, LEARNING_URL, BACKEND_URL, YOUR_COMPUTER_IP, CONNECTION_TIMEOUT } from '../constants';
import { LANGUAGES } from '../constants/languages';
import { CrashlyticsHelper, AuthStorage, NetworkHelper, hasPaidAccess } from '../helpers';
import { useI18n } from '../localization';
import { User, Learning, OnboardingGoal, OnboardingSkillLevel } from '../types';

type FinalizeArgs = {
  user: User;
  existingLearning?: Learning | null;
  name: string;
  age: number | null;
  isYoungKid: boolean;
  goal?: OnboardingGoal | null;
  skillLevel?: OnboardingSkillLevel | null;
  goalLabel?: string;
  skillLabel?: string;
  skillDescription?: string;
};

/**
 * The "learn" path's final save step, shared by whichever screen ends the flow —
 * SkillLevelScreen normally, or AgeCaptureScreen directly for a young-kid profile
 * (which skips the goal/skill screens entirely). Saves the profile + learning
 * record, tries a direct room connect, then navigates onward. Mirrors iOS's
 * useFinalizeOnboarding, with Cashfree standing in for StoreKit on Android.
 */
export function useFinalizeOnboarding(navigation: NativeStackNavigationProp<RootStackParamList>) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const finalize = async (args: FinalizeArgs) => {
    const { user, existingLearning, age, isYoungKid, goal, skillLevel, goalLabel, skillLabel, skillDescription } = args;
    const trimmedName = args.name.trim();

    if (!trimmedName)                    { Toast.show(t('username_enter_name_toast'), Toast.SHORT); return; }
    if (trimmedName.length < 2)          { Toast.show(t('username_name_too_short_toast'), Toast.SHORT); return; }
    if (age === null)                    { Toast.show(t('username_select_age_toast'), Toast.SHORT); return; }
    if (!isYoungKid && !goal)            { Toast.show(t('username_choose_goal_toast'), Toast.SHORT); return; }
    if (!isYoungKid && !skillLevel)      { Toast.show(t('username_choose_level_toast'), Toast.SHORT); return; }

    setLoading(true);
    CrashlyticsHelper.log(`Saving user name: ${trimmedName}`);

    try {
      const token = await AuthStorage.getToken();

      const primaryPayload: Record<string, any> = { name: trimmedName };
      if (!isYoungKid) {
        primaryPayload.skill             = skillLabel;
        primaryPayload.skill_key         = skillLevel;
        primaryPayload.skill_description = skillDescription;
        if (goalLabel) {
          primaryPayload.learning_reason     = goalLabel;
          primaryPayload.learning_reason_key = goal;
        }
      }

      let response = await fetch(`${AUTH_URL}/update-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(primaryPayload),
      });

      if (!response.ok && (response.status === 400 || response.status === 422)) {
        response = await fetch(`${AUTH_URL}/update-profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: trimmedName, skill: skillLevel, learning_reason: goal }),
        });
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('username_save_failed_toast'));

      CrashlyticsHelper.setAttribute('user_name', trimmedName);

      if (!isYoungKid && skillLevel) {
        await AuthStorage.saveOnboardingProfile(String(user.id), {
          goal: goal ?? 'confidence',
          skillLevel,
          goalLabel,
          skillLabel: skillLabel ?? undefined,
          skillDescription,
          updatedAt: new Date().toISOString(),
        });
      }

      if (data.token) await AuthStorage.saveToken(data.token);

      const activeToken = data.token ?? token;
      if (existingLearning?.id) {
        try {
          const learningPayload: Record<string, any> = {
            ...(age !== null ? { age } : {}),
            ...(!isYoungKid && skillLevel ? { skill: skillLevel } : {}),
            ...(!isYoungKid && goal       ? { learning_reason: goal } : {}),
          };
          const learningRes = await fetch(`${LEARNING_URL}/${existingLearning.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
            body: JSON.stringify(learningPayload),
          });
          await learningRes.json();
        } catch (e) {
          CrashlyticsHelper.recordError(e as Error, 'updateLearningSkillReason');
        }
      }

      if (age !== null) await AuthStorage.saveUserAge(String(user.id), age);
      await AuthStorage.saveUserPath(String(user.id), 'learn');
      Toast.show(t('username_saved_toast'), Toast.SHORT);

      const updatedUser = { ...user, name: trimmedName };

      // Paywall is the last step of onboarding — shown here, once profile setup
      // is actually complete, not mid-flow. Covers both exits from this shared
      // finalize step: SkillLevelScreen's normal step 4, and AgeCaptureScreen's
      // young-kid early exit (age < 13 skips goal/skill entirely). Paid users
      // fall through to the exact same room-connect/MainTabs logic as before.
      if (!hasPaidAccess(existingLearning)) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Paywall', params: { user: updatedUser, existingLearning, name: trimmedName, nextStep: 'LanguageSelection' } }],
        });
        return;
      }

      // Try to connect directly to room if we have a full learning record
      if (existingLearning?.id && existingLearning.native_language && existingLearning.target_language) {
        try {
          const isOnline = await NetworkHelper.checkConnection();
          if (isOnline) {
            const nativeLang = LANGUAGES.find(l => l.code === existingLearning.native_language);
            const targetLang = LANGUAGES.find(l => l.code === existingLearning.target_language);
            const roomToken = await AuthStorage.getToken();
            const onboardingCtx = await AuthStorage.getOnboardingProfile(String(user.id));

            if (roomToken) {
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), CONNECTION_TIMEOUT)
              );
              const res = await Promise.race([
                fetch(BACKEND_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    roomName: `language-learning-room${Date.now()}`,
                    participantName: updatedUser.phone_number || 'User_' + Date.now(),
                    nativeLanguage: existingLearning.native_language,
                    targetLanguage: existingLearning.target_language,
                    nativeLanguageName: nativeLang?.name || '',
                    targetLanguageName: targetLang?.name || '',
                    currentLevel: existingLearning.current_level ?? 0,
                    learningId: String(existingLearning.id),
                    userName: trimmedName,
                    authToken: roomToken,
                    isPremium: existingLearning.is_premium || false,
                  }),
                }),
                timeoutPromise,
              ]);

              let roomData: any = {};
              try { roomData = await res.json(); } catch { /* ignore */ }

              if (res.ok && roomData.url) {
                const roomUrl = roomData.url.includes('localhost')
                  ? roomData.url.replace('localhost', YOUR_COMPUTER_IP)
                  : roomData.url;

                navigation.reset({
                  index: 1,
                  routes: [
                    { name: 'MainTabs', params: { user: updatedUser, existingLearning } },
                    { name: 'Room', params: { user: updatedUser, learning: existingLearning, token: roomData.token, url: roomUrl, onboardingContext: onboardingCtx } },
                  ],
                });
                return;
              }
            }
          }
        } catch (e) {
          CrashlyticsHelper.recordError(e as Error, 'UserNameCapture.connectToRoom');
        }
      }

      // Fallback: go to home dashboard
      navigation.replace('MainTabs', { user: updatedUser, existingLearning });
    } catch (error: any) {
      CrashlyticsHelper.recordError(error as Error, 'handleSaveName');
      Toast.show(error.message || t('username_save_failed_toast'), Toast.LONG);
    } finally {
      setLoading(false);
    }
  };

  return { finalize, loading };
}
