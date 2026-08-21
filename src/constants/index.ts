// ============================================
// Configuration Constants
// ============================================
import { APP_THEME } from '../theme/appTheme';

// Toggle this for local vs production
const IS_DEVELOPMENT = false;  // Automatically true in dev, false in production builds

export const YOUR_COMPUTER_IP = '192.168.1.5';  // Your local IP (for dev only)
export const IS_REAL_DEVICE = true;

// Production URL
const PRODUCTION_URL = 'https://learning-backend.scaleu.ai';

// Automatically switch between dev and pro duction
export const BASE_URL = IS_DEVELOPMENT
  ? `http://${YOUR_COMPUTER_IP}:8000`  // Local development
  : PRODUCTION_URL;                      // Production
// export const BASE_URL = PRODUCTION_URL;  // Force production for now
export const BACKEND_URL = `${BASE_URL}/api/token`;

export const AUTH_URL = `${BASE_URL}/api/auth`;

export const LEARNING_URL = `${BASE_URL}/api/learnings`;

// User API endpoints (not under /api/auth)
export const USER_API_URL = `${BASE_URL}/api/user`;

// Learning session endpoints (at /learning, not /api/learnings)
export const LEARNING_SESSION_URL = `${BASE_URL}/learning`;

// Companion / 1:1 Talking endpoints
export const COMPANION_QUOTA_URL = `${BASE_URL}/api/companion/quota`;
export const COMPANION_SESSION_START_URL = `${BASE_URL}/api/companion/session/start`;
export const COMPANION_SESSION_END_URL = `${BASE_URL}/api/companion/session/end`;




// Legal URLs
export const TERMS_URL = 'https://scaleu.ai/terms';
export const PRIVACY_URL = 'https://scaleu.ai/privacy';
export const SUPPORT_EMAIL = 'support@superboldai.com';

// Connection Config
export const MAX_RETRIES = 3;
export const RETRY_DELAY_BASE = 1000;
export const CONNECTION_TIMEOUT = 30000;

// Font Family Constants
export const FONTS = {
  regular: APP_THEME.fonts.regular,
  medium: APP_THEME.fonts.medium,
  semiBold: APP_THEME.fonts.semiBold,
  bold: APP_THEME.fonts.bold,
  light: APP_THEME.fonts.light,
};

// Color Palette
export const COLORS = {
  ...APP_THEME.colors,
};

// Storage Keys
export const AUTH_TOKEN_KEY = '@auth_token';
export const PERMISSION_SHOWN_KEY = '@permission_shown';