import { THEME } from './designSystem';

export const APP_THEME = {
  colors: {
    primary: THEME.colors.primaryStart,
    primaryLight: THEME.colors.primaryEnd,
    primaryDark: '#E5522A',
    secondary: THEME.colors.accent,
    accent: THEME.colors.accent,

    success: THEME.colors.success,
    error: THEME.colors.error,
    warning: THEME.colors.warning,

    bg: THEME.colors.bgPrimary,
    bgSecondary: THEME.colors.bgSecondary,
    bgTertiary: THEME.colors.bgTertiary,
    bgLight: THEME.colors.bgSecondary,
    bgLighter: THEME.colors.bgTertiary,
    bgCard: THEME.colors.card,
    card: THEME.colors.card,

    text: THEME.colors.textPrimary,
    textSecondary: THEME.colors.textSecondary,
    textMuted: THEME.colors.textSecondary,
    textDim: THEME.colors.textMuted,

    border: THEME.colors.border,
    borderStrong: THEME.colors.borderStrong,
    overlay: THEME.colors.overlay,

    gradientStart: THEME.colors.primaryStart,
    gradientEnd: THEME.colors.primaryEnd,

    // Bottom tabs
    tabBarBackground: THEME.colors.bgSecondary,
    tabBarBorder: THEME.colors.border,
    tabBarActive: THEME.colors.primaryStart,
    tabBarInactive: 'rgba(255,255,255,0.38)',

    // Language selector modal
    modalSelectedBg: 'rgba(255, 91, 46, 0.10)',
    modalSelectedBorder: THEME.colors.primaryStart,
  },
  fonts: {
    regular: THEME.typography.fontFamily.regular,
    medium: THEME.typography.fontFamily.medium,
    semiBold: THEME.typography.fontFamily.semiBold,
    bold: THEME.typography.fontFamily.bold,
    light: THEME.typography.fontFamily.light,
  },
} as const;
