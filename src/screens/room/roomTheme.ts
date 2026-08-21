import { Dimensions } from 'react-native';
import { THEME } from '../../theme/designSystem';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export { SCREEN_WIDTH, SCREEN_HEIGHT };

export const PROFESSIONAL_COLORS = {
  primary: THEME.colors.bgPrimary,
  primaryLight: THEME.colors.bgSecondary,
  secondary: THEME.colors.primaryEnd,
  secondaryLight: THEME.colors.primaryEnd,
  accent: THEME.colors.accent,
  success: THEME.colors.success,
  warning: THEME.colors.warning,
  error: THEME.colors.error,
  info: '#4B7BEC',
  bgDark: THEME.colors.bgPrimary,
  bgMedium: THEME.colors.bgSecondary,
  bgLight: THEME.colors.bgTertiary,
  bgCard: THEME.colors.card,
  textPrimary: THEME.colors.textPrimary,
  textSecondary: THEME.colors.textSecondary,
  textTertiary: THEME.colors.textMuted,
  textMuted: THEME.colors.textMuted,
  border: THEME.colors.border,
  borderLight: THEME.colors.borderStrong,
  divider: THEME.colors.border,
  online: THEME.colors.success,
  offline: THEME.colors.textMuted,
  connecting: THEME.colors.accent,
  overlay: THEME.colors.overlay,
  shadow: 'rgba(27, 34, 48, 0.12)',
  gradientStart: THEME.colors.bgPrimary,
  gradientMid: THEME.colors.bgSecondary,
  gradientEnd: THEME.colors.bgTertiary,
} as const;
