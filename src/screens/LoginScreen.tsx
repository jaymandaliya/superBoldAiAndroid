import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Linking,
  StyleSheet,
  Dimensions,
  Keyboard,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-simple-toast';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, AUTH_URL, TERMS_URL, PRIVACY_URL, SUPPORT_EMAIL } from '../constants';
import { CrashlyticsHelper, NetworkHelper, AuthStorage, NotificationHelper } from '../helpers';
import { WebViewModal, OTPInput, CountryCodeSelector } from '../components';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Learning, Country } from '../types';
import { DEFAULT_COUNTRY } from '../constants/countries';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const { width, height } = Dimensions.get('window');

export function LoginScreen({ navigation }: Props) {
  const { t, setLanguage } = useI18n();

  // Always force English language on mount (after logout)
  useEffect(() => {
    setLanguage('en');
  }, []);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const phoneInputRef = useRef<TextInput>(null);

  // On Android, if the TextInput was already focused and keyboard was dismissed (back button),
  // tapping again doesn't trigger onFocusChanged → keyboard never shows.
  // Blur first to reset the focus state, then re-focus to force showSoftInput.
  const openPhoneKeyboard = () => {
    if (Platform.OS === 'android') {
      phoneInputRef.current?.blur();
      setTimeout(() => phoneInputRef.current?.focus(), 50);
    } else {
      phoneInputRef.current?.focus();
    }
  };

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  // Keyboard listeners
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        // Scroll to bottom when keyboard opens
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Cleanup resend timer on unmount
  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) {
        clearInterval(resendIntervalRef.current);
      }
    };
  }, []);

  const startResendTimer = () => {
    setResendTimer(120); // 2 minutes
    if (resendIntervalRef.current) {
      clearInterval(resendIntervalRef.current);
    }
    resendIntervalRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) {
            clearInterval(resendIntervalRef.current);
            resendIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || loading) return;

    const isConnected = await NetworkHelper.checkConnection();
    if (!isConnected) {
      Toast.show(t('login_no_internet_toast'), Toast.SHORT);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${AUTH_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: `${selectedCountry.dialCode}${phoneNumber}` }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t('login_failed_resend_otp_toast'));
      }

      setOtp('');
      startResendTimer();
      Toast.show(t('login_otp_resent_toast'), Toast.SHORT);
    } catch (error: any) {
      Toast.show(error.message || t('login_failed_resend_otp_toast'), Toast.SHORT);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(slideUpAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous animations
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -15,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const handleSendOtp = async () => {
    // Generic sanity check — actual per-country length rules vary too much to
    // hardcode (was previously fixed to 10 digits, assuming India only).
    if (!phoneNumber.trim() || phoneNumber.length < 4 || phoneNumber.length > 14) {
      Toast.show(t('login_invalid_phone_toast'), Toast.SHORT);
      return;
    }

    const isConnected = await NetworkHelper.checkConnection();
    if (!isConnected) {
      Toast.show(t('login_no_internet_toast'), Toast.SHORT);
      return;
    }

    setLoading(true);
    CrashlyticsHelper.log(`Sending OTP to: ${selectedCountry.dialCode}${phoneNumber.substring(0, 4)}****`);

    const endpoint = `${AUTH_URL}/send-otp`;
    const requestBody = { phoneNumber: `${selectedCountry.dialCode}${phoneNumber}` };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to send OTP (${response.status})`);
      }

      setShowOtpInput(true);
      startResendTimer();
      Toast.show(t('login_otp_sent_toast'), Toast.SHORT);
      CrashlyticsHelper.log('OTP sent successfully');
    } catch (error: any) {
      CrashlyticsHelper.recordError(error as Error, 'handleSendOtp');
      Toast.show(error.message || t('login_failed_send_otp_toast'), Toast.SHORT);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Toast.show(t('login_enter_otp_toast'), Toast.SHORT);
      return;
    }

    const isConnected = await NetworkHelper.checkConnection();
    if (!isConnected) {
      Toast.show(t('login_no_internet_toast'), Toast.SHORT);
      return;
    }

    setLoading(true);
    CrashlyticsHelper.log('Verifying OTP');

    const endpoint = `${AUTH_URL}/login`;
    const requestBody = { phoneNumber: `${selectedCountry.dialCode}${phoneNumber}`, otp };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Login failed (${response.status})`);
      }

      await AuthStorage.saveToken(data.token);
      CrashlyticsHelper.setUserId(String(data.user.id));
      CrashlyticsHelper.log('Login successful');


      if (data.user?.is_new_user) {
        await AuthStorage.clearLanguageContext();
        await AuthStorage.clearOnboardingProfile(String(data.user.id));
        CrashlyticsHelper.log('Cleared cached language context for new account');
      }

      // Always reset app language to English on login screen (after logout)
      await setLanguage('en');

      // Initialize push notifications after login
      NotificationHelper.initialize();

      const learningsArray: Learning[] = data.learnings ?? (data.learning ? [data.learning] : []);
      const activeLearningRaw =
        learningsArray.find((learning: Learning) => learning.is_active) ?? learningsArray[0] ?? null;
      const normalizedLearning = await AuthStorage.normalizeCompletedLearning(activeLearningRaw);

      const onboardingProfile = await AuthStorage.getOnboardingProfile(String(data.user.id));
      const savedLanguageContext = await AuthStorage.getLanguageContext(String(data.user.id));

      const hasLanguages = Boolean(
        normalizedLearning?.native_language && normalizedLearning?.target_language
      ) || Boolean(savedLanguageContext?.nativeLanguage && savedLanguageContext?.targetLanguage);
      const hasName = Boolean(data.user?.name);
      const hasSkillAndReason = Boolean(
        (normalizedLearning?.skill && normalizedLearning?.learning_reason) || onboardingProfile
      );

      // Diagnostic logs to help debug incorrect onboarding-step navigation after OTP
      try {
        const dbg = {
          normalizedLearning,
          onboardingProfile,
          savedLanguageContext,
          hasLanguages,
          hasName,
          hasSkillAndReason,
        };
        CrashlyticsHelper.log('Login navigation debug: ' + JSON.stringify(dbg));
        console.log('Login navigation debug:', dbg);
      } catch (e) {
        // ignore logging errors
      }

      // Save UI language if found
      const selectedUILanguage =
        normalizedLearning?.native_language || savedLanguageContext?.nativeLanguage || null;
      if (selectedUILanguage) {
        await AuthStorage.saveAppLanguage(selectedUILanguage);
      }

      // Returning user check: user.name comes from the backend and is always reliable.
      // savedPath / onboardingProfile live in AsyncStorage and are wiped on reinstall,
      // so we must NOT gate returning users behind those local-only checks.
      if (hasName) {
        navigation.replace('MainTabs', {
          user: data.user,
          existingLearning: normalizedLearning,
        });
        return;
      }

      const savedPath = await AuthStorage.getUserPath(String(data.user.id));

      // Below this point the user has no name yet — genuinely new or incomplete onboarding.
      if (!savedPath) {
        if (!hasLanguages) {
          navigation.replace('OnboardingLanguageModal', {
            user: data.user,
            existingLearning: normalizedLearning,
          });
        } else {
          navigation.replace('PathChoice', {
            user: data.user,
            existingLearning: normalizedLearning,
          });
        }
      } else if (savedPath === 'chat') {
        navigation.replace('UserNameCapture', {
          user: data.user,
          existingLearning: normalizedLearning,
          pathChoice: 'chat',
        });
      } else if (!hasLanguages) {
        navigation.replace('LanguageSelection', {
          user: data.user,
          existingLearning: normalizedLearning,
          onboardingFlow: true,
        });
      } else {
        navigation.replace('UserNameCapture', {
          user: data.user,
          existingLearning: normalizedLearning,
          pathChoice: 'learn',
        });
      }
    } catch (error: any) {
      CrashlyticsHelper.recordError(error as Error, 'handleVerifyOtp');
      Toast.show(error.message || t('login_failed_toast'), Toast.SHORT);
    } finally {
      setLoading(false);
    }
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Animated Background */}
      <LinearGradient
        colors={[COLORS.bg, COLORS.bgLight, COLORS.bgLighter]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Floating Orbs */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          styles.orb1,
          {
            transform: [
              { rotate: spin },
              { translateY: floatAnim },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 95, 43, 0.09)', 'rgba(92, 59, 255, 0.07)']}
          style={styles.orbGradient}
        />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          styles.orb2,
          {
            transform: [
              { rotate: spin },
              { translateY: floatAnim },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(92, 59, 255, 0.08)', 'rgba(255, 95, 43, 0.07)']}
          style={styles.orbGradient}
        />
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.authContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView 
            ref={scrollViewRef}
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header - Hide when keyboard is visible on OTP screen */}
            {!(keyboardVisible && showOtpInput) && (
              <Animated.View
                style={[
                  styles.authHeader,
                  {
                    opacity: fadeAnim,
                    transform: [
                      { translateY: slideUpAnim },
                      { scale: scaleAnim },
                    ],
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.logoContainer,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                >
                  <View style={styles.logoGradient}>
                    <Image
                      source={require('../logo.png')}
                      style={styles.logoImage}
                      resizeMode="contain"
                    />
                  </View>
                </Animated.View>

                <Text style={styles.authTitle}>{t('login_app_title')}</Text>
                <Text style={styles.authTagline}>{t('login_tagline')}</Text>
                <Text style={styles.authSubtitle}>
                  {showOtpInput
                    ? t('login_subtitle_otp')
                    : t('login_subtitle_default')}
                </Text>
              </Animated.View>
            )}

            {/* Compact header when keyboard is visible */}
            {keyboardVisible && showOtpInput && (
              <View style={styles.compactHeader}>
                <Text style={styles.compactTitle}>{t('login_compact_title')}</Text>
                <Text style={styles.compactSubtitle}>{t('login_compact_subtitle', { phoneNumber: `${selectedCountry.dialCode} ${phoneNumber}` })}</Text>
              </View>
            )}

            {/* Form */}
            <Animated.View
              style={[
                styles.authForm,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideUpAnim }],
                },
              ]}
            >
              {/* Phone Number Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('login_phone_label')}</Text>
                <LinearGradient
                  colors={['rgba(92, 59, 255, 0.06)', 'rgba(255, 95, 43, 0.04)']}
                  style={styles.inputContainer}
                >
                  <View style={styles.phoneInputRow}>
                    <TouchableOpacity
                      style={styles.countryCodeBox}
                      onPress={() => setShowCountryPicker(true)}
                      disabled={showOtpInput}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.countryCodeFlag}>{selectedCountry.flag}</Text>
                      <Text style={styles.countryCodeText}>{selectedCountry.dialCode}</Text>
                      {!showOtpInput && (
                        <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} style={{ marginLeft: 2 }} />
                      )}
                    </TouchableOpacity>
                    <View style={styles.phoneDivider} />
                    <Pressable style={{ flex: 1 }} onPressIn={openPhoneKeyboard}>
                      <TextInput
                        ref={phoneInputRef}
                        style={[styles.input, { flex: 1 }]}
                        placeholder={t('login_phone_placeholder')}
                        placeholderTextColor={COLORS.textDim}
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        keyboardType="number-pad"
                        editable={!showOtpInput}
                        maxLength={14}
                        showSoftInputOnFocus
                      />
                    </Pressable>
                  </View>
                </LinearGradient>
              </View>

              {/* OTP Input - 6 individual boxes with auto-fill */}
              {showOtpInput && (
                <Animated.View
                  style={[
                    styles.inputGroup,
                    {
                      opacity: fadeAnim,
                    },
                  ]}
                >
                  <Text style={styles.inputLabel}>{t('login_otp_label')}</Text>
                  <OTPInput
                    length={6}
                    value={otp}
                    onChange={setOtp}
                    autoFocus
                    disabled={loading}
                  />
                </Animated.View>
              )}

              {/* Action Buttons */}
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={COLORS.text} />
                  <Text style={styles.loadingText}>
                    {showOtpInput ? t('login_verifying_text') : t('login_sending_otp_text')}
                  </Text>
                </View>
              ) : (
                <>
                  {!showOtpInput ? (
                    <LinearGradient
                      colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.authButton}
                    >
                      <TouchableOpacity 
                        style={styles.authButtonTouch}
                        onPress={handleSendOtp}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="arrow-forward" size={20} color={COLORS.text} style={{ marginRight: 10 }} />
                          <Text style={styles.authButtonText}>{t('login_send_otp_button')}</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  ) : (
                    <>
                      <LinearGradient
                        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.authButton}
                      >
                        <TouchableOpacity 
                          style={styles.authButtonTouch}
                          onPress={handleVerifyOtp}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="checkmark" size={20} color={COLORS.text} style={{ marginRight: 10 }} />
                          <Text style={styles.authButtonText}>{t('login_verify_continue_button')}</Text>
                        </TouchableOpacity>
                      </LinearGradient>

                      <TouchableOpacity
                        style={[styles.resendButton, resendTimer > 0 && styles.resendButtonDisabled]}
                        onPress={handleResendOtp}
                        disabled={resendTimer > 0 || loading}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="refresh"
                          size={16}
                          color={resendTimer > 0 ? COLORS.textDim : COLORS.primaryLight}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.resendText, resendTimer > 0 && styles.resendTextDisabled]}>
                          {resendTimer > 0
                            ? t('login_resend_otp_timer', {
                              minutes: Math.floor(resendTimer / 60),
                              seconds: (resendTimer % 60).toString().padStart(2, '0'),
                            })
                            : t('login_resend_otp_button')}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.switchAuthButton}
                        onPress={() => {
                          setShowOtpInput(false);
                          setOtp('');
                          setResendTimer(0);
                          if (resendIntervalRef.current) {
                            clearInterval(resendIntervalRef.current);
                            resendIntervalRef.current = null;
                          }
                        }}
                      >
                        <Ionicons name="arrow-back" size={16} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
                        <Text style={styles.switchAuthText}>{t('login_change_phone_button')}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}

              {/* Features - Hide when keyboard is visible */}
              {!showOtpInput && !keyboardVisible && (
                <View style={styles.featuresContainer}>
                  <View style={styles.featureItem}>
                    <MaterialCommunityIcons name="robot-outline" size={26} color={COLORS.text} style={styles.featureIconStyle} />
                    <Text style={styles.featureText}>{t('login_feature_ai_conversations')}</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <MaterialCommunityIcons name="target" size={26} color={COLORS.text} style={styles.featureIconStyle} />
                    <Text style={styles.featureText}>{t('login_feature_personalized_path')}</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="flash-outline" size={26} color={COLORS.text} style={styles.featureIconStyle} />
                    <Text style={styles.featureText}>{t('login_feature_realtime_feedback')}</Text>
                  </View>
                </View>
              )}

              {/* Legal - Hide when keyboard is visible */}
              {!keyboardVisible && (
                <View style={styles.legalContainer}>
                  <Text style={styles.legalText}>{t('login_legal_text')}</Text>
                  <View style={styles.legalLinks}>
                    <TouchableOpacity onPress={() => setShowTerms(true)}>
                      <Text style={styles.legalLink}>{t('login_terms_link')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.legalSeparator}>{t('login_legal_and')}</Text>
                    <TouchableOpacity onPress={() => setShowPrivacy(true)}>
                      <Text style={styles.legalLink}>{t('login_privacy_link')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              
            </Animated.View>

            {/* Bottom padding for keyboard */}
            <View style={{ height: 20 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        <WebViewModal
          visible={showTerms}
          onClose={() => setShowTerms(false)}
          url={TERMS_URL}
          title={t('login_terms_link')}
        />
        <WebViewModal
          visible={showPrivacy}
          onClose={() => setShowPrivacy(false)}
          url={PRIVACY_URL}
          title={t('login_privacy_link')}
        />
        <CountryCodeSelector
          visible={showCountryPicker}
          onClose={() => setShowCountryPicker(false)}
          onSelect={setSelectedCountry}
          selectedCountry={selectedCountry}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safeArea: {
    flex: 1,
    zIndex: 1,
  },
  authContainer: {
    flex: 1,
  },
  authScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  // Animated Background Orbs
  orb: {
    position: 'absolute',
    borderRadius: 300,
    opacity: 0.75,
  },
  orb1: {
    width: 400,
    height: 400,
    top: -200,
    right: -180,
  },
  orb2: {
    width: 320,
    height: 320,
    bottom: -160,
    left: -140,
  },
  orbGradient: {
    flex: 1,
    borderRadius: 300,
  },

  // Header
  authHeader: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: COLORS.borderStrong,
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
    backgroundColor: COLORS.card,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  authEmoji: {
    fontSize: 48,
  },
  authTitle: {
    fontSize: 36,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    marginBottom: 12,
    letterSpacing: 0.5,
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
    textAlign: 'center',
  },
  authTagline: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
    marginBottom: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  authSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontFamily: FONTS.regular,
    lineHeight: 24,
    paddingHorizontal: 30,
  },

  // Compact Header (shown when keyboard is visible)
  compactHeader: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  compactTitle: {
    fontSize: 24,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    marginBottom: 6,
  },
  compactSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
  },

  // Form
  authForm: {
    width: '100%',
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 12,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.3,
  },
  inputContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeBox: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countryCodeFlag: {
    fontSize: 18,
    marginRight: 6,
  },
  countryCodeText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  phoneDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  input: {
    padding: 18,
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.regular,
  },

  // Buttons
  authButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  authButtonTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  authButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  authButtonText: {
    color: COLORS.text,
    fontSize: 17,
    fontFamily: FONTS.bold,
    letterSpacing: 0.5,
  },
  resendButton: {
    marginTop: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 12,
  },
  resendButtonDisabled: {
    opacity: 0.6,
  },
  resendText: {
    color: COLORS.primaryLight,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  resendTextDisabled: {
    color: COLORS.textDim,
  },
  switchAuthButton: {
    marginTop: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 12,
  },
  switchAuthText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    marginTop: 16,
  },

  // Features
  featuresContainer: {
    marginTop: 40,
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  featureIcon: {
    fontSize: 28,
    marginRight: 16,
    width: 32,
  },
  featureIconStyle: {
    marginRight: 16,
    width: 32,
  },
  featureText: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    flex: 1,
    letterSpacing: 0.2,
  },

  // Legal
  legalContainer: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  legalText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  legalLink: {
    fontSize: 13,
    color: COLORS.primaryLight,
    fontFamily: FONTS.semiBold,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
  },

  // Support
  supportButton: {
    marginTop: 16,
    alignItems: 'center',
    padding: 12,
  },
  supportButtonText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
});