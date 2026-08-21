import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AuthStorage } from '../helpers';
import { getLabel } from './translations';

interface I18nContextValue {
  language: string;
  setLanguage: (language: string) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: async () => undefined,
  t: (key: string) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState('en');

  useEffect(() => {
    const loadLanguage = async () => {
      const savedLanguage = await AuthStorage.getAppLanguage();
      if (savedLanguage) {
        setLanguageState(savedLanguage);
      }
    };

    void loadLanguage();
  }, []);

  const setLanguage = async (nextLanguage: string) => {
    setLanguageState(nextLanguage);
    await AuthStorage.saveAppLanguage(nextLanguage);
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key: string, params?: Record<string, string | number>) => getLabel(key, language, params),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
