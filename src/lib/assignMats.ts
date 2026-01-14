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

export type MatWrestler = {
  id: string;
  teamId: string;
  birthdate: Date;
  experienceYears: number;
  first?: string | null;
  last?: string | null;
};

function matchesMatRule(bout: { redId: string; greenId: string }, rule: MatRule, wMap: Map<string, MatWrestler>, meetDate: Date) {
  const red = wMap.get(bout.redId);
  const green = wMap.get(bout.greenId);
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

function isHomeBout(bout: { redId: string; greenId: string }, wMap: Map<string, MatWrestler>, homeTeamId: string | null) {
  if (!homeTeamId) return false;
  const red = wMap.get(bout.redId);
  const green = wMap.get(bout.greenId);
  return Boolean(red?.teamId === homeTeamId || green?.teamId === homeTeamId);
}

export function getEligibleMatIndexes(
  bout: { redId: string; greenId: string },
  mats: { boutIds: string[]; rule: MatRule }[],
  wMap: Map<string, MatWrestler>,
  meetDate: Date,
  homeTeamId: string | null,
) {
  const homeBout = isHomeBout(bout, wMap, homeTeamId);
  const indexes: number[] = [];
  for (let idx = 0; idx < mats.length; idx++) {
    if (homeBout && idx !== 0) continue;
    if (matchesMatRule(bout, mats[idx].rule, wMap, meetDate)) {
      indexes.push(idx);
    }
  }
  return { indexes };
}

function pickLeastLoadedMat(mats: { boutIds: string[]; rule: MatRule }[]) {
  return mats.reduce((best, _, idx) =>
    mats[idx].boutIds.length < mats[best].boutIds.length ? idx : best,
    0,
  );
}

export async function assignMatsForMeet(meetId: string, s: MatSettings = {}) {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { date: true, meetTeams: { select: { teamId: true } }, homeTeamId: true, numMats: true },
  });
  const homeTeamId = meet?.homeTeamId ?? null;

  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ score: "asc" }],
  });

  const teamIds = meet?.meetTeams.map(mt => mt.teamId) ?? [];
  const wrestlers = await db.wrestler.findMany({
    where: { teamId: { in: teamIds } },
    select: { id: true, teamId: true, birthdate: true, experienceYears: true, first: true, last: true },
  });
  const wMap = new Map(wrestlers.map(w => [w.id, w]));

  await db.bout.updateMany({ where: { meetId }, data: { mat: null, order: null } });

  const numMats = Math.max(MIN_MATS, s.numMats ?? meet?.numMats ?? DEFAULT_MAT_COUNT);

  const teamRules = homeTeamId
    ? await db.teamMatRule.findMany({
        where: { teamId: homeTeamId },
        orderBy: { matIndex: "asc" },
      })
    : [];
  const homeTeamPrefs = homeTeamId
    ? await db.team.findUnique({
        where: { id: homeTeamId },
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

  function matPenalty(bout: { redId: string; greenId: string }, matIdx: number) {
    const rule = mats[matIdx].rule;
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
    if (eligible) {
      p += (expPenalty + agePenalty) * RANGE_PENALTY_SCALE;
    } else {
      p += INELIGIBLE_PENALTY;
    }

    if (homeTeamPrefs?.homeTeamPreferSameMat && homeTeamId) {
      const isHomeBout =
        red?.teamId === homeTeamId ||
        green?.teamId === homeTeamId;
      if (isHomeBout && homeTeamMatIdx !== null && homeTeamMatIdx !== matIdx) {
        p += HOME_TEAM_PENALTY;
      }
    }

    p += mats[matIdx].boutIds.length * 0.01;
    return p;
  }

  for (const b of bouts) {
    const { indexes: eligibleMats } = getEligibleMatIndexes(b, mats, wMap, meetDate, homeTeamId);
    let bestMat = eligibleMats.length > 0 ? eligibleMats[0] : pickLeastLoadedMat(mats);
    if (eligibleMats.length > 0) {
      let best = Number.POSITIVE_INFINITY;
      for (const m of eligibleMats) {
        const p = matPenalty(b, m);
        if (p < best) {
          best = p;
          bestMat = m;
        }
      }
    }

    const order = mats[bestMat].boutIds.length + 1;
    mats[bestMat].boutIds.push(b.id);

    await db.bout.update({
      where: { id: b.id },
      data: {
        mat: bestMat + 1,
        order,
        originalMat: b.originalMat ?? (bestMat + 1),
      },
    });

    if (homeTeamPrefs?.homeTeamPreferSameMat && homeTeamId) {
      const red = getWrestler(b.redId);
      const green = getWrestler(b.greenId);
      const isHomeBout =
        red?.teamId === homeTeamId ||
        green?.teamId === homeTeamId;
      if (isHomeBout && homeTeamMatIdx === null) homeTeamMatIdx = bestMat;
    }
  }

  return { assigned: bouts.length, numMats };
}
