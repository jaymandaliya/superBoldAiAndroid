export type CompanionPackage = {
  key: string;
  amount: string;
  minutes: number;
  displayName: string;
  description: string;
  highlight: string | null;
};

export type CompanionPricingConfig = {
  packages: CompanionPackage[];
};
