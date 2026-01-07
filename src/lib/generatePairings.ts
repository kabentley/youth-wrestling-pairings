import { db } from "./db";

export type PairingSettings = {
  maxAgeGapDays: number;
  maxWeightDiffPct: number;
  firstYearOnlyWithFirstYear: boolean;

  allowSameTeamMatches: boolean;

  balanceTeamPairs: boolean;
  balancePenalty: number;
  matchesPerWrestler?: number;
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
  await db.bout.deleteMany({ where: { meetId } });

  const meetTeams = await db.meetTeam.findMany({
    where: { meetId },
    include: { team: { include: { wrestlers: true } } },
  });
  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId },
    select: { wrestlerId: true, status: true },
  });
  const absentIds = new Set(
    statuses
      .filter(s => s.status === "NOT_COMING")
      .map(s => s.wrestlerId)
  );
  const wrestlers = meetTeams
    .flatMap(mt => mt.team.wrestlers)
    .filter(w => w.active && !absentIds.has(w.id));

  const excluded = await db.excludedPair.findMany({ where: { meetId } });
  const excludedSet = new Set(excluded.map(e => `${e.aId}|${e.bId}`));
  function isExcluded(aId: string, bId: string) {
    const [a, b] = aId < bId ? [aId, bId] : [bId, aId];
    return excludedSet.has(`${a}|${b}`);
  }

  const matchCounts = new Map<string, number>();
  const paired = new Set<string>();

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

  const pool = [...wrestlers].sort((a, b) => a.weight - b.weight);
  const newBouts: { redId: string; greenId: string; score: number; notes: string }[] = [];
  const targetMatches = Math.max(1, Math.floor(settings.matchesPerWrestler ?? 1));

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

  function canUse(id: string) {
    return (matchCounts.get(id) ?? 0) < targetMatches;
  }
  function pairKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  function pickMatches(allowSameTeam: boolean) {
    let made = true;
    while (made) {
      made = false;
      for (let i = 0; i < pool.length; i++) {
        const a = pool[i];
        if (!canUse(a.id)) continue;

        let bestJ = -1;
        let bestScore = Number.POSITIVE_INFINITY;
        let bestNotes = "";

        for (let j = i + 1; j < Math.min(pool.length, i + 20); j++) {
          const b = pool[j];
          if (!canUse(b.id)) continue;
          if (!eligible(a, b, allowSameTeam)) continue;
          if (paired.has(pairKey(a.id, b.id))) continue;

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
          matchCounts.set(a.id, (matchCounts.get(a.id) ?? 0) + 1);
          matchCounts.set(b.id, (matchCounts.get(b.id) ?? 0) + 1);
          paired.add(pairKey(a.id, b.id));
          newBouts.push({ redId: a.id, greenId: b.id, score: bestScore, notes: bestNotes });
          if (a.teamId !== b.teamId) bumpPair(a.teamId, b.teamId);
          made = true;
        }
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
      notes: b.notes,
    })),
  });

  return { created: newBouts.length, totalWrestlers: wrestlers.length };
}
