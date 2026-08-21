import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-simple-toast';
import LinearGradient from 'react-native-linear-gradient';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabParamList, RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, AUTH_URL, SUPPORT_EMAIL } from '../constants';
import {
  GRADIENT_TAB_TOP_BAR,
  GRADIENT_TAB_HEADER_TITLE,
  GRADIENT_TAB_BODY_PADDING_TOP,
} from '../constants/screenHeader';
import { LANGUAGES } from '../constants/languages';
import { CrashlyticsHelper, AuthStorage } from '../helpers';
import { WebViewModal } from '../components';
import { useI18n } from '../localization';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Linking } from 'react-native';

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'ProfileTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ProfileScreen({ navigation, route }: Props) {
  const { t, setLanguage } = useI18n();
  const { user, existingLearning } = route.params;
  const [webViewUrl, setWebViewUrl] = useState('');
  const [webViewTitle, setWebViewTitle] = useState('');
  const [showWebView, setShowWebView] = useState(false);

  const nativeLanguage = existingLearning
    ? LANGUAGES.find(l => l.code === existingLearning.native_language)
    : null;
  const targetLanguage = existingLearning
    ? LANGUAGES.find(l => l.code === existingLearning.target_language)
    : null;

  const handleLogout = async () => {
    Alert.alert(
      t('profile_logout_alert_title'),
      t('profile_logout_alert_message'),
      [
        { text: t('profile_logout_cancel_button'), style: 'cancel' },
        {
          text: t('profile_logout_confirm_button'),
          onPress: async () => {
            CrashlyticsHelper.log('User logging out');
            await setLanguage('en');
            await AuthStorage.clearAuth();
            navigation.getParent()?.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile_delete_account_title'),
      t('profile_delete_account_message'),
      [
        { text: t('profile_delete_cancel_button'), style: 'cancel' },
        {
          text: t('profile_delete_confirm_button'),
          style: 'destructive',
          onPress: async () => {
            CrashlyticsHelper.log('User initiated account deletion');
            try {
              const token = await AuthStorage.getToken();
              if (token) {
                await fetch(`${AUTH_URL}/delete-account`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
              }
              Toast.show(t('profile_account_deleted_toast'), Toast.SHORT);
              CrashlyticsHelper.log('Account deleted');
            } catch (error) {
              CrashlyticsHelper.recordError(error as Error, 'handleDeleteAccount');
            } finally {
              await AuthStorage.clearAuth();
              navigation.getParent()?.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            }
          },
        },
      ]
    );
  };

  const openLink = (url: string, title: string) => {
    setWebViewUrl(url);
    setWebViewTitle(title);
    setShowWebView(true);
  };

  const userInitial = user.name
    ? user.name.charAt(0).toUpperCase()
    : user.phone_number.charAt(0);

  const streakDays = Math.max(
    1,
    Math.min(existingLearning?.current_level ?? 1, Math.floor((existingLearning?.total_sessions ?? 0) / 2) + 1)
  );
  const levelsCompleted = Math.min(existingLearning?.current_level ?? 0, 30);
  const lifetimeXp = Math.round((existingLearning?.total_practice_time ?? 0) / 12);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.bg, COLORS.bgLight, COLORS.bgLighter]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile_header_title')}</Text>
        </View>
        
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            <LinearGradient
              colors={[COLORS.gradientStart, COLORS.gradientEnd]}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarText}>{userInitial}</Text>
            </LinearGradient>
            <Text style={styles.userName}>
              {user.name || t('profile_user_fallback_name')}
            </Text>
            <Text style={styles.userPhone}>{user.phone_number}</Text>
            {(existingLearning?.is_premium ||
              (existingLearning?.purchased_tiers &&
               existingLearning.purchased_tiers.length > 0)) && (
              <View style={styles.premiumBadge}>
                <MaterialCommunityIcons name="crown" size={14} color={COLORS.accent} />
                <Text style={styles.premiumBadgeText}>{t('profile_premium_badge')}</Text>
              </View>
            )}
          </View>

          {/* Learning Stats */}
      

          {/* Menu Items */}
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{t('profile_settings_section_title')}</Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('ContactSupport')}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(0, 212, 255, 0.16)' }]}>
                  <Ionicons name="mail-outline" size={18} color={COLORS.primaryLight} />
                </View>
                <Text style={styles.menuItemText}>{t('profile_menu_contact_support')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => openLink('https://scaleu.ai/terms', t('profile_menu_terms_of_service'))}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(108, 92, 231, 0.16)' }]}>
                  <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
                </View>
                <Text style={styles.menuItemText}>{t('profile_menu_terms_of_service')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => openLink('https://scaleu.ai/privacy', t('profile_menu_privacy_policy'))}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(16, 185, 129, 0.16)' }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.success} />
                </View>
                <Text style={styles.menuItemText}>{t('profile_menu_privacy_policy')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>

          {/* Account Actions */}
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{t('profile_account_section_title')}</Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(245, 158, 11, 0.16)' }]}>
                  <Ionicons name="log-out-outline" size={18} color={COLORS.warning} />
                </View>
                <Text style={styles.menuItemText}>{t('profile_menu_logout')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(255, 77, 103, 0.16)' }]}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </View>
                <Text style={[styles.menuItemText, { color: COLORS.error }]}>{t('profile_menu_delete_account')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>

          <Text style={styles.versionText}>{t('profile_version_text')}</Text>
        </ScrollView>
      </SafeAreaView>

      <WebViewModal
        visible={showWebView}
        onClose={() => setShowWebView(false)}
        url={webViewUrl}
        title={webViewTitle}
      />
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
  },
  header: {
    ...GRADIENT_TAB_TOP_BAR,
  },
  headerTitle: {
    ...GRADIENT_TAB_HEADER_TITLE,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: GRADIENT_TAB_BODY_PADDING_TOP,
    paddingBottom: 120,
  },

  // Profile Header
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: COLORS.borderStrong,
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarText: {
    fontSize: 32,
    color: COLORS.text,
    fontFamily: FONTS.bold,
  },
  userName: {
    fontSize: 24,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  userPhone: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: FONTS.medium,
    letterSpacing: 0.5,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  premiumBadgeText: {
    fontSize: 13,
    color: COLORS.accent,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.5,
  },

  // Stats Card
  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 22,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 26,
    color: COLORS.text,
    fontFamily: FONTS.bold,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },
  languagePair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  languagePairFlag: {
    fontSize: 20,
  },
  languagePairText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    marginLeft: 4,
  },
  snapshotRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  snapshotCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgSecondary,
    paddingVertical: 10,
    alignItems: 'center',
  },
  snapshotValue: {
    fontSize: 18,
    color: COLORS.text,
    fontFamily: FONTS.bold,
  },
  snapshotLabel: {
    marginTop: 3,
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },

  // Section
  sectionTitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },

  // Menu Section
  menuSection: {
    marginBottom: 28,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuItemText: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.medium,
    letterSpacing: 0.2,
  },
  menuItemDanger: {
    borderColor: 'rgba(255, 77, 103, 0.25)',
  },

  versionText: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textDim,
    fontFamily: FONTS.regular,
    marginTop: 8,
  },
});
