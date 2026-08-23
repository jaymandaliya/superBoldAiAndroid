import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidBadgeIconType,
  EventType,
  Event,
  AuthorizationStatus,
} from '@notifee/react-native';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import { AUTH_URL } from '../constants';
import { AuthStorage } from './AuthStorage';
import { CrashlyticsHelper } from './CrashlyticsHelper';

// ============================================
// Push Notification Helper with Notifee
// ============================================

// Default channel ID for notifications
const DEFAULT_CHANNEL_ID = 'default';
const PERMISSION_REQUEST_ATTEMPTED_KEY = '@notification_permission_attempted';

export const NotificationHelper = {
  /** True once requestPermission() has ever been called this install — lets App.tsx
   * distinguish "never asked" (let the silent post-login prompt run) from "asked and
   * declined/still not granted" (needs the custom re-nudge modal + Settings deep link). */
  async hasAttemptedPermissionRequest(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(PERMISSION_REQUEST_ATTEMPTED_KEY)) === 'true';
    } catch {
      return false;
    }
  },

  /** Current OS authorization status without triggering a new prompt. */
  async getPermissionStatus(): Promise<AuthorizationStatus> {
    try {
      const settings = await notifee.getNotificationSettings();
      return settings.authorizationStatus;
    } catch (error) {
      console.error('[Notification] Get permission status error:', error);
      return AuthorizationStatus.NOT_DETERMINED;
    }
  },

  /**
   * Request notification permissions (required for iOS and Android 13+)
   */
  async requestPermission(): Promise<boolean> {
    try {
      await AsyncStorage.setItem(PERMISSION_REQUEST_ATTEMPTED_KEY, 'true');
    } catch (error) {
      console.error('[Notification] Mark permission attempted error:', error);
    }
    try {
      if (Platform.OS === 'ios') {
        // Request via notifee first (shows native iOS dialog)
        const settings = await notifee.requestPermission({
          alert: true,
          badge: true,
          sound: true,
          announcement: true,
        });

        if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
          console.log('[Notification] iOS permission DENIED');
          return false;
        }

        // Also register for remote messages
        await messaging().registerDeviceForRemoteMessages();

        // Request via Firebase
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        console.log('[Notification] iOS permission status:', enabled);
        return enabled;
      } else {
        // Android 13+ requires notification permission
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Notification Permission',
              message: 'This app needs notification permission to send you learning reminders.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          const enabled = granted === PermissionsAndroid.RESULTS.GRANTED;
          console.log('[Notification] Android permission:', granted);
          return enabled;
        }
        return true; // Android < 13 doesn't need explicit permission
      }
    } catch (error) {
      console.error('[Notification] Permission error:', error);
      CrashlyticsHelper.recordError(error as Error, 'NotificationHelper.requestPermission');
      return false;
    }
  },

  /**
   * Create notification channel (required for Android)
   */
  async createNotificationChannel(): Promise<string> {
    try {
      const channelId = await notifee.createChannel({
        id: DEFAULT_CHANNEL_ID,
        name: 'Learning Reminders',
        description: 'Notifications for learning reminders and progress updates',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibration: true,
        badge: true,
      });

      console.log('[Notification] Channel created:', channelId);
      return channelId;
    } catch (error) {
      console.error('[Notification] Create channel error:', error);
      return DEFAULT_CHANNEL_ID;
    }
  },

  /**
   * Copy notification content to clipboard
   */
  copyToClipboard(text: string, label?: string): void {
    try {
      Clipboard.setString(text);
      console.log(`[Notification] Copied to clipboard: ${label || 'text'}`);
    } catch (error) {
      console.error('[Notification] Copy to clipboard error:', error);
    }
  },

  /**
   * Get text from clipboard
   */
  async getFromClipboard(): Promise<string> {
    try {
      const text = await Clipboard.getString();
      return text;
    } catch (error) {
      console.error('[Notification] Get from clipboard error:', error);
      return '';
    }
  },

  /**
   * Display a local notification using notifee with copy action
   */
  async displayNotification(
    title: string,
    body: string,
    data?: Record<string, string>,
    enableCopyAction: boolean = false
  ): Promise<void> {
    try {
      const channelId = await this.createNotificationChannel();

      const notification: any = {
        title,
        body,
        data,
        android: {
          channelId,
          importance: AndroidImportance.HIGH,
          badgeIconType: AndroidBadgeIconType.LARGE,
          sound: 'default',
          pressAction: {
            id: 'default',
          },
          showTimestamp: true,
        },
        ios: {
          sound: 'default',
          foregroundPresentationOptions: {
            alert: true,
            badge: true,
            sound: true,
          },
        },
      };

      // Add copy action if enabled
      if (enableCopyAction) {
        notification.android.actions = [
          {
            title: 'Copy',
            pressAction: { id: 'copy' },
            icon: 'https://my-cdn.com/icons/copy.png', // Optional: Add your icon URL
          },
        ];

        notification.ios.actions = [
          {
            id: 'copy',
            title: 'Copy',
          },
        ];
      }

      await notifee.displayNotification(notification);

      console.log('[Notification] Displayed:', title);
    } catch (error) {
      console.error('[Notification] Display error:', error);
      CrashlyticsHelper.recordError(error as Error, 'NotificationHelper.displayNotification');
    }
  },

  /**
   * Display notification from FCM remote message with copy action
   */
  async displayRemoteNotification(
    message: FirebaseMessagingTypes.RemoteMessage,
    enableCopyAction: boolean = false
  ): Promise<void> {
    try {
      const channelId = await this.createNotificationChannel();

      // Generate unique ID if messageId is missing
      const notificationId = message.messageId || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const notification: any = {
        id: notificationId,
        title: message.notification?.title || 'New Notification',
        body: message.notification?.body || '',
        data: {
          ...(message.data as Record<string, string>),
          notificationBody: message.notification?.body || '', // Store body for copying
        },
        android: {
          channelId,
          importance: AndroidImportance.HIGH,
          badgeIconType: AndroidBadgeIconType.LARGE,
          sound: 'default',
          pressAction: {
            id: 'default',
          },
          showTimestamp: true,
        },
        ios: {
          sound: 'default',
          foregroundPresentationOptions: {
            alert: true,
            badge: true,
            sound: true,
          },
        },
      };

      // Add copy action if enabled
      if (enableCopyAction) {
        notification.android.actions = [
          {
            title: '📋 Copy',
            pressAction: { id: 'copy' },
          },
        ];

        notification.ios.actions = [
          {
            id: 'copy',
            title: 'Copy',
          },
        ];
      }

      await notifee.displayNotification(notification);

      console.log('[Notification] Remote notification displayed:', message.notification?.title);
    } catch (error) {
      console.error('[Notification] Display remote error:', error);
    }
  },

  /**
   * Get FCM token
   */
  async getFCMToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      console.log('[Notification] FCM Token:', token);
      return token;
    } catch (error) {
      console.error('[Notification] Get token error:', error);
      CrashlyticsHelper.recordError(error as Error, 'NotificationHelper.getFCMToken');
      return null;
    }
  },

  /**
   * Save FCM token to backend
   */
  async saveFCMTokenToBackend(fcmToken: string): Promise<boolean> {
    try {
      const authToken = await AuthStorage.getToken();
      if (!authToken) {
        console.warn('[Notification] No auth token - cannot save FCM token');
        return false;
      }

      const response = await fetch(`${AUTH_URL}/save-fcm-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          fcm_token: fcmToken,
          device_type: Platform.OS,
        }),
      });

      if (response.ok) {
        console.log('[Notification] FCM token saved to backend successfully');
        return true;
      } else {
        const errorText = await response.text();
        console.error('[Notification] Failed to save FCM token:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('[Notification] Save token error:', error);
      CrashlyticsHelper.recordError(error as Error, 'NotificationHelper.saveFCMTokenToBackend');
      return false;
    }
  },

  /**
   * Initialize notifications - call this after user logs in
   */
  async initialize(): Promise<void> {
    try {
      console.log('[Notification] Initializing push notifications...');

      // Request permission
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn('[Notification] Permission not granted');
        return;
      }

      // Create notification channel (Android)
      await this.createNotificationChannel();

      // Get FCM token
      const fcmToken = await this.getFCMToken();
      if (!fcmToken) {
        console.error('[Notification] Failed to get FCM token');
        return;
      }

      // Save token to backend
      await this.saveFCMTokenToBackend(fcmToken);

      // Listen for token refresh
      messaging().onTokenRefresh(async (newToken) => {
        console.log('[Notification] Token refreshed');
        await this.saveFCMTokenToBackend(newToken);
      });

      console.log('[Notification] Initialized successfully');
    } catch (error) {
      console.error('[Notification] Initialize error:', error);
      CrashlyticsHelper.recordError(error as Error, 'NotificationHelper.initialize');
    }
  },

  /**
   * Setup foreground message handler - displays notification when app is open
   */
  setupForegroundHandler(): () => void {
    const unsubscribe = messaging().onMessage(async (remoteMessage) => {
      console.log('[Notification] Foreground message:', remoteMessage);
      await this.displayRemoteNotification(remoteMessage, false);
    });
    return unsubscribe;
  },

  /**
   * Setup notifee foreground event handler with clipboard support
   */
  setupForegroundEventHandler(): () => void {
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }: Event) => {
      console.log('[Notification] Foreground event:', type, detail);

      switch (type) {
        case EventType.DISMISSED:
          console.log('[Notification] User dismissed notification');
          break;
        
        case EventType.PRESS:
          console.log('[Notification] User pressed notification:', detail.notification?.data);
          // Handle navigation based on notification data
          break;
        
        case EventType.ACTION_PRESS:
          // Handle copy action
          if (detail.pressAction?.id === 'copy') {
            const notificationBody = detail.notification?.data?.notificationBody || 
                                    detail.notification?.body || 
                                    '';
            if (notificationBody) {
              this.copyToClipboard(notificationBody, 'Notification content');
              console.log('[Notification] Content copied to clipboard');
              
              // Optional: Show a toast or small notification confirming the copy
              this.displayNotification(
                'Copied!',
                'Notification content copied to clipboard',
                undefined,
                false
              );
            }
          }
          break;
      }
    });
    return unsubscribe;
  },

  /**
   * Setup background message handler (call outside of component)
   */
  setupBackgroundHandler(): void {
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('[Notification] Background message:', remoteMessage);
    });
  },

  /**
   * Setup notifee background event handler with clipboard support (call outside of component)
   */
  setupBackgroundEventHandler(): void {
    notifee.onBackgroundEvent(async ({ type, detail }: Event) => {
      console.log('[Notification] Background event:', type, detail);

      if (type === EventType.PRESS) {
        console.log('[Notification] Background notification pressed:', detail.notification?.data);
      }

      // Handle copy action in background
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'copy') {
        const notificationBody = detail.notification?.data?.notificationBody || 
                                detail.notification?.body || 
                                '';
        if (notificationBody) {
          Clipboard.setString(notificationBody);
          console.log('[Notification] Content copied to clipboard (background)');
        }
      }

      // Cancel the notification after handling
      if (detail.notification?.id) {
        await notifee.cancelNotification(detail.notification.id);
      }
    });
  },

  /**
   * Check if app was opened from notification
   */
  async getInitialNotification(): Promise<any> {
    const remoteMessage = await messaging().getInitialNotification();
    if (remoteMessage) {
      console.log('[Notification] App opened from notification:', remoteMessage);
    }
    return remoteMessage;
  },

  /**
   * Update notification preferences
   */
  async updatePreferences(enabled: boolean, types?: object): Promise<boolean> {
    try {
      const authToken = await AuthStorage.getToken();
      if (!authToken) {
        return false;
      }

      const response = await fetch(`${AUTH_URL}/notification-preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          enabled,
          types: types || {},
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('[Notification] Update preferences error:', error);
      return false;
    }
  },

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await notifee.cancelAllNotifications();
      console.log('[Notification] All notifications cancelled');
    } catch (error) {
      console.error('[Notification] Cancel all error:', error);
    }
  },

  /**
   * Get badge count
   */
  async getBadgeCount(): Promise<number> {
    try {
      return await notifee.getBadgeCount();
    } catch (error) {
      return 0;
    }
  },

  /**
   * Set badge count
   */
  async setBadgeCount(count: number): Promise<void> {
    try {
      await notifee.setBadgeCount(count);
    } catch (error) {
      console.error('[Notification] Set badge error:', error);
    }
  },
};