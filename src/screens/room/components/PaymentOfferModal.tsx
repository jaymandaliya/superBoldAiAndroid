import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Learning } from '../../../types';
import { PricingConfig, PricingTier } from '../../../services/pricingTypes';
import { PROFESSIONAL_COLORS, SCREEN_HEIGHT } from '../roomTheme';
import { FONTS } from '../../../constants';
import { LANGUAGES } from '../../../constants/languages';

type Props = {
  learning: Learning;
  pricingConfig: PricingConfig | null;
  isPricingLoading: boolean;
  isProcessingPayment: boolean;
  showPaymentOptions: boolean;
  trialJustEnded: boolean;
  onBack: () => void;
  onPayTier: (tierKey: string, amount: string, levels: string) => void;
  getRequiredTier: () => PricingTier | null;
  getPurchasedMaxLevelFromPricing: (currentLearning: Learning) => number;
};

export function PaymentOfferModal({
  learning,
  pricingConfig,
  isPricingLoading,
  isProcessingPayment,
  trialJustEnded,
  onBack,
  onPayTier,
  getRequiredTier,
  getPurchasedMaxLevelFromPricing,
}: Props) {
  const insets = useSafeAreaInsets();
  const hasPricingCatalog = Boolean(pricingConfig?.tiers?.length && pricingConfig?.bundle?.key);
  const maxModalHeight = Math.min(
    SCREEN_HEIGHT * 0.88,
    SCREEN_HEIGHT - insets.top - insets.bottom - 24,
  );

  const requiredTier = getRequiredTier();
  void getPurchasedMaxLevelFromPricing;

  // Track which card the user has selected — default to bundle always
  const [selectedKey, setSelectedKey] = React.useState<'tier' | 'bundle'>('bundle');

  // Derived values for the CTA button based on selected card
  const selectedAmount =
    selectedKey === 'bundle'
      ? pricingConfig?.bundle?.amount
      : requiredTier?.amount;

  const selectedTierKey =
    selectedKey === 'bundle'
      ? pricingConfig?.bundle?.key
      : requiredTier?.key;

  const selectedLevels =
    selectedKey === 'bundle'
      ? pricingConfig?.bundle?.levels
      : requiredTier?.levels;

  const targetLangName =
    LANGUAGES.find(l => l.code === learning.target_language)?.englishName ??
    LANGUAGES.find(l => l.code === learning.target_language)?.name ??
    learning.target_language.toUpperCase();

  const title = requiredTier
    ? 'Unlock This Level'
    : trialJustEnded
      ? 'Free Trial Ended'
      : 'Choose Your Plan';

  const description = requiredTier
    ? `Unlock Levels ${requiredTier.levels} to continue your ${targetLangName} learning journey.`
    : trialJustEnded
      ? 'Your 2-minute free trial has ended. Choose a plan to continue learning!'
      : `Get started with ${targetLangName} — choose a plan below to begin your first session.`;

  return (
    <View
      style={[
        styles.modalOverlay,
        {
          paddingTop: 12 + insets.top,
          paddingBottom: 12 + insets.bottom,
          paddingHorizontal: 20,
        },
      ]}
    >
      <View style={[styles.modalContent, { maxHeight: maxModalHeight }]}>

        {/* Icon */}
        <View style={styles.iconWrap}>
          <LinearGradient
            colors={['#FF5B2E', '#FF8A4C']}
            style={styles.iconCircle}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="lock-closed" size={28} color="#fff" />
          </LinearGradient>
        </View>

        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalDescription}>{description}</Text>

        {isPricingLoading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={PROFESSIONAL_COLORS.secondary} />
            <Text style={styles.loadingText}>Loading latest pricing…</Text>
          </View>
        )}

        {!hasPricingCatalog && !isPricingLoading && (
          <Text style={styles.errorText}>
            Unable to load pricing right now. Please try again in a moment.
          </Text>
        )}

        {/* Tier card — selectable */}
        {requiredTier && (
          <TouchableOpacity
            style={[
              styles.tierCard,
              selectedKey === 'tier' && styles.tierCardSelected,
            ]}
            onPress={() => setSelectedKey('tier')}
            disabled={isProcessingPayment}
            activeOpacity={0.85}
          >
            <View style={styles.tierCardHeader}>
              {/* Left: title + levels, flex:1 so it never pushes price off screen */}
              <View style={styles.tierCardHeaderLeft}>
                <Text style={styles.tierCardTitle}>{requiredTier.displayName}</Text>
                <Text style={styles.tierCardLevels}>Levels {requiredTier.levels}</Text>
              </View>
              <Text style={styles.tierCardPrice}>₹{requiredTier.amount}</Text>
            </View>
            <Text style={styles.tierCardDescription}>{requiredTier.description}</Text>
          </TouchableOpacity>
        )}

        {/* Full course bundle — selectable */}
        {pricingConfig?.bundle && (
          <TouchableOpacity
            style={[
              styles.bundleCard,
              selectedKey === 'bundle' && styles.bundleCardSelected,
            ]}
            onPress={() => setSelectedKey('bundle')}
            disabled={isProcessingPayment}
            activeOpacity={0.85}
          >
            {/* Title row: name on left (flex:1), price pinned right (flexShrink:0) */}
            <View style={styles.tierCardHeader}>
              <View style={styles.tierCardHeaderLeft}>
                <Text style={styles.tierCardTitle}>{pricingConfig.bundle.displayName}</Text>
              </View>
              <Text style={[styles.tierCardPrice, styles.bundlePrice]}>
                ₹{pricingConfig.bundle.amount}
              </Text>
            </View>
            {/* Levels row */}
            <View style={styles.bundleSubRow}>
              <Text style={styles.tierCardLevels}>All {pricingConfig.bundle.levels} Levels</Text>
            </View>
            <Text style={[styles.tierCardDescription, { marginTop: 8 }]}>
              {pricingConfig.bundle.description}
            </Text>
          </TouchableOpacity>
        )}

        {/* CTA — amount reflects whichever card is selected */}
        {(requiredTier || pricingConfig?.bundle) && selectedTierKey && selectedAmount && selectedLevels && (
          <TouchableOpacity
            style={[styles.ctaButton, isProcessingPayment && styles.ctaButtonDisabled]}
            onPress={() => onPayTier(selectedTierKey, selectedAmount, selectedLevels)}
            disabled={isProcessingPayment}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={isProcessingPayment ? ['#161D2E', '#161D2E'] : ['#FF5B2E', '#FF8A4C']}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
            {isProcessingPayment ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="card-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.ctaText}>Pay ₹{selectedAmount}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Back to home — secondary button at bottom */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={16} color={PROFESSIONAL_COLORS.secondary} />
          <Text style={styles.backButtonText}>Back to home</Text>
        </TouchableOpacity>

        {isProcessingPayment && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
            <Text style={styles.processingText}>Processing payment…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PROFESSIONAL_COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: PROFESSIONAL_COLORS.bgCard,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 24,
    fontFamily: FONTS.bold,
    marginBottom: 10,
    textAlign: 'center',
  },
  modalDescription: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.regular,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingWrap: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  loadingText: {
    color: PROFESSIONAL_COLORS.textTertiary,
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  errorText: {
    color: PROFESSIONAL_COLORS.textTertiary,
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginBottom: 16,
  },

  // ── Tier card ──────────────────────────────────────────────────────────────
  tierCard: {
    backgroundColor: PROFESSIONAL_COLORS.accent + '18',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: PROFESSIONAL_COLORS.border,
    padding: 20,
    width: '100%',
    marginBottom: 16,
  },
  tierCardSelected: {
    borderColor: PROFESSIONAL_COLORS.accent,
  },

  // ── Bundle card ────────────────────────────────────────────────────────────
  bundleCard: {
    backgroundColor: 'rgba(123,97,255,0.12)',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: PROFESSIONAL_COLORS.border,
    padding: 20,
    width: '100%',
    marginBottom: 16,
  },
  bundleCardSelected: {
    borderColor: '#7B61FF',
  },

  // ── Shared card internals ──────────────────────────────────────────────────
  tierCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  // Left column grows to fill space; price never gets squeezed off screen
  tierCardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  tierCardTitle: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 18,
    fontFamily: FONTS.bold,
    marginBottom: 4,
  },
  tierCardLevels: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  tierCardPrice: {
    color: PROFESSIONAL_COLORS.accent,
    fontSize: 28,
    fontFamily: FONTS.bold,
    flexShrink: 0,   // never allow price to shrink or clip
  },
  // Bundle uses purple for its price
  bundlePrice: {
    color: '#7B61FF',
  },
  tierCardDescription: {
    color: PROFESSIONAL_COLORS.textTertiary,
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
  bundleSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  bundleBadge: {
    backgroundColor: '#7B61FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bundleBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONTS.bold,
  },
  bundleSavings: {
    color: '#7B61FF',
    fontSize: 13,
    fontFamily: FONTS.bold,
    marginTop: 6,
  },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginBottom: 12,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: FONTS.bold,
  },

  // ── Back button ───────────────────────────────────────────────────────────
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  backButtonText: {
    color: PROFESSIONAL_COLORS.secondary,
    fontSize: 15,
    fontFamily: FONTS.medium,
  },

  // ── Processing overlay ────────────────────────────────────────────────────
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PROFESSIONAL_COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
  },
  processingText: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 16,
    fontFamily: FONTS.medium,
    marginTop: 16,
  },
});