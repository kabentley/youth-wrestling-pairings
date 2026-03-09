import { MAX_MATCHES_PER_WRESTLER } from "./constants";
import { db } from "./db";
import type { PairingSettings } from "./generatePairings";
import { pairingScore, weightPctDiff } from "./pairingScore";
import { pairKey } from "./pairKey";

export type ScratchPairingSettings = PairingSettings & {
  targetDeficits: Record<string, number>;
};

function daysBetween(a: Date, b: Date) {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Generates replacement bouts for wrestlers who lost matches after scratches.
 *
 * Unlike the full pairing generator, this routine focuses on filling explicit
 * per-wrestler deficits and prefers candidates who also still need matches.
 */
export async function generateScratchPairingsForMeet(meetId: string, settings: ScratchPairingSettings) {
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
  const existingBouts = await db.bout.findMany({
    where: { meetId },
    select: { redId: true, greenId: true },
  });
  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId },
    select: { wrestlerId: true, status: true },
  });

  const attendingIds = new Set(
    statuses
      .filter((entry) => entry.status === "COMING" || entry.status === "LATE" || entry.status === "EARLY")
      .map((entry) => entry.wrestlerId),
  );
  const wrestlers = meetTeams
    .flatMap((entry) => entry.team.wrestlers)
    .filter((wrestler) => wrestler.active && attendingIds.has(wrestler.id));
  const wrestlerMap = new Map(wrestlers.map((wrestler) => [wrestler.id, wrestler]));
  const targetDeficits = new Map(
    Object.entries(settings.targetDeficits)
      .map(([wrestlerId, deficit]) => [wrestlerId, Math.max(0, Math.floor(deficit))] as const)
      .filter(([wrestlerId, deficit]) => deficit > 0 && wrestlerMap.has(wrestlerId)),
  );

  if (targetDeficits.size === 0) {
    return {
      created: 0,
      targetedWrestlers: 0,
      filledTargets: 0,
      unfilledTargets: 0,
      remainingLostMatches: 0,
    };
  }

  const initialDeficits = new Map(targetDeficits);
  const teamOrder = (() => {
    const order = new Map<string, number>();
    const homeId = settings.homeTeamId ?? null;
    const allTeams = meetTeams.map((entry) => entry.team);
    const label = (team: (typeof allTeams)[number]) =>
      (team.symbol || team.name || team.id).toLowerCase();
    let idx = 0;
    if (homeId) {
      order.set(homeId, idx);
      idx += 1;
    }
    const ordered = allTeams
      .filter((team) => team.id !== homeId)
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

  function eligible(a: (typeof pool)[number], b: (typeof pool)[number]) {
    if (!settings.allowSameTeamMatches && a.teamId === b.teamId) return false;
    if (settings.girlsWrestleGirls && a.isGirl !== b.isGirl) return false;
    if (daysBetween(a.birthdate, b.birthdate) > settings.maxAgeGapDays) return false;
    if (weightPctDiff(a.weight, b.weight) > settings.maxWeightDiffPct) return false;
    if (settings.firstYearOnlyWithFirstYear) {
      const aFirst = a.experienceYears <= 0;
      const bFirst = b.experienceYears <= 0;
      if (aFirst !== bFirst) return false;
    }
    return true;
  }

  function compareWrestlers(a: (typeof pool)[number], b: (typeof pool)[number]) {
    const aOrder = teamOrder.get(a.teamId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = teamOrder.get(b.teamId) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const lastCompare = a.last.toLowerCase().localeCompare(b.last.toLowerCase());
    if (lastCompare !== 0) return lastCompare;
    const firstCompare = a.first.toLowerCase().localeCompare(b.first.toLowerCase());
    if (firstCompare !== 0) return firstCompare;
    return a.id.localeCompare(b.id);
  }

  function orderBout(a: (typeof pool)[number], b: (typeof pool)[number], scoreFromA: number) {
    if (compareWrestlers(a, b) <= 0) {
      return { redId: a.id, greenId: b.id, pairingScore: scoreFromA };
    }
    return { redId: b.id, greenId: a.id, pairingScore: -scoreFromA };
  }

  function compareCandidates(
    best: { wrestler: (typeof pool)[number]; score: number } | null,
    next: { wrestler: (typeof pool)[number]; score: number },
  ) {
    if (!best) return -1;
    const bestDeficit = targetDeficits.get(best.wrestler.id) ?? 0;
    const nextDeficit = targetDeficits.get(next.wrestler.id) ?? 0;
    if ((nextDeficit > 0) !== (bestDeficit > 0)) {
      return nextDeficit > 0 ? -1 : 1;
    }
    const bestScore = Math.abs(best.score);
    const nextScore = Math.abs(next.score);
    if (nextScore !== bestScore) return nextScore - bestScore;
    const bestCount = matchCounts.get(best.wrestler.id) ?? 0;
    const nextCount = matchCounts.get(next.wrestler.id) ?? 0;
    if (nextCount !== bestCount) return nextCount - bestCount;
    return compareWrestlers(next.wrestler, best.wrestler);
  }

  while ([...targetDeficits.values()].some((value) => value > 0)) {
    let madeProgress = false;
    const targets = pool
      .filter((wrestler) => (targetDeficits.get(wrestler.id) ?? 0) > 0)
      .sort((a, b) => {
        const deficitDiff = (targetDeficits.get(b.id) ?? 0) - (targetDeficits.get(a.id) ?? 0);
        if (deficitDiff !== 0) return deficitDiff;
        const countDiff = (matchCounts.get(a.id) ?? 0) - (matchCounts.get(b.id) ?? 0);
        if (countDiff !== 0) return countDiff;
        return compareWrestlers(a, b);
      });

    for (const wrestler of targets) {
      const deficit = targetDeficits.get(wrestler.id) ?? 0;
      const currentMatches = matchCounts.get(wrestler.id) ?? 0;
      if (deficit <= 0 || currentMatches >= maxMatches) continue;

      let best: { wrestler: (typeof pool)[number]; score: number } | null = null;
      for (const candidate of pool) {
        if (candidate.id === wrestler.id) continue;
        if ((matchCounts.get(candidate.id) ?? 0) >= maxMatches) continue;
        if (paired.has(pairKey(wrestler.id, candidate.id))) continue;
        if (!eligible(wrestler, candidate)) continue;
        const score = pairingScore(wrestler, candidate, scoreOptions).score;
        const next = { wrestler: candidate, score };
        // Favor candidates who also have an outstanding deficit before falling
        // back to closeness of matchup and then deterministic roster ordering.
        if (compareCandidates(best, next) > 0) continue;
        best = next;
      }

      if (!best) continue;

      matchCounts.set(wrestler.id, currentMatches + 1);
      matchCounts.set(best.wrestler.id, (matchCounts.get(best.wrestler.id) ?? 0) + 1);
      paired.add(pairKey(wrestler.id, best.wrestler.id));
      targetDeficits.set(wrestler.id, Math.max(0, deficit - 1));
      if ((targetDeficits.get(best.wrestler.id) ?? 0) > 0) {
        targetDeficits.set(best.wrestler.id, Math.max(0, (targetDeficits.get(best.wrestler.id) ?? 0) - 1));
      }
      newBouts.push(orderBout(wrestler, best.wrestler, best.score));
      madeProgress = true;
    }

    if (!madeProgress) break;
  }

  if (newBouts.length > 0) {
    await db.bout.createMany({
      data: newBouts.map((bout) => ({
        meetId,
        redId: bout.redId,
        greenId: bout.greenId,
        pairingScore: bout.pairingScore,
        source: null,
      })),
    });
  }

  const filledTargets = [...initialDeficits.entries()].filter(
    ([wrestlerId]) => (targetDeficits.get(wrestlerId) ?? 0) === 0,
  ).length;
  const remainingLostMatches = [...targetDeficits.values()].reduce((sum, value) => sum + value, 0);
  const unfilledTargets = [...initialDeficits.entries()].filter(
    ([wrestlerId]) => (targetDeficits.get(wrestlerId) ?? 0) > 0,
  ).length;

  return {
    created: newBouts.length,
    targetedWrestlers: initialDeficits.size,
    filledTargets,
    unfilledTargets,
    remainingLostMatches,
  };
}
