import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS, FONTS } from '../constants';
import { useI18n } from '../localization';

interface SoftUpdateModalProps {
  visible: boolean;
  latestVersion: string;
  message: string;
  onUpdate: () => void;
  onLater: () => void;
}

export function SoftUpdateModal({ visible, latestVersion, message, onUpdate, onLater }: SoftUpdateModalProps) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onLater}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <LinearGradient
              colors={[COLORS.gradientStart, COLORS.gradientEnd]}
              style={styles.iconCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="sparkles" size={26} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>{t('soft_update_title')}</Text>
          <Text style={styles.message}>{message}</Text>
          <Text style={styles.meta}>{t('soft_update_version_label', { version: latestVersion })}</Text>

          <TouchableOpacity style={styles.updateButton} onPress={onUpdate} activeOpacity={0.85}>
            <Text style={styles.updateButtonText}>{t('soft_update_now_button')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.laterButton} onPress={onLater} activeOpacity={0.7}>
            <Text style={styles.laterButtonText}>{t('soft_update_later_button')}</Text>
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
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    color: COLORS.textDim,
    fontFamily: FONTS.regular,
    marginBottom: 20,
  },
  updateButton: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  updateButtonText: {
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
