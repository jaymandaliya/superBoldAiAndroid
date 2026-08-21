import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { COLORS } from '../constants';
import { User, Learning } from '../types';

// Import all screens
import {
  PermissionOnboardingScreen,
  LoginScreen,
  LanguageSelectionScreen,
  RoomScreen,
  ConversationHistoryScreen,
  NoInternetScreen,
  ConnectionErrorScreen,
  LoadingScreen,
  ContactSupportScreen,
  OnboardingLanguageModal,
} from '../screens';
import { UserNameCaptureScreen } from '../screens/UserNameCaptureScreen';
import { PathChoiceScreen } from '../screens/PathChoiceScreen';
import { TestScreen } from '../screens/TestScreen';
import { TalkingScreen } from '../screens/TalkingScreen';
import { BottomTabNavigator } from './BottomTabNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: COLORS.bg },
  animation: 'slide_from_right' as const,
};

interface AppNavigatorProps {
  initialRouteName: keyof RootStackParamList;
  initialUser?: User;
  initialLearning?: Learning | null;
  initialStep?: 1 | 2 | 3;
  isConnected: boolean;
}

export function AppNavigator({
  initialRouteName,
  initialUser,
  initialLearning,
  initialStep,
  isConnected,
}: AppNavigatorProps) {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={screenOptions}
      >
        <Stack.Screen
          name="PermissionOnboarding"
          component={PermissionOnboardingScreen}
        />

        <Stack.Screen
          name="Login"
          component={LoginScreen}
        />

        <Stack.Screen
          name="PathChoice"
          component={PathChoiceScreen}
          options={{ animation: 'slide_from_right' }}
        />

        <Stack.Screen
          name="LanguageSelection"
          component={LanguageSelectionScreen}
          initialParams={
            initialRouteName === 'LanguageSelection' && initialUser
              ? { user: initialUser, existingLearning: initialLearning, onboardingFlow: true }
              : undefined
          }
        />

        <Stack.Screen
          name="MainTabs"
          component={BottomTabNavigator}
          initialParams={
            initialRouteName === 'MainTabs' && initialUser
              ? { user: initialUser, existingLearning: initialLearning }
              : undefined
          }
          options={{
            animation: 'fade',
          }}
        />

        <Stack.Screen
          name="Room"
          component={RoomScreen}
          options={{
            gestureEnabled: false,
          }}
        />

        <Stack.Screen
          name="ConversationHistory"
          component={ConversationHistoryScreen}
          options={{
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="ContactSupport"
          component={ContactSupportScreen}
          options={{
            animation: 'slide_from_bottom',
          }}
        />

        <Stack.Screen
          name="NoInternet"
          component={NoInternetScreen}
        />

        <Stack.Screen
          name="ConnectionError"
          component={ConnectionErrorScreen}
        />

        <Stack.Screen
          name="UserNameCapture"
          component={UserNameCaptureScreen}
          initialParams={
            initialRouteName === 'UserNameCapture' && initialUser
              ? { user: initialUser, existingLearning: initialLearning, initialStep }
              : undefined
          }
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="Loading"
          component={LoadingScreen}
          options={{
            animation: 'fade',
          }}
        />

        <Stack.Screen
          name="TalkingSession"
          component={TalkingScreen}
          options={{
            animation: 'slide_from_right',
            gestureEnabled: false,
          }}
        />

        <Stack.Screen
          name="TestScreen"
          component={TestScreen}
          options={{
            gestureEnabled: false,
            animation: 'slide_from_bottom',
          }}
        />

        <Stack.Screen
          name="OnboardingLanguageModal"
          component={OnboardingLanguageModal}
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            gestureEnabled: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
