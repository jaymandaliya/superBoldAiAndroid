const allLabels = require('./labels.all.json') as Record<string, Record<string, string>>;
const enLabels = allLabels.en as Record<string, string>;

const SUPPORTED_LANGUAGE_CODES = [
  'en', 'hi', 'gu', 'mr', 'bn', 'ta', 'te', 'kn', 'ml', 'pa', 'ur',
  'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'sv', 'no', 'fi',
  'ru', 'uk',
  'ar', 'fa', 'tr', 'he',
  'zh', 'ja', 'ko', 'th', 'vi', 'id',
  'sw', 'am',
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

const translations: Record<SupportedLanguageCode, Record<string, string>> =
  allLabels as Record<SupportedLanguageCode, Record<string, string>>;

const interpolate = (template: string, params?: Record<string, string | number>) => {
  if (!params) return template;

  return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, key) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
};

export const getSupportedLanguageCodes = (): readonly SupportedLanguageCode[] => SUPPORTED_LANGUAGE_CODES;

export const getLabel = (
  key: string,
  language: string,
  params?: Record<string, string | number>,
): string => {
  const normalizedLanguage = (SUPPORTED_LANGUAGE_CODES.includes(language as SupportedLanguageCode)
    ? language
    : 'en') as SupportedLanguageCode;

  const languageTable = translations[normalizedLanguage] || enLabels;
  const raw = languageTable[key] || enLabels[key] || key;

  return interpolate(raw, params);
};

export const hasLabel = (key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(enLabels, key);
};
