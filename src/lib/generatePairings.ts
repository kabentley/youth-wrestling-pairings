import { db } from "./db";

export type PairingSettings = {
  maxAgeGapDays: number;
  maxWeightDiffPct: number;
  firstYearOnlyWithFirstYear: boolean;

  allowSameTeamMatches: boolean;

  balanceTeamPairs: boolean;
  balancePenalty: number;
};

function daysBetween(a: Date, b: Date) {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}
function weightPctDiff(a: number, b: number) {
  const diff = Math.abs(a - b);
  const base = Math.min(a, b);
  return base <= 0 ? 999 : (100 * diff) / base;
}

export async function generatePairingsForMeet(meetId: string, settings: PairingSettings) {
  await db.bout.deleteMany({ where: { meetId, locked: false } });

  const meetTeams = await db.meetTeam.findMany({
    where: { meetId },
    include: { team: { include: { wrestlers: true } } },
  });
  const wrestlers = meetTeams.flatMap(mt => mt.team.wrestlers);

  const excluded = await db.excludedPair.findMany({ where: { meetId } });
  const excludedSet = new Set(excluded.map(e => `${e.aId}|${e.bId}`));
  function isExcluded(aId: string, bId: string) {
    const [a, b] = aId < bId ? [aId, bId] : [bId, aId];
    return excludedSet.has(`${a}|${b}`);
  }

  const locked = await db.bout.findMany({ where: { meetId, locked: true } });
  const used = new Set<string>();

  const pairCount = new Map<string, number>();
  function teamPairKey(t1: string, t2: string) {
    return t1 < t2 ? `${t1}|${t2}` : `${t2}|${t1}`;
  }
  function bumpPair(t1: string, t2: string) {
    const k = teamPairKey(t1, t2);
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }
  function getPairCount(t1: string, t2: string) {
    return pairCount.get(teamPairKey(t1, t2)) ?? 0;
  }

  for (const b of locked) {
    used.add(b.redId);
    used.add(b.greenId);
    const red = wrestlers.find(w => w.id === b.redId);
    const green = wrestlers.find(w => w.id === b.greenId);
    if (red && green && red.teamId !== green.teamId) bumpPair(red.teamId, green.teamId);
  }

  const pool = [...wrestlers].sort((a, b) => a.weight - b.weight);
  const newBouts: { redId: string; greenId: string; score: number; notes: string }[] = [];

  function baseScore(a: any, b: any) {
    const ageGap = daysBetween(a.birthdate, b.birthdate);
    const wPct = weightPctDiff(a.weight, b.weight);
    const wDiff = Math.abs(a.weight - b.weight);
    const expGap = Math.abs(a.experienceYears - b.experienceYears);
    const skillGap = Math.abs(a.skill - b.skill);

    const score =
      4 * (wDiff / 10) +
      2 * (ageGap / 365) +
      2 * (expGap / 3) +
      2 * (skillGap / 3);

    return { score, ageGap, wPct, wDiff, expGap, skillGap };
  }

  function eligible(a: any, b: any, allowSameTeam: boolean) {
    if (!allowSameTeam && a.teamId === b.teamId) return false;
    if (isExcluded(a.id, b.id)) return false;

    const ageGap = daysBetween(a.birthdate, b.birthdate);
    if (ageGap > settings.maxAgeGapDays) return false;

    const wPct = weightPctDiff(a.weight, b.weight);
    if (wPct > settings.maxWeightDiffPct) return false;

    if (settings.firstYearOnlyWithFirstYear) {
      const aFirst = a.experienceYears <= 0;
      const bFirst = b.experienceYears <= 0;
      if (aFirst !== bFirst) return false;
    }
    return true;
  }

  function pickMatches(allowSameTeam: boolean) {
    for (let i = 0; i < pool.length; i++) {
      const a = pool[i];
      if (used.has(a.id)) continue;

      let bestJ = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestNotes = "";

      for (let j = i + 1; j < Math.min(pool.length, i + 20); j++) {
        const b = pool[j];
        if (used.has(b.id)) continue;
        if (!eligible(a, b, allowSameTeam)) continue;

        const d = baseScore(a, b);

        let penalty = 0;
        if (settings.balanceTeamPairs && a.teamId !== b.teamId) {
          const c = getPairCount(a.teamId, b.teamId);
          penalty += settings.balancePenalty * c;
        }
        if (a.teamId === b.teamId) penalty += 10;

        const score = d.score + penalty;

        if (score < bestScore) {
          bestScore = score;
          bestJ = j;
          bestNotes =
            `wDiff=${d.wDiff.toFixed(1)} ageGapDays=${d.ageGap} expGap=${d.expGap} skillGap=${d.skillGap} wPct=${d.wPct.toFixed(1)}%` +
            (penalty ? ` penalty=${penalty.toFixed(2)}` : "");
        }
      }

      if (bestJ >= 0) {
        const b = pool[bestJ];
        used.add(a.id);
        used.add(b.id);
        newBouts.push({ redId: a.id, greenId: b.id, score: bestScore, notes: bestNotes });
        if (a.teamId !== b.teamId) bumpPair(a.teamId, b.teamId);
      }
    }
  }

  pickMatches(false);
  if (settings.allowSameTeamMatches) pickMatches(true);

  await db.bout.createMany({
    data: newBouts.map(b => ({
      meetId,
      redId: b.redId,
      greenId: b.greenId,
      type: "counting",
      score: b.score,
      locked: false,
      notes: b.notes,
    })),
  });

  return { created: newBouts.length, totalWrestlers: wrestlers.length, locked: locked.length };
}
