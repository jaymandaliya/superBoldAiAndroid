import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PROFESSIONAL_COLORS } from '../roomTheme';

type Props = {
  title?: string;
  message: string;
  transactionId?: string;
  onContinueLearning: () => void;
  onGoToDashboard: () => void;
};

export function PaymentSuccessOverlay({
  title = 'Payment successful',
  message,
  transactionId,
  onContinueLearning,
  onGoToDashboard,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        style={[
          styles.scroll,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.iconHalo}>
            <View style={styles.iconWrap}>
              <Ionicons name="checkmark" size={32} color={PROFESSIONAL_COLORS.primary} />
            </View>
          </View>
          <Text style={styles.eyebrow}>Payment confirmed</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {transactionId ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaLabel}>Reference</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {transactionId}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.primaryButton} onPress={onContinueLearning} activeOpacity={0.88}>
            <Text style={styles.primaryButtonText}>Continue to learning</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={onGoToDashboard} activeOpacity={0.88}>
            <Text style={styles.secondaryButtonText}>Back to dashboard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1200,
    backgroundColor: PROFESSIONAL_COLORS.overlay,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  iconHalo: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 184, 122, 0.12)',
    marginBottom: 14,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PROFESSIONAL_COLORS.success,
  },
  eyebrow: {
    color: PROFESSIONAL_COLORS.success,
    fontSize: 12,
    fontFamily: 'IBMPlexSans-SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 22,
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
    marginBottom: 14,
  },
  message: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Regular',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 18,
  },
  metaPill: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    alignItems: 'center',
    marginBottom: 22,
  },
  metaLabel: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 11,
    fontFamily: 'IBMPlexSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  meta: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 13,
    fontFamily: 'IBMPlexSans-SemiBold',
    maxWidth: '100%',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: PROFESSIONAL_COLORS.primary,
    borderRadius: 16,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  primaryButtonText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 16,
    fontFamily: 'Montserrat-SemiBold',
  },
  secondaryButton: {
    width: '100%',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.borderLight,
    backgroundColor: PROFESSIONAL_COLORS.bgLight,
  },
  secondaryButtonText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Medium',
  },
});
