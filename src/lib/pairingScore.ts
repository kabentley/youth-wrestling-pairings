import { DAYS_PER_YEAR } from "./constants";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const AGE_ALLOWANCE_PCT_PER_YEAR = 1.0;
const EXPERIENCE_ALLOWANCE_PCT_PER_YEAR = 0.5;
const SKILL_ALLOWANCE_PCT_PER_POINT = 0.25;

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

export function signedAgeGapDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function weightPctDiff(a: number, b: number) {
  const diff = Math.abs(a - b);
  const base = Math.min(a, b);
  return base <= 0 ? 999 : (100 * diff) / base;
}

export function pairingScore(a: PairingInput, b: PairingInput) {
  const wDiff = b.weight - a.weight;
  const wPct = weightPctDiff(a.weight, b.weight);
  const ageGapDays = signedAgeGapDays(a.birthdate, b.birthdate);
  const expGap = b.experienceYears - a.experienceYears;
  const skillGap = b.skill - a.skill;

  const lighter = a.weight < b.weight ? a : b.weight < a.weight ? b : a;
  const heavier = lighter === a ? b : a;

  let allowancePct = 0;

  const signedAgeYears = signedAgeGapDays(lighter.birthdate, heavier.birthdate) / DAYS_PER_YEAR;
  allowancePct += signedAgeYears * AGE_ALLOWANCE_PCT_PER_YEAR;
  allowancePct += (lighter.experienceYears - heavier.experienceYears) * EXPERIENCE_ALLOWANCE_PCT_PER_YEAR;
  allowancePct += (lighter.skill - heavier.skill) * SKILL_ALLOWANCE_PCT_PER_POINT;

  const effectiveWeightPct = Math.abs(wPct - allowancePct);
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
