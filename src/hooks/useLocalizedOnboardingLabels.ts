import { useEffect, useState } from 'react';
import { getLocalizedOnboardingOptions } from '../localization/onboardingTranslations';
import { GOAL_OPTIONS, SKILL_OPTIONS } from '../constants/onboardingOptions';
import { OnboardingGoal, OnboardingSkillLevel } from '../types';

/** Native-language display labels for the goal/skill options, keyed the same as GOAL_OPTIONS/SKILL_OPTIONS. */
export function useLocalizedOnboardingLabels(nativeLanguageCode: string) {
  const [goalApiLabels,  setGoalApiLabels]  = useState<Partial<Record<OnboardingGoal, string>>>({});
  const [skillApiLabels, setSkillApiLabels] = useState<Partial<Record<OnboardingSkillLevel, string>>>({});

  useEffect(() => {
    const options = getLocalizedOnboardingOptions(nativeLanguageCode);
    if (!options) return;

    const mappedGoals:  Partial<Record<OnboardingGoal, string>>        = {};
    const mappedSkills: Partial<Record<OnboardingSkillLevel, string>>  = {};
    GOAL_OPTIONS.forEach((item, i) => {
      if (options.learningReasons[i]) mappedGoals[item.key] = options.learningReasons[i].text;
    });
    SKILL_OPTIONS.forEach((item, i) => {
      if (options.currentSkillLevels[i]) mappedSkills[item.key] = options.currentSkillLevels[i].text;
    });
    setGoalApiLabels(mappedGoals);
    setSkillApiLabels(mappedSkills);
  }, [nativeLanguageCode]);

  return { goalApiLabels, skillApiLabels };
}
