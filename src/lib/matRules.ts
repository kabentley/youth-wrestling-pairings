"use client";

/** Base rule definition used for mat configuration UIs. */
export type MatRuleBase = {
  color?: string | null;
  minExperience: number;
  maxExperience: number;
  minAge: number;
  maxAge: number;
};

/** A mat rule with its mat index (0-based in storage/UI logic). */
export type MatRule = MatRuleBase & {
  matIndex: number;
};

/**
 * Seed/default mat rules used when a team has not configured custom rules.
 *
 * Values are intentionally broad; teams typically adjust these to match their
 * league and gym layout.
 */
export const DEFAULT_MAT_RULES: MatRuleBase[] = [
  { color: "#90EE90", minExperience: 0, maxExperience: 0, minAge: 0, maxAge: 8.5 },
  { color: "#FF0000", minExperience: 1, maxExperience: 2, minAge: 8, maxAge: 10 },
  { color: "#ADD8E6", minExperience: 1, maxExperience: 10, minAge: 8, maxAge: 20 },
  { color: "#A52A2A", minExperience: 1, maxExperience: 10, minAge: 9, maxAge: 18 },
  { color: "#FFA500", minExperience: 1, maxExperience: 10, minAge: 0, maxAge: 20 },
  { color: "#2e7d32", minExperience: 0, maxExperience: 10, minAge: 0, maxAge: 20 },
  { color: "#8E44AD", minExperience: 0, maxExperience: 10, minAge: 0, maxAge: 20 },
  { color: "#00ACC1", minExperience: 0, maxExperience: 10, minAge: 0, maxAge: 20 },
];
