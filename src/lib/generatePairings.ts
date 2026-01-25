import { MAX_MATCHES_PER_WRESTLER } from "./constants";
import { db } from "./db";
import { pairingScore, weightPctDiff } from "./pairingScore";

/**
 * Settings used by the automatic pairing generator.
 *
 * These values are typically derived from team defaults (meet setup) and can be
 * overridden per meet.
 */
export type PairingSettings = {
  /** Maximum allowed age difference (days). */
  maxAgeGapDays: number;
  /** Maximum allowed weight difference (percent). */
  maxWeightDiffPct: number;
  /** If true, first-year wrestlers only pair with first-year wrestlers. */
  firstYearOnlyWithFirstYear: boolean;

  /** If true, allow matchups within the same team. */
  allowSameTeamMatches: boolean;

  /** Target matches per wrestler for this generation pass. */
  matchesPerWrestler?: number;
  /** Target used when pruning extra newly-created bouts. */
  pruneTargetMatches?: number;
  /** Upper bound for matches per wrestler (hard cap per generation pass). */
  maxMatchesPerWrestler?: number;
};

function daysBetween(a: Date, b: Date) {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Generates "counting" bouts for a meet using a greedy, weight-sorted search.
 *
 * The algorithm:
 * - Builds a pool of active wrestlers, excluding `NOT_COMING`.
 * - Avoids duplicates against existing bouts in the meet.
 * - Prefers nearby weights and small age/experience/skill gaps.
 * - Optionally balances team-vs-team pair counts with a configurable penalty.
 *
 * Returns a summary; created bouts are inserted into the database.
 */
export async function generatePairingsForMeet(meetId: string, settings: PairingSettings) {
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
  const matchCounts = new Map<string, number>();
  const paired = new Set<string>();


  const existingBouts = await db.bout.findMany({
    where: { meetId },
    select: { redId: true, greenId: true },
  });
  for (const bout of existingBouts) {
    matchCounts.set(bout.redId, (matchCounts.get(bout.redId) ?? 0) + 1);
    matchCounts.set(bout.greenId, (matchCounts.get(bout.greenId) ?? 0) + 1);
    paired.add(pairKey(bout.redId, bout.greenId));
  }

  const pool = [...wrestlers].sort((a, b) => a.weight - b.weight);
  const newBouts: { redId: string; greenId: string; pairingScore: number }[] = [];
  const maxMatches = Math.min(
    MAX_MATCHES_PER_WRESTLER,
    Math.max(1, Math.floor(settings.maxMatchesPerWrestler ?? MAX_MATCHES_PER_WRESTLER)),
  );
  const targetMatches = Math.min(
    maxMatches,
    Math.max(1, Math.floor(settings.matchesPerWrestler ?? 2)),
  );
  const pruneTargetMatches = Math.min(
    maxMatches,
    Math.max(1, Math.floor(settings.pruneTargetMatches ?? targetMatches)),
  );

  function eligible(a: any, b: any, allowSameTeam: boolean) {
    if (!allowSameTeam && a.teamId === b.teamId) return false;

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

  function pairKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  const wrestlersByTeam = new Map<string, typeof pool>();
  for (const mt of meetTeams) {
    const teamWrestlers = mt.team.wrestlers
      .filter(w => w.active && !absentIds.has(w.id))
      .sort((a, b) => a.weight - b.weight);
    wrestlersByTeam.set(mt.teamId, teamWrestlers);
  }

  for (const mt of meetTeams) {
    const teamRoster = wrestlersByTeam.get(mt.teamId) ?? [];
    for (const a of teamRoster) {
      let currentA = matchCounts.get(a.id) ?? 0;
      if (currentA >= targetMatches) continue;
      const candidates: { b: typeof a; score: number }[] = [];
      for (const b of pool) {
        if (a.id === b.id) continue;
        const currentB = matchCounts.get(b.id) ?? 0;
        if (currentB >= maxMatches) continue;
        if (!eligible(a, b, settings.allowSameTeamMatches)) continue;
        if (paired.has(pairKey(a.id, b.id))) continue;
        const d = pairingScore(a, b);
        candidates.push({
          b,
          score: d.score,
        });
      }
      candidates.sort((x, y) => x.score - y.score);
      for (const candidate of candidates) {
        if (currentA >= targetMatches) break;
        const currentB = matchCounts.get(candidate.b.id) ?? 0;
        if (currentB >= maxMatches) continue;
        matchCounts.set(a.id, (matchCounts.get(a.id) ?? 0) + 1);
        matchCounts.set(candidate.b.id, (matchCounts.get(candidate.b.id) ?? 0) + 1);
        paired.add(pairKey(a.id, candidate.b.id));
        newBouts.push({ redId: a.id, greenId: candidate.b.id, pairingScore: candidate.score });
        currentA += 1;
      }
    }
  }

  await db.bout.createMany({
    data: newBouts.map(b => ({
      meetId,
      redId: b.redId,
      greenId: b.greenId,
      pairingScore: b.pairingScore,
    })),
  });

  const allBouts = await db.bout.findMany({
    where: { meetId },
    select: { id: true, redId: true, greenId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const totalMatchCounts = new Map<string, number>();
  for (const bout of allBouts) {
    totalMatchCounts.set(bout.redId, (totalMatchCounts.get(bout.redId) ?? 0) + 1);
    totalMatchCounts.set(bout.greenId, (totalMatchCounts.get(bout.greenId) ?? 0) + 1);
  }
  const toDelete: string[] = [];
  for (const bout of allBouts) {
    const redCount = totalMatchCounts.get(bout.redId) ?? 0;
    const greenCount = totalMatchCounts.get(bout.greenId) ?? 0;
    if (redCount > pruneTargetMatches && greenCount > pruneTargetMatches) {
      toDelete.push(bout.id);
      totalMatchCounts.set(bout.redId, redCount - 1);
      totalMatchCounts.set(bout.greenId, greenCount - 1);
    }
  }
  if (toDelete.length > 0) {
    await db.bout.deleteMany({ where: { id: { in: toDelete } } });
  }

  return { created: newBouts.length, totalWrestlers: wrestlers.length, removedOverTarget: toDelete.length };
}
