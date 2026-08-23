import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS, FONTS } from '../constants';
import { Language } from '../types';
import { useI18n } from '../localization';

interface LanguageConfirmSheetProps {
  visible: boolean;
  title: string;
  label: string;
  language: Language | null;
  placeholder: string;
  onPressChange: () => void;
  ctaLabel: string;
  onConfirm: () => void;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  onBack?: () => void;
  icon?: string;
}

export function LanguageConfirmSheet({
  visible,
  title,
  label,
  language,
  placeholder,
  onPressChange,
  ctaLabel,
  onConfirm,
  ctaDisabled,
  ctaLoading,
  onBack,
  icon = 'school-outline',
}: LanguageConfirmSheetProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  // Plain absolutely-positioned overlay rather than a native <Modal> — this sits on
  // top of the still-mounted LanguageSelector <Modal> without stacking two native
  // Modal windows, which on RN/Android can leave the second one non-interactive.
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>

        <TouchableOpacity style={styles.langRow} onPress={onPressChange} activeOpacity={0.8}>
          <View style={styles.langRowLeft}>
            <View style={styles.langIcon}>
              <Ionicons name={icon as any} size={18} color={COLORS.primaryLight} />
            </View>
            <View>
              <Text style={styles.langLabel}>{label}</Text>
              {language ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.langValue}>{language.flag}</Text>
                  <Text style={[styles.langValue, { marginLeft: 8 }]}>{language.name}</Text>
                </View>
              ) : (
                <Text style={styles.langPlaceholder}>{placeholder}</Text>
              )}
            </View>
          </View>
          <Text style={styles.changeText}>{language ? t('language_confirm_change_button') : ''}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, (ctaDisabled || ctaLoading) && styles.btnDisabled]}
          onPress={onConfirm}
          activeOpacity={0.85}
          disabled={ctaDisabled || ctaLoading}
        >
          {ctaLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.btnText}>{ctaLabel}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    zIndex: 50,
    elevation: 50,
  },
  sheet: {
    backgroundColor: '#121826',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: '#fff',
    lineHeight: 30,
    flex: 1,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 16,
    marginBottom: 20,
  },
  langRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  langIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,91,46,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  langLabel: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    marginBottom: 3,
  },
  langValue: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    color: '#fff',
  },
  langPlaceholder: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: 'rgba(255,255,255,0.3)',
  },
  changeText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.primaryLight,
    marginRight: 4,
  },
  btn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    fontSize: 17,
    fontFamily: FONTS.semiBold,
    color: '#fff',
    letterSpacing: 0.3,
  },
});
