import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-simple-toast';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS } from '../constants';
import { NetworkHelper } from '../helpers';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = NativeStackScreenProps<RootStackParamList, 'NoInternet'>;

export function NoInternetScreen({ navigation }: Props) {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    const isConnected = await NetworkHelper.checkConnection();
    setChecking(false);
    
    if (isConnected) {
      navigation.replace('Login');
    } else {
      Toast.show(t('no_internet_still_no_connection_toast'), Toast.SHORT);
    }
  };

  return (
    <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t('no_internet_header_title')}</Text>
        </View>

        <View style={styles.contentSection}>
          <View style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={64} color={COLORS.textMuted} style={styles.stateIcon} />
            <Text style={styles.noInternetTitle}>{t('no_internet_title')}</Text>
            <Text style={styles.noInternetDescription}>
              {t('no_internet_description')}
            </Text>
          </View>

          {checking ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>{t('no_internet_checking_text')}</Text>
            </View>
          ) : (
            <View style={styles.actionSection}>
              <TouchableOpacity
                style={[styles.authButton, styles.primaryButton]}
                onPress={handleRetry}
                activeOpacity={0.8}
              >
                <View style={styles.buttonRow}>
                  <Ionicons name="refresh-outline" size={20} color={COLORS.text} style={styles.buttonIcon} />
                  <Text style={styles.authButtonText}>{t('no_internet_try_again_button')}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => Linking.openSettings()}
              >
                <Text style={styles.settingsButtonText}>{t('no_internet_open_settings_button')}</Text>
              </TouchableOpacity>
            </View>
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
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
    color: COLORS.text,
    fontFamily: FONTS.bold,
  },
  contentSection: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  stateCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
  },
  stateIcon: {
    marginBottom: 20,
  },
  noInternetEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  noInternetTitle: {
    fontSize: 24,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    marginBottom: 12,
  },
  noInternetDescription: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  loadingRow: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  actionSection: {
    marginTop: 16,
    gap: 12,
  },
  authButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  settingsButton: {
    padding: 12,
    alignSelf: 'center',
  },
  settingsButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    textDecorationLine: 'underline',
  },
});