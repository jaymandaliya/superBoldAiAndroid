import type { TextStyle, ViewStyle } from 'react-native';
import { COLORS, FONTS } from './index';

/** Shared top bar row used on Learn / History / Profile and matching stack screens */
export const GRADIENT_TAB_TOP_BAR: ViewStyle = {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: 20,
  paddingTop: 8,
  paddingBottom: 12,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.border,
};

/** Matches FONTS.bold (Montserrat-Bold) */
export const GRADIENT_TAB_HEADER_TITLE: TextStyle = {
  fontSize: 22,
  color: COLORS.text,
  fontFamily: FONTS.bold,
  letterSpacing: 0.3,
};

/** Content below the top bar (matches LanguageSelection `content` top inset) */
export const GRADIENT_TAB_BODY_PADDING_TOP = 20;
