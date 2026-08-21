import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../../../localization/I18nProvider';
import { getLabel } from '../../../localization/translations';
import { PROFESSIONAL_COLORS } from '../roomTheme';
import type { TestReport } from './TestOverlay';

type Props = {
  visible: boolean;
  report: TestReport | null;
  onContinue: () => void;
  /** Report headings use this locale when set (learning native); otherwise app UI language. */
  nativeLanguageCode?: string;
};

const CORRECT_COLOR = '#3FB950';
const WRONG_COLOR = '#F85149';
const WARN_COLOR = '#E3A008';

function gradeLabel(
  pct: number,
  tt: (key: string, params?: Record<string, string | number>) => string,
): { label: string; color: string } {
  if (pct >= 90) return { label: tt('test_report_grade_excellent'), color: CORRECT_COLOR };
  if (pct >= 70) return { label: tt('test_report_grade_good'), color: CORRECT_COLOR };
  if (pct >= 50) return { label: tt('test_report_grade_fair'), color: WARN_COLOR };
  return { label: tt('test_report_grade_needs_work'), color: WRONG_COLOR };
}

export function TestReportOverlay({ visible, report, onContinue, nativeLanguageCode }: Props) {
  const insets = useSafeAreaInsets();
  const { language } = useI18n();
  const reportLocale = nativeLanguageCode || language;
  const tt = useMemo(
    () => (key: string, params?: Record<string, string | number>) => getLabel(key, reportLocale, params),
    [reportLocale],
  );

  const pct = report?.percentage ?? 0;
  const score = report?.score ?? 0;
  const total = report?.total ?? 0;
  const { label: grade, color: gradeColor } = gradeLabel(pct, tt);
  const checkpoint = report?.checkpoint;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {!report ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={PROFESSIONAL_COLORS.accent} />
            <Text style={styles.loadingText}>{tt('test_report_calculating_score')}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>

            {/* ── Header ── */}
            <Text style={styles.eyebrow}>
              {checkpoint
                ? tt('test_report_checkpoint_label', { checkpoint })
                : tt('test_report_test_complete')}
            </Text>
            <Text style={styles.title}>{tt('test_report_title')}</Text>

            {/* ── Big score card ── */}
            <View style={[styles.scoreCard, { borderColor: gradeColor }]}>
              <Text style={[styles.scoreGrade, { color: gradeColor }]}>{grade}</Text>
              <Text style={[styles.scoreBig, { color: gradeColor }]}>{pct}%</Text>
              <Text style={styles.scoreFraction}>{score} / {total}</Text>

              {/* Progress bar */}
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: gradeColor }]} />
              </View>
            </View>

            {/* ── Recommendation ── */}
            {report.recommendation ? (
              <View style={styles.recCard}>
                <Text style={styles.recTitle}>{tt('test_report_recommendation_title')}</Text>
                <View style={styles.recRow}>
                  <Text style={styles.recIcon}>💡</Text>
                  <Text style={styles.recText}>{report.recommendation}</Text>
                </View>
              </View>
            ) : null}

            {/* ── CTA ── */}
            <TouchableOpacity style={styles.cta} onPress={onContinue} activeOpacity={0.88}>
              <Text style={styles.ctaText}>{tt('test_report_go_to_dashboard_button')}</Text>
            </TouchableOpacity>

          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PROFESSIONAL_COLORS.bgDark,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 15,
    fontFamily: 'IBMPlexSans-Regular',
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },

  // Header
  eyebrow: {
    color: PROFESSIONAL_COLORS.accent,
    fontSize: 11,
    fontFamily: 'IBMPlexSans-SemiBold',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: PROFESSIONAL_COLORS.textPrimary,
    fontSize: 26,
    fontFamily: 'Montserrat-Bold',
    marginBottom: 24,
    textAlign: 'center',
  },

  // Score card
  scoreCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: PROFESSIONAL_COLORS.bgMedium,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    gap: 4,
  },
  scoreGrade: {
    fontSize: 13,
    fontFamily: 'IBMPlexSans-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  scoreBig: {
    fontSize: 54,
    fontFamily: 'Montserrat-Bold',
    lineHeight: 60,
  },
  scoreFraction: {
    color: PROFESSIONAL_COLORS.textMuted,
    fontSize: 16,
    fontFamily: 'IBMPlexSans-Regular',
    marginBottom: 16,
  },
  barTrack: {
    width: '100%',
    height: 8,
    backgroundColor: PROFESSIONAL_COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },

  // Recommendation (title localized; body is server “rules” text, unchanged)
  recCard: {
    width: '100%',
    backgroundColor: PROFESSIONAL_COLORS.bgMedium,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PROFESSIONAL_COLORS.border,
    padding: 16,
    marginBottom: 32,
    gap: 10,
  },
  recTitle: {
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 12,
    fontFamily: 'IBMPlexSans-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  recIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  recText: {
    flex: 1,
    color: PROFESSIONAL_COLORS.textSecondary,
    fontSize: 14,
    fontFamily: 'IBMPlexSans-Regular',
    lineHeight: 22,
  },

  // CTA
  cta: {
    width: '100%',
    backgroundColor: PROFESSIONAL_COLORS.secondary,
    borderRadius: 16,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Montserrat-SemiBold',
  },
});
