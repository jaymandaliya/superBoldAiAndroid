/**
 * @format
 */

import { AppRegistry, Text, TextInput } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';

import { name as appName } from './app.json';
import { registerGlobals } from '@livekit/react-native';
import App from './src/App';

// Disable font scaling globally
Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.allowFontScaling = false;

TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.allowFontScaling = false;

// Register LiveKit globals
registerGlobals();

// ============================================
// BACKGROUND HANDLERS
// ============================================

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const channelId = await notifee.createChannel({
    id: 'default',
    name: 'Learning Reminders',
    importance: 4,
  });

  const notificationId =
    remoteMessage.messageId ||
    `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await notifee.displayNotification({
    id: notificationId,
    title: remoteMessage.notification?.title || 'New Notification',
    body: remoteMessage.notification?.body || '',
    data: remoteMessage.data,
    android: {
      channelId,
      importance: 4,
      sound: 'default',
      pressAction: {
        id: 'default',
      },
    },
    ios: {
      sound: 'default',
    },
  });
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
  }

  if (detail.notification?.id) {
    await notifee.cancelNotification(detail.notification.id);
  }
});

AppRegistry.registerComponent(appName, () => App);