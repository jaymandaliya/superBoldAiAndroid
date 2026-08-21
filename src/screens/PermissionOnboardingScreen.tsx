import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  Animated,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { permissions } from '@livekit/react-native-webrtc';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS } from '../constants';
import { CrashlyticsHelper, AuthStorage, AudioHelper } from '../helpers';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = NativeStackScreenProps<RootStackParamList, 'PermissionOnboarding'>;

export function PermissionOnboardingScreen({ navigation }: Props) {
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(50);
    
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentStep]);

  const requestMicrophonePermission = async () => {
    CrashlyticsHelper.log('Requesting microphone permission');

    try {
      const isGranted = await permissions.request({ name: 'microphone' });
      setMicPermissionGranted(Boolean(isGranted));
      CrashlyticsHelper.log(`Microphone permission granted: ${Boolean(isGranted)}`);

      if (isGranted) {
        // Configure audio session now that RECORD_AUDIO is available.
        // On Android, the communication audio mode + speaker routing can only
        // be applied after the permission is granted; otherwise LiveKit falls
        // back to default routing (earpiece-like low volume).
        await AudioHelper.setupAudio();
      }

      if (!isGranted) {
        Alert.alert(
          t('permission_required_title'),
          t('permission_required_message'),
          [
            { text: t('permission_open_settings_button'), onPress: () => Linking.openSettings() },
            { text: t('permission_continue_anyway_button'), onPress: () => setCurrentStep(1) }
          ]
        );
      } else {
        setCurrentStep(1);
      }
    } catch (err) {
      CrashlyticsHelper.recordError(err as Error, 'requestMicrophonePermission');
      setCurrentStep(1);
    }
  };

  const handleComplete = async () => {
    await AuthStorage.setPermissionScreenShown();
    CrashlyticsHelper.log('Permission onboarding completed');
    navigation.replace('Login');
  };

  const steps = [
    {
      iconName: 'mic-outline',
      title: t('permission_step1_title'),
      description: t('permission_step1_description'),
      buttonText: t('permission_step1_button'),
      onPress: requestMicrophonePermission,
    },
    {
      iconName: 'globe-outline',
      title: t('permission_step2_title'),
      description: t('permission_step2_description'),
      buttonText: t('permission_step2_button'),
      onPress: handleComplete,
    },
  ];

  const step = steps[currentStep];

  return (
    <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.onboardingContainer}>
          <View style={styles.progressDotsContainer}>
            {steps.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index === currentStep && styles.progressDotActive,
                  index < currentStep && styles.progressDotCompleted,
                ]}
              />
            ))}
          </View>

          <Animated.View 
            style={[
              styles.onboardingContent,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <Ionicons name={step.iconName} size={72} color={COLORS.primary} style={styles.onboardingIcon} />
            <Text style={styles.onboardingTitle}>{step.title}</Text>
            <Text style={styles.onboardingDescription}>{step.description}</Text>

            {currentStep === 0 && (
              <View style={styles.permissionInfoBox}>
                <Text style={styles.permissionInfoTitle}>{t('permission_step1_info_title')}</Text>
                <Text style={styles.permissionInfoText}>{t('permission_step1_info_text')}</Text>
              </View>
            )}

            {currentStep === 1 && (
              <View style={styles.permissionInfoBox}>
                <Text style={styles.permissionInfoTitle}>{t('permission_step2_info_title')}</Text>
                <Text style={styles.permissionInfoText}>{t('permission_step2_info_text')}</Text>
              </View>
            )}
          </Animated.View>

          <TouchableOpacity
            style={[styles.authButton, styles.primaryButton]}
            onPress={step.onPress}
            activeOpacity={0.8}
          >
            <Text style={styles.authButtonText}>{step.buttonText}</Text>
          </TouchableOpacity>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  onboardingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  progressDotsContainer: {
    flexDirection: 'row',
    position: 'absolute',
    top: 60,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.bgLighter,
    marginHorizontal: 4,
  },
  progressDotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: COLORS.success,
  },
  onboardingContent: {
    alignItems: 'center',
    marginBottom: 40,
  },
  onboardingEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  onboardingIcon: {
    marginBottom: 24,
  },
  onboardingTitle: {
    fontSize: 28,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    marginBottom: 12,
  },
  onboardingDescription: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  permissionInfoBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  permissionInfoTitle: {
    fontSize: 14,
    color: COLORS.primary,
    fontFamily: FONTS.semiBold,
    marginBottom: 8,
  },
  permissionInfoText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    lineHeight: 22,
  },
  authButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  authButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: FONTS.bold,
  },

});