import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, BottomTabParamList } from './types';
import { LanguageSelectionScreen } from '../screens';
import { HistoryTabScreen } from '../screens/HistoryTabScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { COLORS, FONTS } from '../constants';
import Ionicons from 'react-native-vector-icons/Ionicons';

const Tab = createBottomTabNavigator<BottomTabParamList>();

type Props = NativeStackScreenProps<RootStackParamList, 'MainTabs'>;

// Content stack: icon(22) + gap(3) + label(14) = 39dp — needs ~55dp visible area
// Base = 55 + paddingTop(8) + paddingBottom(6) = 69 → round to 70
const BASE_TAB_HEIGHT = 70;

export function BottomTabNavigator({ route }: Props) {
  const { user, existingLearning } = route.params;
  const insets = useSafeAreaInsets();

  // Android 15 (targetSdk=35) enforces edge-to-edge — content draws behind nav bar.
  // Add insets.bottom so the tab content sits above the system navigation bar.
  const androidTabStyle = Platform.OS === 'android' ? {
    height: BASE_TAB_HEIGHT + insets.bottom,
    paddingBottom: insets.bottom + 6,
    paddingTop: 8,
  } : {};

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, androidTabStyle],
        tabBarActiveTintColor: COLORS.tabBarActive,
        tabBarInactiveTintColor: COLORS.tabBarInactive,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen
        name="LearnTab"
        component={LanguageSelectionScreen as any}
        initialParams={{ user, existingLearning }}
        options={{
          tabBarLabel: 'Learn',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryTabScreen}
        initialParams={{ user, existingLearning }}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color }) => (
            <Ionicons name="time-outline" size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        initialParams={{ user, existingLearning }}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-outline" size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.tabBarBackground,
    borderTopWidth: 1,
    borderTopColor: COLORS.tabBarBorder,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tabBarLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    marginTop: 2,
  },
});
