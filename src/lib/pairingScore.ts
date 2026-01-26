import { DAYS_PER_YEAR } from "./constants";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Allowance units are percentage points applied to the base weight-diff percentage.
const AGE_ALLOWANCE_PCT_PER_YEAR = 0.5;
const EXPERIENCE_ALLOWANCE_PCT_PER_YEAR = 0.25;
const SKILL_ALLOWANCE_PCT_PER_POINT = 0.4;

export type PairingInput = {
  weight: number;
  birthdate: Date;
  experienceYears: number;
  skill: number;
};

export type PairingScoreDetails = {
  wDiff: number;
  wPct: number;
  ageGapDays: number;
  expGap: number;
  skillGap: number;
  allowancePct: number;
  effectiveWeightPct: number;
};

export type PairingScoreOptions = {
  ageAllowancePctPerYear?: number;
  experienceAllowancePctPerYear?: number;
  skillAllowancePctPerPoint?: number;
};

/**
 * Signed day gap: positive when `b` is younger than `a`.
 */
export function signedAgeGapDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Symmetric weight difference as a percentage of the lighter wrestler.
 */
export function weightPctDiff(a: number, b: number) {
  const diff = Math.abs(a - b);
  const base = Math.min(a, b);
  return base <= 0 ? 999 : (100 * diff) / base;
}

/**
 * Returns a signed fairness score from wrestler A's perspective.
 *
 * Sign: positive means A has the advantage; negative means B has the advantage.
 * Magnitude: base weight % difference (lighter as denominator) adjusted by
 * signed allowances for age, experience, and skill.
 */
export function pairingScore(a: PairingInput, b: PairingInput, options?: PairingScoreOptions) {
  const wDiff = b.weight - a.weight;
  const wPct = weightPctDiff(a.weight, b.weight);
  const ageGapDays = signedAgeGapDays(a.birthdate, b.birthdate);
  const expGap = b.experienceYears - a.experienceYears;
  const skillGap = b.skill - a.skill;

  const base = Math.min(a.weight, b.weight);
  const signedWeightPct = base <= 0 ? 999 : (100 * (a.weight - b.weight)) / base;

  let allowancePct = 0;
  const ageAllowance = options?.ageAllowancePctPerYear ?? AGE_ALLOWANCE_PCT_PER_YEAR;
  const expAllowance = options?.experienceAllowancePctPerYear ?? EXPERIENCE_ALLOWANCE_PCT_PER_YEAR;
  const skillAllowance = options?.skillAllowancePctPerPoint ?? SKILL_ALLOWANCE_PCT_PER_POINT;
  allowancePct += (ageGapDays / DAYS_PER_YEAR) * ageAllowance;
  allowancePct += (a.experienceYears - b.experienceYears) * expAllowance;
  allowancePct += (a.skill - b.skill) * skillAllowance;

  const effectiveWeightPct = signedWeightPct + allowancePct;
  return {
    score: effectiveWeightPct,
    details: {
      wDiff,
      wPct,
      ageGapDays,
      expGap,
      skillGap,
      allowancePct,
      effectiveWeightPct,
    } satisfies PairingScoreDetails,
  };
}
