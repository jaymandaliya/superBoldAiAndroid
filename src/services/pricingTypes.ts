export type PricingTier = {
  key: string;
  amount: string;
  levels: string;
  levelStart: number;
  levelEnd: number;
  displayName: string;
  description: string;
};

export type PricingBundle = {
  key: string;
  amount: string;
  levels: string;
  levelCount: number;
  displayName: string;
  discount: string;
  savings: string;
  description: string;
};

export type PricingConfig = {
  tiers: PricingTier[];
  bundle: PricingBundle;
};
