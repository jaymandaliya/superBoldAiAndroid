import { useEffect, useState } from 'react';
import { AuthStorage } from '../helpers';
import { useI18n } from '../localization';

/**
 * Resolves the native-language code the same way every onboarding step needs it:
 * the live i18n selection wins (user just picked it), falling back to the learning
 * record, then to whatever was last persisted for this user, then 'en'.
 */
export function useResolvedNativeLanguage(
  userId: string,
  existingLearningNativeLanguage?: string | null,
): string {
  const { language } = useI18n();
  const [resolved, setResolved] = useState(language || existingLearningNativeLanguage || 'en');

  useEffect(() => {
    let cancelled = false;

    if (language) {
      setResolved(language);
      return;
    }
    if (existingLearningNativeLanguage) {
      setResolved(existingLearningNativeLanguage);
      return;
    }

    AuthStorage.getLanguageContext(userId).then(savedContext => {
      if (!cancelled) setResolved(savedContext?.nativeLanguage || 'en');
    });

    return () => { cancelled = true; };
  }, [language, existingLearningNativeLanguage, userId]);

  return resolved;
}
