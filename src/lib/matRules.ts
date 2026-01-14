"use client";

export type MatRuleBase = {
  color?: string | null;
  minExperience: number;
  maxExperience: number;
  minAge: number;
  maxAge: number;
};

export type MatRule = MatRuleBase & {
  matIndex: number;
};

export const DEFAULT_MAT_RULES: MatRuleBase[] = [
  { color: "#90EE90", minExperience: 0, maxExperience: 0, minAge: 0, maxAge: 8.5 },
  { color: "#FF0000", minExperience: 1, maxExperience: 2, minAge: 8.5, maxAge: 10.5 },
  { color: "#ADD8E6", minExperience: 2, maxExperience: 4, minAge: 10.5, maxAge: 12.5 },
  { color: "#A52A2A", minExperience: 4, maxExperience: 10, minAge: 12.5, maxAge: 20 },
  { color: "#FFA500", minExperience: 0, maxExperience: 10, minAge: 0, maxAge: 20 },
];
