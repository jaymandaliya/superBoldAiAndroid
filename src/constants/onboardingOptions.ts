import { OnboardingGoal, OnboardingSkillLevel } from '../types';

export const GOAL_OPTIONS: Array<{
  key: OnboardingGoal;
  labelKey: string;
  subtitleKey: string;
  icon: string;
  englishTitle: string;
}> = [
  {
    key: 'career',
    labelKey: 'username_goal_career',
    subtitleKey: 'username_goal_career_subtitle',
    icon: 'briefcase',
    englishTitle: 'Job & Career',
  },
  {
    key: 'fluency',
    labelKey: 'username_goal_fluency',
    subtitleKey: 'username_goal_fluency_subtitle',
    icon: 'school',
    englishTitle: 'Studies & Exams',
  },
  {
    key: 'travel',
    labelKey: 'username_goal_travel',
    subtitleKey: 'username_goal_travel_subtitle',
    icon: 'airplane',
    englishTitle: 'Travel &\nAbroad',
  },
  {
    key: 'confidence',
    labelKey: 'username_goal_confidence',
    subtitleKey: 'username_goal_confidence_subtitle',
    icon: 'chatbubble-ellipses',
    englishTitle: 'Daily\nConfidence',
  },
];

export const SKILL_OPTIONS: Array<{
  key: OnboardingSkillLevel;
  labelKey: string;
  subtitleKey: string;
  positiveLabelKey: string;
  cardSubtitleKey: string;
}> = [
  {
    key: 'beginner',
    labelKey: 'username_skill_beginner_label',
    subtitleKey: 'username_skill_beginner_subtitle',
    positiveLabelKey: 'username_skill_beginner_positive_label',
    cardSubtitleKey: 'username_skill_beginner_card_subtitle',
  },
  {
    key: 'intermediate',
    labelKey: 'username_skill_intermediate_label',
    subtitleKey: 'username_skill_intermediate_subtitle',
    positiveLabelKey: 'username_skill_intermediate_positive_label',
    cardSubtitleKey: 'username_skill_intermediate_card_subtitle',
  },
  {
    key: 'advanced',
    labelKey: 'username_skill_advanced_label',
    subtitleKey: 'username_skill_advanced_subtitle',
    positiveLabelKey: 'username_skill_advanced_positive_label',
    cardSubtitleKey: 'username_skill_advanced_card_subtitle',
  },
];

export const SKILL_ICONS = ['school-outline', 'trending-up-outline', 'trophy-outline'] as const;
