import React, { useState, useEffect } from 'react';
import { PermissionsAndroid, Platform, Linking, TouchableOpacity } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AuthorizationStatus } from '@notifee/react-native';
import { AppNavigator } from './navigation';
import { RootStackParamList } from './navigation/types';
import { AUTH_URL, BASE_URL } from './constants';
import {
  CrashlyticsHelper,
  NetworkHelper,
  AuthStorage,
  NotificationHelper,
  checkAppVersion,
  AppVersionCheckResult,
  AudioHelper,
} from './helpers';
import { SoftUpdateModal, NotificationPermissionModal } from './components';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView, View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS, FONTS } from './constants';
import { User, Learning } from './types';
import { I18nProvider } from './localization';

// Same version source the backend's /api/app-version compares against build.gradle's
// versionName for the Play Store listing — package.json's version must be bumped in
// lockstep with versionName on every release or this check false-positives (it did:
// package.json was stuck at 1.0.0 while versionName had moved to 1.34).
const APP_VERSION = require('../package.json').version as string;

const IOS_STORE_URL = 'https://apps.apple.com/';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.scaleulearn.aii&hl=en_IN';

const openStoreUrl = (updateUrl?: string) => {
  const fallbackUrl = Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL;
  Linking.openURL(updateUrl || fallbackUrl).catch((error) => {
    CrashlyticsHelper.recordError(error as Error, 'openUpdateUrl');
  });
};

interface InitialRouteData {
  routeName: keyof RootStackParamList;
  user?: User;
  learning?: Learning | null;
  initialStep?: 1 | 2 | 3;
}

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initialRouteData, setInitialRouteData] = useState<InitialRouteData>({
    routeName: 'Login',
  });
  const [isConnected, setIsConnected] = useState(true);
  const [hardUpdateInfo, setHardUpdateInfo] = useState<AppVersionCheckResult | null>(null);
  const [softUpdateInfo, setSoftUpdateInfo] = useState<AppVersionCheckResult | null>(null);
  const [showNotificationPermissionModal, setShowNotificationPermissionModal] = useState(false);
  const [notificationPermissionAlreadyDenied, setNotificationPermissionAlreadyDenied] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      setIsConnected(connected);
      CrashlyticsHelper.log(`Network state changed: ${connected ? 'connected' : 'disconnected'}`);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    initializeApp();
  }, []);

  // Setup notification handlers (foreground)
  useEffect(() => {
    // Foreground message handler - shows notification when app is open
    const unsubscribeMessage = NotificationHelper.setupForegroundHandler();

    // Foreground event handler - handles notification press/dismiss when app is open
    const unsubscribeEvent = NotificationHelper.setupForegroundEventHandler();

    // Check if app was opened from notification
    NotificationHelper.getInitialNotification().then((remoteMessage) => {
      if (remoteMessage) {
        console.log('[App] Opened from notification:', remoteMessage.data);
        // Handle navigation based on notification data if needed
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeEvent();
    };
  }, []);

  const initializeApp = async () => {
    CrashlyticsHelper.log('App initializing');
    
    try {
      // Check if permission screen has been shown
      const hasShownPermissions = await AuthStorage.hasShownPermissionScreen();
      if (!hasShownPermissions) {
        setInitialRouteData({ routeName: 'PermissionOnboarding' });
        setIsInitializing(false);
        return;
      }

      // Setup audio
      await setupAudio();

      // Check network connectivity
      const isOnline = await NetworkHelper.checkConnection();
      if (!isOnline) {
        setInitialRouteData({ routeName: 'NoInternet' });
        setIsInitializing(false);
        return;
      }

      try {
        const updateInfo = await checkAppVersion(BASE_URL, Platform.OS, APP_VERSION);
        if (updateInfo?.tier === 'hard') {
          CrashlyticsHelper.log(
            `Hard update required. current=${APP_VERSION}, min=${updateInfo.minimumVersion}`
          );
          setHardUpdateInfo(updateInfo);
          setIsInitializing(false);
          return;
        }
        if (updateInfo?.tier === 'soft') {
          const dismissedVersion = await AuthStorage.getDismissedUpdateVersion();
          if (dismissedVersion !== updateInfo.latestVersion) {
            setSoftUpdateInfo(updateInfo);
          }
        }
      } catch (error) {
        CrashlyticsHelper.recordError(error as Error, 'versionCheck');
      }

      // Check existing auth
      const savedToken = await AuthStorage.getToken();
      if (savedToken) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          const response = await fetch(`${AUTH_URL}/me`, {
            headers: { 'Authorization': `Bearer ${savedToken}` },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);

          if (response.ok) {

            const data = await response.json();
            // /me now returns learnings[] array; fall back to singular data.learning for compatibility
            const learningsArray: Learning[] = data.learnings ?? (data.learning ? [data.learning] : []);
            const activeLearningRaw = learningsArray.find((l: Learning) => l.is_active) ?? learningsArray[0] ?? null;
            const normalizedLearning = await AuthStorage.normalizeCompletedLearning(activeLearningRaw);
            const savedLanguageContext = await AuthStorage.getLanguageContext(String(data.user.id));

            const hasLanguages = Boolean(
              normalizedLearning?.native_language && normalizedLearning?.target_language
            ) || Boolean(savedLanguageContext);
            const hasName = Boolean(data.user?.name);

            const selectedUILanguage =
              normalizedLearning?.native_language || savedLanguageContext?.nativeLanguage || null;
            if (selectedUILanguage) {
              await AuthStorage.saveAppLanguage(selectedUILanguage);
            }
            CrashlyticsHelper.setUserId(String(data.user.id));
            CrashlyticsHelper.log('Auth restored');

            // Initialize push notifications after auth
            NotificationHelper.initialize();

            let routeName: keyof RootStackParamList;
            let initialStep: 1 | 2 | 3 | undefined;
            if (hasName) {
              // user.name comes from the backend — reliable signal that onboarding was completed.
              // Avoids re-routing returning users through onboarding after reinstall (iOS Keychain
              // keeps the token alive even though AsyncStorage / onboardingProfile is wiped).
              routeName = 'MainTabs';
            } else if (!hasLanguages) {
              routeName = 'LanguageSelection';
            } else {
              routeName = 'UserNameCapture';
              initialStep = 1;
            }

            setInitialRouteData({
              routeName,
              user: data.user,
              learning: normalizedLearning,
              initialStep,
            });
          } else {
            await AuthStorage.clearAuth();
            CrashlyticsHelper.log('Auth token invalid, cleared');
            setInitialRouteData({ routeName: 'Login' });
          }
        } catch (error) {
          CrashlyticsHelper.recordError(error as Error, 'checkExistingAuth');
          setInitialRouteData({ routeName: 'Login' });
        }
      } else {
        setInitialRouteData({ routeName: 'Login' });
      }
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'initializeApp');
      setInitialRouteData({ routeName: 'Login' });
    } finally {
      setIsInitializing(false);
      checkNotificationPermission();
    }
  };

  /**
   * Shown on every cold start once the user still hasn't granted notification
   * permission — but NOT the very first time. The first ask stays the existing
   * silent native prompt (NotificationHelper.initialize() after login); this
   * modal only kicks in on a later app open if that first ask was declined
   * (or otherwise still isn't granted), since re-prompting natively isn't
   * possible at that point and the user needs a nudge toward Settings.
   */
  const checkNotificationPermission = async () => {
    try {
      const alreadyAttempted = await NotificationHelper.hasAttemptedPermissionRequest();
      if (!alreadyAttempted) {
        // Never asked yet this install — let the existing silent post-login
        // request run its course, don't double up with this modal.
        setShowNotificationPermissionModal(false);
        return;
      }

      const status = await NotificationHelper.getPermissionStatus();
      const granted = status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
      if (granted) {
        setShowNotificationPermissionModal(false);
        return;
      }

      setNotificationPermissionAlreadyDenied(true);
      setShowNotificationPermissionModal(true);
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'checkNotificationPermission');
    }
  };

  const handleAllowNotifications = async () => {
    const granted = await NotificationHelper.requestPermission();
    if (granted) {
      setShowNotificationPermissionModal(false);
      // Token save + channel setup normally only run via NotificationHelper.initialize()
      // post-login; harmless (and useful) to also run it here if the user is already logged in.
      NotificationHelper.initialize();
    } else {
      setNotificationPermissionAlreadyDenied(true);
    }
  };

  const setupAudio = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      if (!granted) {
        // Audio session must be configured AFTER RECORD_AUDIO is granted,
        // otherwise Android can't apply speaker routing for the communication
        // audio mode. PermissionOnboardingScreen will call AudioHelper.setupAudio
        // once the user grants permission.
        CrashlyticsHelper.log('Skipping audio setup: RECORD_AUDIO not yet granted');
        return;
      }
    }
    await AudioHelper.setupAudio();
  };

  if (isInitializing) {
    return (
      <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (hardUpdateInfo) {
    return (
      <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerContent}>
            <Text style={styles.updateTitle}>Update Required</Text>
            <Text style={styles.updateText}>{hardUpdateInfo.message}</Text>
            <Text style={styles.updateMeta}>Current: v{APP_VERSION}</Text>
            <Text style={styles.updateMeta}>Minimum: v{hardUpdateInfo.minimumVersion}</Text>
            <Text style={styles.updateMeta}>Latest: v{hardUpdateInfo.latestVersion}</Text>

            <TouchableOpacity
              style={styles.updateButton}
              onPress={() => openStoreUrl(hardUpdateInfo.updateUrl)}
            >
              <Text style={styles.updateButtonText}>Update App</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <I18nProvider>
      <SafeAreaProvider>
        <AppNavigator
          initialRouteName={initialRouteData.routeName}
          initialUser={initialRouteData.user}
          initialLearning={initialRouteData.learning}
          initialStep={initialRouteData.initialStep}
          isConnected={isConnected}
        />
        {softUpdateInfo && (
          <SoftUpdateModal
            visible
            latestVersion={softUpdateInfo.latestVersion}
            message={softUpdateInfo.message}
            onUpdate={() => openStoreUrl(softUpdateInfo.updateUrl)}
            onLater={async () => {
              await AuthStorage.setDismissedUpdateVersion(softUpdateInfo.latestVersion);
              setSoftUpdateInfo(null);
            }}
          />
        )}
        <NotificationPermissionModal
          visible={showNotificationPermissionModal}
          alreadyDenied={notificationPermissionAlreadyDenied}
          onAllow={handleAllowNotifications}
          onOpenSettings={() => {
            Linking.openSettings();
            setShowNotificationPermissionModal(false);
          }}
          onDismiss={() => setShowNotificationPermissionModal(false)}
        />
      </SafeAreaProvider>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  updateTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontFamily: FONTS.bold,
    marginBottom: 14,
  },
  updateText: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontFamily: FONTS.medium,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  updateMeta: {
    color: COLORS.textDim,
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginBottom: 4,
  },
  updateButton: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  updateButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
});