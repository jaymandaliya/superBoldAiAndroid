import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS, FONTS } from '../constants';
import { useI18n } from '../localization';

interface NotificationPermissionModalProps {
  visible: boolean;
  /** True once a real OS prompt has already been shown and declined this app run — the user can no longer be re-prompted natively, only sent to Settings. */
  alreadyDenied: boolean;
  onAllow: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export function NotificationPermissionModal({
  visible,
  alreadyDenied,
  onAllow,
  onOpenSettings,
  onDismiss,
}: NotificationPermissionModalProps) {
  const { t } = useI18n();
  const [requesting, setRequesting] = useState(false);

  const handlePrimaryPress = async () => {
    if (alreadyDenied) {
      onOpenSettings();
      return;
    }
    setRequesting(true);
    try {
      await onAllow();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <LinearGradient
              colors={[COLORS.gradientStart, COLORS.gradientEnd]}
              style={styles.iconCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="notifications" size={26} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>{t('notification_permission_title')}</Text>
          <Text style={styles.message}>
            {alreadyDenied
              ? t('notification_permission_denied_message')
              : t('notification_permission_ask_message')}
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, requesting && styles.primaryButtonDisabled]}
            onPress={handlePrimaryPress}
            activeOpacity={0.85}
            disabled={requesting}
          >
            <Text style={styles.primaryButtonText}>
              {alreadyDenied ? t('notification_permission_open_settings_button') : t('notification_permission_allow_button')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.laterButton} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.laterButtonText}>{t('notification_permission_not_now_button')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconWrap: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
  laterButton: {
    paddingVertical: 8,
  },
  laterButtonText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
});
