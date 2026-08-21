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
import { COLORS, FONTS, SUPPORT_EMAIL } from '../constants';
import { CrashlyticsHelper, NetworkHelper } from '../helpers';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectionError'>;

export function ConnectionErrorScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const [retrying, setRetrying] = useState(false);
  const { errorMessage } = route.params || {};

  const handleRetry = async () => {
    setRetrying(true);
    CrashlyticsHelper.log('User retrying connection');
    
    const isConnected = await NetworkHelper.checkConnection();
    if (!isConnected) {
      Toast.show(t('connection_no_internet_toast'), Toast.SHORT);
      setRetrying(false);
      return;
    }
    
    // Go back to language selection to retry connection
    navigation.goBack();
    setRetrying(false);
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t('connection_header_title')}</Text>
        </View>

        <View style={styles.contentSection}>
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="power-plug-off-outline" size={64} color={COLORS.textMuted} style={styles.stateIcon} />
            <Text style={styles.noInternetTitle}>{t('connection_error_title')}</Text>
            <Text style={styles.noInternetDescription}>
              {errorMessage || t('connection_error_description')}
            </Text>
          </View>

          {retrying ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>{t('connection_retrying_text')}</Text>
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
                  <Text style={styles.authButtonText}>{t('connection_retry_button')}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.authButton, styles.secondaryButton]}
                onPress={handleGoBack}
                activeOpacity={0.8}
              >
                <View style={styles.buttonRow}>
                  <Ionicons name="arrow-back" size={20} color={COLORS.primary} style={styles.buttonIcon} />
                  <Text style={styles.secondaryButtonText}>{t('connection_go_back_button')}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.supportButton}
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Connection Issue&body=I'm having trouble connecting to SuperBold.`)}
              >
                <Text style={styles.supportButtonText}>{t('connection_contact_support_button')}</Text>
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
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  authButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: FONTS.bold,
  },
  secondaryButtonText: {
    color: COLORS.primary,
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
  supportButton: {
    alignItems: 'center',
    padding: 12,
  },
  supportButtonText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.regular,
    textDecorationLine: 'underline',
  },
});