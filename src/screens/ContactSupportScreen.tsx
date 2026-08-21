import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS } from '../constants';
import { useI18n } from '../localization';
import {
  GRADIENT_TAB_TOP_BAR,
  GRADIENT_TAB_HEADER_TITLE,
  GRADIENT_TAB_BODY_PADDING_TOP,
} from '../constants/screenHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'ContactSupport'>;

export function ContactSupportScreen({ navigation }: Props) {
  const { t } = useI18n();
  const supportEmail = 'support@superboldai.com';
  const supportPhone = '+91 9929131988';

  const handleEmailPress = () => {
    Linking.openURL(`mailto:${supportEmail}`);
  };

  const handlePhonePress = () => {
    Linking.openURL(`tel:${supportPhone}`);
  };

  return (
    <LinearGradient
      colors={[COLORS.bg, COLORS.bgLight, COLORS.bgLighter]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('contact_support_header_title')}</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon Section */}
          <View style={styles.iconSection}>
            <LinearGradient
              colors={[COLORS.gradientStart, COLORS.gradientEnd]}
              style={styles.iconCircle}
            >
              <MaterialCommunityIcons name="headset" size={48} color={COLORS.text} />
            </LinearGradient>
          </View>

          {/* Title & Description */}
          <Text style={styles.title}>{t('contact_support_title')}</Text>
          <Text style={styles.description}>
            {t('contact_support_description')}
          </Text>

          {/* Contact Options */}
          <View style={styles.contactSection}>
            {/* Email Card */}
            <LinearGradient
              colors={['rgba(0, 212, 255, 0.16)', 'rgba(0, 212, 255, 0.06)']}
              style={styles.contactCard}
            >
              <TouchableOpacity
                style={styles.cardBackground}
                onPress={handleEmailPress}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={[styles.cardIcon, { backgroundColor: 'rgba(0, 212, 255, 0.2)' }]}>
                    <Ionicons name="mail" size={24} color={COLORS.primaryLight} />
                  </View>
                  <View style={styles.cardDetails}>
                    <Text style={styles.cardTitle}>{t('contact_support_email_title')}</Text>
                    <Text style={styles.cardValue}>{supportEmail}</Text>
                    <Text style={styles.cardSubtitle}>{t('contact_support_email_subtitle')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textDim} />
                </View>
              </TouchableOpacity>
            </LinearGradient>

            {/* Phone Card */}
            <LinearGradient
              colors={['rgba(16, 185, 129, 0.16)', 'rgba(16, 185, 129, 0.06)']}
              style={styles.contactCard}
            >
              <TouchableOpacity
                style={styles.cardBackground}
                onPress={handlePhonePress}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={[styles.cardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                    <Ionicons name="call" size={24} color={COLORS.success} />
                  </View>
                  <View style={styles.cardDetails}>
                    <Text style={styles.cardTitle}>{t('contact_support_phone_title')}</Text>
                    <Text style={styles.cardValue}>{supportPhone}</Text>
                    <Text style={styles.cardSubtitle}>{t('contact_support_phone_subtitle')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textDim} />
                </View>
              </TouchableOpacity>
            </LinearGradient>
          </View>

          {/* Info Section */}
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>{t('contact_support_why_title')}</Text>
            
            <View style={styles.infoItem}>
              <View style={styles.infoIcon}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>{t('contact_support_quick_responses_title')}</Text>
                <Text style={styles.infoItemDesc}>{t('contact_support_quick_responses_desc')}</Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <View style={styles.infoIcon}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>{t('contact_support_expert_title')}</Text>
                <Text style={styles.infoItemDesc}>{t('contact_support_expert_desc')}</Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <View style={styles.infoIcon}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>{t('contact_support_available_title')}</Text>
                <Text style={styles.infoItemDesc}>{t('contact_support_available_desc')}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
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
  header: {
    ...GRADIENT_TAB_TOP_BAR,
  },
  backButton: {
    padding: 8,
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerTitle: {
    ...GRADIENT_TAB_HEADER_TITLE,
    flex: 1,
    textAlign: 'left',
  },
  headerRightSpacer: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: GRADIENT_TAB_BODY_PADDING_TOP + 8,
    paddingBottom: 64,
    gap: 24,
  },
  iconSection: {
    alignItems: 'center',
    marginBottom: 0,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 0,
  },
  contactSection: {
    marginBottom: 0,
    gap: 12,
  },
  contactCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardBackground: {
    padding: 16,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardDetails: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textDim,
    fontFamily: FONTS.regular,
  },
  infoSection: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoTitle: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoItemTitle: {
    fontSize: 14,
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
    marginBottom: 2,
  },
  infoItemDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
});