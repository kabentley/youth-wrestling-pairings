import { db } from "./db";

export type MatRule = {
  minExperience: number;
  maxExperience: number;
  minAge: number;
  maxAge: number;
  color?: string;
};

export type MatSettings = {
  numMats?: number;
};

export const DEFAULT_MAT_COUNT = 4;
export const MIN_MATS = 1;

const DEFAULT_RULE: MatRule = {
  minExperience: 0,
  maxExperience: 10,
  minAge: 0,
  maxAge: 100,
};

const RANGE_PENALTY_SCALE = 50;
const INELIGIBLE_PENALTY = 100_000;
const HOME_TEAM_PENALTY = 25;

function ageInYears(birthdate: Date, onDate: Date) {
  const diff = onDate.getTime() - birthdate.getTime();
  return diff / (365.25 * 24 * 60 * 60 * 1000);
}

function rangePenalty(value: number, min: number, max: number) {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

export async function assignMatsForMeet(meetId: string, s: MatSettings = {}) {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { date: true, meetTeams: { select: { teamId: true } }, homeTeamId: true },
  });

  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ score: "asc" }],
  });

  const teamIds = meet?.meetTeams.map(mt => mt.teamId) ?? [];
  const wrestlers = await db.wrestler.findMany({
    where: { teamId: { in: teamIds } },
    select: { id: true, teamId: true, birthdate: true, experienceYears: true },
  });
  const wMap = new Map(wrestlers.map(w => [w.id, w]));

  await db.bout.updateMany({ where: { meetId }, data: { mat: null, order: null } });

  const numMats = Math.max(MIN_MATS, s.numMats ?? meet?.numMats ?? DEFAULT_MAT_COUNT);

  const teamRules = meet?.homeTeamId
    ? await db.teamMatRule.findMany({
        where: { teamId: meet.homeTeamId },
        orderBy: { matIndex: "asc" },
      })
    : [];
  const homeTeamPrefs = meet?.homeTeamId
    ? await db.team.findUnique({
        where: { id: meet.homeTeamId },
        select: { homeTeamPreferSameMat: true },
      })
    : null;

  const baseRules: MatRule[] = teamRules.map(rule => ({
    minExperience: rule.minExperience,
    maxExperience: rule.maxExperience,
    minAge: rule.minAge,
    maxAge: rule.maxAge,
    color: rule.color ?? undefined,
  }));

  let rules: MatRule[] = baseRules.length > 0 ? baseRules.slice(0, numMats) : [];
  if (rules.length < numMats) {
    for (let i = rules.length; i < numMats; i++) {
      rules.push({ ...DEFAULT_RULE });
    }
  }

  const mats: { boutIds: string[]; rule: MatRule }[] = rules.map(rule => ({ boutIds: [], rule }));
  let homeTeamMatIdx: number | null = null;
  const meetDate = meet?.date ?? new Date();

  function getWrestler(id: string) {
    return wMap.get(id) ?? null;
  }

  function matchesRule(bout: { redId: string; greenId: string }, rule: MatRule) {
    const red = getWrestler(bout.redId);
    const green = getWrestler(bout.greenId);
    if (!red || !green) return true;

    const redAge = ageInYears(new Date(red.birthdate), meetDate);
    const greenAge = ageInYears(new Date(green.birthdate), meetDate);

    const expOk =
      red.experienceYears >= rule.minExperience &&
      red.experienceYears <= rule.maxExperience &&
      green.experienceYears >= rule.minExperience &&
      green.experienceYears <= rule.maxExperience;

    const ageOk =
      redAge >= rule.minAge &&
      redAge <= rule.maxAge &&
      greenAge >= rule.minAge &&
      greenAge <= rule.maxAge;

    return expOk && ageOk;
  }

  function matPenalty(bout: { redId: string; greenId: string }, matIdx: number, anyEligible: boolean) {
    const rule = mats[matIdx].rule;
    const nextOrder = mats[matIdx].boutIds.length + 1;
    let p = 0;

    const red = getWrestler(bout.redId);
    const green = getWrestler(bout.greenId);
    const redAge = red ? ageInYears(new Date(red.birthdate), meetDate) : 0;
    const greenAge = green ? ageInYears(new Date(green.birthdate), meetDate) : 0;
    const expPenalty =
      rangePenalty(red?.experienceYears ?? 0, rule.minExperience, rule.maxExperience) +
      rangePenalty(green?.experienceYears ?? 0, rule.minExperience, rule.maxExperience);
    const agePenalty =
      rangePenalty(redAge, rule.minAge, rule.maxAge) +
      rangePenalty(greenAge, rule.minAge, rule.maxAge);

    const eligible = expPenalty === 0 && agePenalty === 0;
    if (anyEligible && !eligible) {
      p += INELIGIBLE_PENALTY;
    } else {
      p += (expPenalty + agePenalty) * RANGE_PENALTY_SCALE;
    }

    if (homeTeamPrefs?.homeTeamPreferSameMat && meet?.homeTeamId) {
      const isHomeBout =
        red?.teamId === meet.homeTeamId ||
        green?.teamId === meet.homeTeamId;
      if (isHomeBout && homeTeamMatIdx !== null && homeTeamMatIdx !== matIdx) {
        p += HOME_TEAM_PENALTY;
      }
    }

    p += mats[matIdx].boutIds.length * 0.01;
    return p;
  }

  for (const b of bouts) {
    const anyEligible = mats.some((_, idx) => matchesRule(b, mats[idx].rule));
    let bestMat = 0;
    let best = Number.POSITIVE_INFINITY;

    for (let m = 0; m < numMats; m++) {
      const p = matPenalty(b, m, anyEligible);
      if (p < best) { best = p; bestMat = m; }
    }

    const order = mats[bestMat].boutIds.length + 1;
    mats[bestMat].boutIds.push(b.id);

    await db.bout.update({ where: { id: b.id }, data: { mat: bestMat + 1, order } });

    if (homeTeamPrefs?.homeTeamPreferSameMat && meet?.homeTeamId) {
      const red = getWrestler(b.redId);
      const green = getWrestler(b.greenId);
      const isHomeBout =
        red?.teamId === meet.homeTeamId ||
        green?.teamId === meet.homeTeamId;
      if (isHomeBout && homeTeamMatIdx === null) homeTeamMatIdx = bestMat;
    }
  }

  return { assigned: bouts.length, numMats };
}
