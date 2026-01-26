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

/** Returns the absolute day difference between two dates (rounded to whole days). */
function daysBetween(a: Date, b: Date) {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Generates "counting" bouts for a meet using a greedy, weight-sorted search.
 *
 * Overview:
 * - Builds a pool of active wrestlers, excluding `NOT_COMING`.
 * - Avoids duplicates against existing bouts in the meet.
 * - Filters candidates by age and weight caps.
 * - Ranks candidates by absolute pairing score (see `pairingScore`).
 *
 * Notes:
 * - `pairingScore` is signed, but auto-pairings compare by absolute value to
 *   find the closest match regardless of advantage direction.
 * - This function writes created bouts to the database and returns a summary.
 */
export async function generatePairingsForMeet(meetId: string, settings: PairingSettings) {
  const league = await db.league.findFirst({
    select: {
      ageAllowancePctPerYear: true,
      experienceAllowancePctPerYear: true,
      skillAllowancePctPerPoint: true,
    },
  });
  const scoreOptions = league ?? undefined;
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

  /**
   * Applies hard eligibility filters that remove impossible/illegal pairings
   * before scoring (age gap, weight gap, first-year rules, same-team rules).
   */
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

  /** Normalizes a pair so A/B and B/A map to the same key. */
  function pairKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  /** Fisher–Yates shuffle for unbiased in-place order randomization. */
  function shuffle<T>(items: T[]) {
    const next = [...items];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }


  // Build a per-team roster to allow per-round shuffling within each team.
  const wrestlersByTeam = new Map<string, typeof pool>();
  for (const mt of meetTeams) {
    const teamWrestlers = mt.team.wrestlers
      .filter(w => w.active && !absentIds.has(w.id));
    wrestlersByTeam.set(mt.teamId, shuffle(teamWrestlers));
  }

  /**
   * Round-based greedy matching:
   * - Each round targets at most one new match per wrestler.
   * - Team order and roster order are randomized each round.
   * - Each wrestler takes the best available candidate by absolute score.
   */
  for (let round = 0; round < targetMatches; round += 1) {
    const shuffledTeams = shuffle(meetTeams);
    const roundRosterByTeam = new Map<string, typeof pool>();
    for (const mt of shuffledTeams) {
      const teamRoster = wrestlersByTeam.get(mt.teamId) ?? [];
      const roundRoster = shuffle(teamRoster);
      roundRosterByTeam.set(mt.teamId, roundRoster);
    }
    for (const mt of shuffledTeams) {
      const roundRoster = roundRosterByTeam.get(mt.teamId) ?? [];
      for (let idx = 0; idx < roundRoster.length; idx += 1) {
        const a = roundRoster[idx];
        const currentA = matchCounts.get(a.id) ?? 0;
        if (currentA >= targetMatches) continue;
        let best: { b: typeof a; score: number } | null = null;
        for (const b of pool) {
          if (a.id === b.id) continue;
          const currentB = matchCounts.get(b.id) ?? 0;
          if (currentB >= maxMatches) continue;
          if (!eligible(a, b, settings.allowSameTeamMatches)) continue;
          if (paired.has(pairKey(a.id, b.id))) continue;
          const d = pairingScore(a, b, scoreOptions ?? undefined);
          if (!best || Math.abs(d.score) < Math.abs(best.score)) {
            best = { b, score: d.score };
          }
        }
        if (!best) continue;
        matchCounts.set(a.id, currentA + 1);
        matchCounts.set(best.b.id, (matchCounts.get(best.b.id) ?? 0) + 1);
        paired.add(pairKey(a.id, best.b.id));
        newBouts.push({ redId: a.id, greenId: best.b.id, pairingScore: best.score });
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

  /**
   * Pruning pass: remove the newest bouts where both wrestlers are above the
   * prune target, which keeps everyone close to the configured match count.
   */
  const allBoutsForPrune = await db.bout.findMany({
    where: { meetId },
    select: { id: true, redId: true, greenId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const totalMatchCounts = new Map<string, number>();
  for (const bout of allBoutsForPrune) {
    totalMatchCounts.set(bout.redId, (totalMatchCounts.get(bout.redId) ?? 0) + 1);
    totalMatchCounts.set(bout.greenId, (totalMatchCounts.get(bout.greenId) ?? 0) + 1);
  }
  const toDelete: string[] = [];
  for (const bout of allBoutsForPrune) {
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

  return {
    created: newBouts.length,
    totalWrestlers: wrestlers.length,
    removedOverTarget: toDelete.length,
  };
}
