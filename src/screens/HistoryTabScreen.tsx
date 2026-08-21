import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabParamList, RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, AUTH_URL } from '../constants';
import {
  GRADIENT_TAB_TOP_BAR,
  GRADIENT_TAB_HEADER_TITLE,
  GRADIENT_TAB_BODY_PADDING_TOP,
} from '../constants/screenHeader';
import { CrashlyticsHelper, AuthStorage } from '../helpers';
import { useI18n } from '../localization';
import { Learning } from '../types';
import { LANGUAGES } from '../constants/languages';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'HistoryTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function HistoryTabScreen({ navigation }: Props) {
  const { t } = useI18n();

  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLearnings = useCallback(async () => {
    try {
      const authToken = await AuthStorage.getToken();
      if (!authToken) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${AUTH_URL}/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        const arr: Learning[] = data.learnings ?? (data.learning ? [data.learning] : []);
        setLearnings(arr);
      }
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'HistoryTab.fetchLearnings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchLearnings();
    }, [fetchLearnings])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchLearnings();
  };

  const handleViewLearning = async (learning: Learning) => {
    const authToken = await AuthStorage.getToken();
    if (authToken) {
      navigation.navigate('ConversationHistory', {
        learningId: String(learning.id),
        authToken,
      });
    }
  };

  const getLangInfo = (code: string) => {
    const lang = LANGUAGES.find(l => l.code === code);
    return { flag: lang?.flag ?? '🌐', name: lang?.englishName ?? code };
  };

  const formatLastSession = (dateStr?: string | null): string => {
    if (!dateStr) return 'No sessions yet';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[COLORS.bg, COLORS.bgLight, COLORS.bgLighter]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('history_tab_header_title')}</Text>
          </View>
          <View style={styles.loadingSkeletonWrap}>
            {[1, 2, 3].map(i => (
              <View key={i} style={styles.loadingSkeletonCard}>
                <View style={styles.loadingSkeletonRow}>
                  <View style={styles.loadingSkeletonDot} />
                  <View style={styles.loadingSkeletonTextBlock}>
                    <View style={styles.loadingSkeletonLineLg} />
                    <View style={styles.loadingSkeletonLineSm} />
                  </View>
                </View>
              </View>
            ))}
            <ActivityIndicator size="small" color={COLORS.primaryLight} style={styles.loadingIndicator} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (learnings.length === 0) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[COLORS.bg, COLORS.bgLight, COLORS.bgLighter]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('history_tab_header_title')}</Text>
          </View>
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="book-outline" size={48} color={COLORS.textDim} />
            </View>
            <Text style={styles.emptyTitle}>{t('history_tab_no_history_title')}</Text>
            <Text style={styles.emptySubtitle}>{t('history_tab_no_history_subtitle')}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.bg, COLORS.bgLight, COLORS.bgLighter]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('history_tab_header_title')}</Text>
        </View>

        <FlatList
          data={learnings}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primaryLight}
            />
          }
          ListHeaderComponent={
            <Text style={styles.sectionLabel}>
              {learnings.length === 1 ? '1 Course' : `${learnings.length} Courses`}
            </Text>
          }
          renderItem={({ item }) => {
            const { flag, name } = getLangInfo(item.target_language);
            return (
              <TouchableOpacity
                style={styles.learningCard}
                onPress={() => handleViewLearning(item)}
                activeOpacity={0.75}
              >
                <View style={styles.langIconBox}>
                  <Text style={styles.langFlag}>{flag}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.langName}>{name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>Level {item.current_level}</Text>
                    <View style={styles.metaDot} />
                    <Text style={styles.metaText}>{item.total_sessions} sessions</Text>
                    <View style={styles.metaDot} />
                    <Text style={styles.metaText}>{formatLastSession(item.last_session_at)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
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

  // Header
  header: {
    ...GRADIENT_TAB_TOP_BAR,
  },
  headerTitle: {
    ...GRADIENT_TAB_HEADER_TITLE,
  },

  // Loading skeleton
  loadingSkeletonWrap: {
    paddingHorizontal: 20,
    paddingTop: GRADIENT_TAB_BODY_PADDING_TOP,
  },
  loadingSkeletonCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  loadingSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingSkeletonDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgLighter,
    marginRight: 12,
  },
  loadingSkeletonTextBlock: {
    flex: 1,
  },
  loadingSkeletonLineLg: {
    height: 12,
    width: '55%',
    borderRadius: 6,
    backgroundColor: COLORS.bgLighter,
    marginBottom: 8,
  },
  loadingSkeletonLineSm: {
    height: 10,
    width: '75%',
    borderRadius: 6,
    backgroundColor: COLORS.bgLighter,
  },
  loadingIndicator: {
    marginTop: 10,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 60,
  },
  emptyIconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textDim,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 20,
  },

  // List
  listContent: {
    paddingHorizontal: 20,
    paddingTop: GRADIENT_TAB_BODY_PADDING_TOP,
    paddingBottom: 120,
  },
  sectionLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // Learning card
  learningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  langIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bgLighter,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  langFlag: {
    fontSize: 24,
  },
  cardBody: {
    flex: 1,
  },
  langName: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textDim,
    fontFamily: FONTS.regular,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.textDim,
  },
});
