import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { COLORS, FONTS, MAX_RETRIES } from '../constants';
import { useI18n } from '../localization';

interface LoadingScreenProps {
  message?: string;
  retryCount?: number;
  onCancel?: () => void;
  showCancel?: boolean;
}

export function LoadingScreen({ 
  message,
  retryCount = 0,
  onCancel,
  showCancel = false,
}: LoadingScreenProps) {
  const { t } = useI18n();
  const resolvedMessage = message || t('loading_default_message');

  return (
    <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{resolvedMessage}</Text>
          {retryCount > 0 && (
            <Text style={styles.retryText}>
              {t('loading_retry_attempt', { current: retryCount + 1, total: MAX_RETRIES + 1 })}
            </Text>
          )}
          {showCancel && onCancel && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>{t('loading_cancel_button')}</Text>
            </TouchableOpacity>
          )}
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
  retryText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 8,
  },
  cancelButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: COLORS.error,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
});