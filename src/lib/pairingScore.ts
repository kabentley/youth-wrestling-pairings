import { DAYS_PER_YEAR } from "./constants";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const AGE_ALLOWANCE_PCT_PER_YEAR = 1.0;
const EXPERIENCE_ALLOWANCE_PCT_PER_YEAR = 0.75;
const SKILL_ALLOWANCE_PCT_PER_POINT = 0.5;

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

  const lighter = a.weight <= b.weight ? a : b;
  const heavier = lighter === a ? b : a;

  const ageGapYears = Math.abs(ageGapDays) / DAYS_PER_YEAR;
  let allowancePct = 0;

  if (lighter.birthdate.getTime() < heavier.birthdate.getTime()) {
    allowancePct += ageGapYears * AGE_ALLOWANCE_PCT_PER_YEAR;
  }
  if (lighter.experienceYears > heavier.experienceYears) {
    allowancePct += (lighter.experienceYears - heavier.experienceYears) * EXPERIENCE_ALLOWANCE_PCT_PER_YEAR;
  }
  if (lighter.skill > heavier.skill) {
    allowancePct += (lighter.skill - heavier.skill) * SKILL_ALLOWANCE_PCT_PER_POINT;
  }

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
