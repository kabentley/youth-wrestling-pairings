import { MAX_MATCHES_PER_WRESTLER } from "./constants";
import { db } from "./db";
import { pairingScore, weightPctDiff } from "./pairingScore";
import { pairKey } from "./pairKey";

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

  /** If true, only allow matchups within the same sex (girls vs girls, boys vs boys). */
  girlsWrestleGirls: boolean;

  /** If true, include matchups that were previously rejected. */
  allowRejectedMatchups?: boolean;

  /** Target matches per wrestler for this generation pass. */
  matchesPerWrestler?: number;
  /** Target used when pruning extra newly-created bouts. */
  pruneTargetMatches?: number;
  /** Upper bound for matches per wrestler (hard cap per generation pass). */
  maxMatchesPerWrestler?: number;
  /** Optional home team used to order red/green assignments. */
  homeTeamId?: string | null;
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
  const teamOrder = (() => {
    const order = new Map<string, number>();
    const homeId = settings.homeTeamId ?? null;
    const allTeams = meetTeams.map(mt => mt.team);
    const label = (team: (typeof allTeams)[number]) =>
      (team.symbol || team.name || team.id).toLowerCase();
    let idx = 0;
    if (homeId) {
      order.set(homeId, idx);
      idx += 1;
    }
    const ordered = allTeams
      .filter(team => team.id !== homeId)
      .sort((a, b) => label(a).localeCompare(label(b)));
    for (const team of ordered) {
      if (!order.has(team.id)) {
        order.set(team.id, idx);
        idx += 1;
      }
    }
    return order;
  })();
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
  if (!settings.allowRejectedMatchups) {
    const rejectedPairs = await db.meetRejectedPair.findMany({
      where: { meetId },
      select: { pairKey: true },
    });
    for (const rejected of rejectedPairs) {
      paired.add(rejected.pairKey);
    }
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
  const pruneTargetMatches = settings.pruneTargetMatches === undefined
    ? undefined
    : Math.min(
        maxMatches,
        Math.max(1, Math.floor(settings.pruneTargetMatches)),
      );

  /**
   * Applies hard eligibility filters that remove impossible/illegal pairings
   * before scoring (age gap, weight gap, first-year rules, same-team rules).
   */
  function eligible(a: any, b: any, allowSameTeam: boolean) {
    if (!allowSameTeam && a.teamId === b.teamId) return false;
    if (settings.girlsWrestleGirls && a.isGirl !== b.isGirl) return false;

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

  function compareWrestlers(a: typeof pool[number], b: typeof pool[number]) {
    const aOrder = teamOrder.get(a.teamId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = teamOrder.get(b.teamId) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aLast = a.last.toLowerCase();
    const bLast = b.last.toLowerCase();
    const lastCompare = aLast.localeCompare(bLast);
    if (lastCompare !== 0) return lastCompare;
    const aFirst = a.first.toLowerCase();
    const bFirst = b.first.toLowerCase();
    const firstCompare = aFirst.localeCompare(bFirst);
    if (firstCompare !== 0) return firstCompare;
    return a.id.localeCompare(b.id);
  }
  function orderBout(a: typeof pool[number], b: typeof pool[number], scoreFromA: number) {
    const compare = compareWrestlers(a, b);
    if (compare <= 0) {
      return { redId: a.id, greenId: b.id, pairingScore: scoreFromA };
    }
    return { redId: b.id, greenId: a.id, pairingScore: -scoreFromA };
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
        newBouts.push(orderBout(a, best.b, best.score));
      }
    }
  }

  await db.bout.createMany({
    data: newBouts.map(b => ({
      meetId,
      redId: b.redId,
      greenId: b.greenId,
      pairingScore: b.pairingScore,
      source: null,
    })),
  });

  /**
   * Pruning pass: remove the newest bouts where both wrestlers are above the
   * prune target, which keeps everyone close to the configured match count.
   */
  const toDelete: string[] = [];
  if (pruneTargetMatches !== undefined) {
    const allBoutsForPrune = await db.bout.findMany({
      where: { meetId },
      select: { id: true, redId: true, greenId: true, createdAt: true, source: true },
      orderBy: { createdAt: "desc" },
    });
    const totalMatchCounts = new Map<string, number>();
    for (const bout of allBoutsForPrune) {
      totalMatchCounts.set(bout.redId, (totalMatchCounts.get(bout.redId) ?? 0) + 1);
      totalMatchCounts.set(bout.greenId, (totalMatchCounts.get(bout.greenId) ?? 0) + 1);
    }
    for (const bout of allBoutsForPrune) {
      if (bout.source) continue;
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
  }

  return {
    created: newBouts.length,
    totalWrestlers: wrestlers.length,
    removedOverTarget: toDelete.length,
  };
}
