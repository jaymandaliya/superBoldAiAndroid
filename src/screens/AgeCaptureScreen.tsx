import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Animated,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  StatusBar,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS } from '../constants';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { OnboardingProgressBar, VoiceoverAvatar } from '../components';
import { useResolvedNativeLanguage, useOnboardingClips, useVoiceoverPlayback, useFinalizeOnboarding } from '../hooks';

type Props = NativeStackScreenProps<RootStackParamList, 'AgeCapture'>;

export function AgeCaptureScreen({ navigation, route }: Props) {
  const { user, existingLearning, name } = route.params;
  const { t } = useI18n();

  const [age,           setAge]           = useState<number | null>(null);
  const [showAgePicker, setShowAgePicker] = useState(false);
  const [isReady,       setIsReady]       = useState(false);

  const isYoungKid = age !== null && age < 13;

  const nativeLanguageCode = useResolvedNativeLanguage(String(user.id), existingLearning?.native_language);
  const onboardingAudio = useOnboardingClips(nativeLanguageCode);
  const { isPlaying, playSequence } = useVoiceoverPlayback();
  const { finalize, loading } = useFinalizeOnboarding(navigation);

  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => setIsReady(true), 350);
      return () => { clearTimeout(timer); setIsReady(false); };
    }, []),
  );

  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const slideAnim    = useRef(new Animated.Value(30)).current;
  const ctaPressAnim = useRef(new Animated.Value(1)).current;

  const onCtaPressIn  = () =>
    Animated.spring(ctaPressAnim, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onCtaPressOut = () =>
    Animated.spring(ctaPressAnim, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const playAgeAudio = () => {
    const clip = onboardingAudio.age;
    if (clip) playSequence([clip.url]);
  };

  useEffect(() => {
    playAgeAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingAudio]);

  const hasAudioForStep = Boolean(onboardingAudio.age);

  const handleCtaPress = () => {
    if (age === null) return;
    if (isYoungKid) {
      void finalize({ user, existingLearning, name, age, isYoungKid: true });
    } else {
      navigation.navigate('LearningGoal', { user, existingLearning, name, age });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#080C16" translucent={false} />

      <View style={styles.bgOrb1} pointerEvents="none" />
      <View style={styles.bgOrb2} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.keyboardView}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <OnboardingProgressBar step={2} totalSteps={isYoungKid ? 2 : 4} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <View style={styles.stepContent}>
                <VoiceoverAvatar visible={hasAudioForStep} isPlaying={isPlaying} onReplay={playAgeAudio} />
                <Text style={styles.eyebrow}>{t('username_eyebrow')}</Text>
                <Text style={styles.stepTitle} maxFontSizeMultiplier={1.2}>{t('username_age_label')}</Text>

                <TouchableOpacity
                  style={[styles.ageDropdownBtn, age !== null && styles.ageDropdownBtnActive]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowAgePicker(true);
                  }}
                  activeOpacity={0.82}
                >
                  <Ionicons name="person-outline" size={16} color={age !== null ? COLORS.primary : COLORS.textDim} />
                  <Text style={[styles.ageDropdownText, age === null && styles.ageDropdownPlaceholder]}>
                    {age !== null ? t('username_age_value', { age: String(age) }) : t('username_age_placeholder')}
                  </Text>
                  <Ionicons name="chevron-down" size={15} color={COLORS.textDim} />
                </TouchableOpacity>

                <Modal
                  visible={showAgePicker}
                  transparent
                  animationType="none"
                  onRequestClose={() => setShowAgePicker(false)}
                >
                  <Pressable
                    style={styles.ageModalOverlay}
                    onPress={() => setShowAgePicker(false)}
                  >
                    <Pressable style={styles.ageModalSheet} onPress={() => {}}>
                      <View style={styles.ageSheetHandle} />
                      <Text style={styles.ageSheetTitle}>{t('username_age_label')}</Text>
                      <FlatList
                        data={Array.from({ length: 77 }, (_, i) => i + 4)}
                        keyExtractor={item => String(item)}
                        showsVerticalScrollIndicator={false}
                        style={styles.ageModalList}
                        getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
                        renderItem={({ item }) => {
                          const sel = age === item;
                          return (
                            <Pressable
                              style={[styles.ageModalItem, sel ? styles.ageModalItemSelected : undefined]}
                              onPress={() => { setAge(item); setShowAgePicker(false); }}
                            >
                              <Text style={[styles.ageModalItemText, sel ? styles.ageModalItemTextSelected : undefined]}>
                                {item}
                              </Text>
                              {sel && (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={20}
                                  color={COLORS.primary}
                                  style={styles.ageModalItemCheck}
                                />
                              )}
                            </Pressable>
                          );
                        }}
                      />
                    </Pressable>
                  </Pressable>
                </Modal>
              </View>
            </Animated.View>
          </ScrollView>

          <View style={styles.ctaFooter}>
            <Animated.View style={[styles.ctaButtonShadow, { transform: [{ scale: ctaPressAnim }] }]}>
              <TouchableOpacity
                onPress={handleCtaPress}
                onPressIn={onCtaPressIn}
                onPressOut={onCtaPressOut}
                disabled={!isReady || age === null || loading}
                activeOpacity={1}
                style={styles.ctaButton}
              >
                <LinearGradient
                  colors={age === null ? ['#161D2E', '#161D2E'] : ['#FF5B2E', '#FF8A4C']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
                <Text style={[styles.ctaText, age === null && styles.ctaTextDisabled]}>
                  {loading
                    ? t('username_saving_button')
                    : isYoungKid
                    ? t('username_continue_button')
                    : t('username_next_choose_goal_button')}
                </Text>
                {!loading && (
                  <View style={styles.ctaIconWrap}>
                    <Ionicons name="arrow-forward" size={18} color={age === null ? 'rgba(255,255,255,0.25)' : '#fff'} />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#080C16' },
  safeArea:     { flex: 1 },
  keyboardView: { flex: 1 },

  bgOrb1: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,91,46,0.055)',
    top: -80,
    right: -100,
  },
  bgOrb2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(124,107,255,0.045)',
    bottom: 100,
    left: -80,
  },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  stepContent:   { width: '100%' },

  eyebrow: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'left',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: 40,
    marginBottom: 24,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  ctaFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  ctaButtonShadow: {
    borderRadius: 15,
    shadowColor: '#FF5B2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 14,
  },
  ctaButton: {
    borderRadius: 15,
    overflow: 'hidden',
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  ctaText: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    color: '#fff',
    zIndex: 1,
  },
  ctaTextDisabled: { color: 'rgba(255,255,255,0.28)' },
  ctaIconWrap: {
    marginLeft: 10,
    zIndex: 1,
  },

  ageDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  ageDropdownBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(255,91,46,0.06)',
  },
  ageDropdownText: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  ageDropdownPlaceholder: {
    color: COLORS.textDim,
  },
  ageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  ageModalSheet: {
    backgroundColor: '#1A1D26',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingBottom: 28,
    elevation: 24,
  },
  ageSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  ageSheetTitle: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  ageModalList: {
    maxHeight: 260,
  },
  ageModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  ageModalItemSelected: {
    backgroundColor: 'rgba(255,91,46,0.10)',
  },
  ageModalItemText: {
    fontSize: 19,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  ageModalItemTextSelected: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
    fontSize: 20,
  },
  ageModalItemCheck: {
    position: 'absolute',
    right: 28,
  },
});
