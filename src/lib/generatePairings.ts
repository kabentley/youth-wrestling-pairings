import { MAX_MATCHES_PER_WRESTLER } from "./constants";
import { db } from "./db";

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
  /** Upper bound for matches per wrestler (hard cap per generation pass). */
  maxMatchesPerWrestler?: number;
};

function daysBetween(a: Date, b: Date) {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}
function weightPctDiff(a: number, b: number) {
  const diff = Math.abs(a - b);
  const base = Math.min(a, b);
  return base <= 0 ? 999 : (100 * diff) / base;
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
  const newBouts: { redId: string; greenId: string; score: number; notes: string }[] = [];
  const maxMatches = Math.min(
    MAX_MATCHES_PER_WRESTLER,
    Math.max(1, Math.floor(settings.maxMatchesPerWrestler ?? MAX_MATCHES_PER_WRESTLER)),
  );
  const targetMatches = Math.min(
    maxMatches,
    Math.max(1, Math.floor(settings.matchesPerWrestler ?? 2)),
  );

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

  function matchesNeeded(id: string) {
    return Math.max(0, targetMatches - (matchCounts.get(id) ?? 0));
  }
  function pairKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  const wrestlersByTeam = new Map<string, typeof pool>();
  for (const mt of meetTeams) {
    const teamWrestlers = mt.team.wrestlers
      .filter(w => w.active && !absentIds.has(w.id))
      .sort((a, b) => a.weight - b.weight || a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
    wrestlersByTeam.set(mt.teamId, teamWrestlers);
  }

  for (const mt of meetTeams) {
    const teamRoster = wrestlersByTeam.get(mt.teamId) ?? [];
    for (const a of teamRoster) {
      let currentA = matchCounts.get(a.id) ?? 0;
      while (currentA < maxMatches && matchesNeeded(a.id) > 0) {
        const candidates: { b: typeof a; score: number; notes: string; count: number }[] = [];
        for (const b of pool) {
          if (a.id === b.id) continue;
          const currentB = matchCounts.get(b.id) ?? 0;
          if (currentB >= maxMatches) continue;
          if (!eligible(a, b, settings.allowSameTeamMatches)) continue;
          if (paired.has(pairKey(a.id, b.id))) continue;
          const d = baseScore(a, b);
          candidates.push({
            b,
            score: d.score,
            count: currentB,
            notes: `wDiff=${d.wDiff.toFixed(1)} ageGapDays=${d.ageGap} expGap=${d.expGap} skillGap=${d.skillGap} wPct=${d.wPct.toFixed(1)}%`,
          });
        }
        candidates.sort((x, y) => (x.score - y.score) || (x.count - y.count));
        if (candidates.length === 0) break;
        const pick = candidates[0];
        matchCounts.set(a.id, (matchCounts.get(a.id) ?? 0) + 1);
        matchCounts.set(pick.b.id, (matchCounts.get(pick.b.id) ?? 0) + 1);
        paired.add(pairKey(a.id, pick.b.id));
        newBouts.push({ redId: a.id, greenId: pick.b.id, score: pick.score, notes: pick.notes });
        currentA += 1;
      }
    }
  }

  function fillZeroMatches() {
    let made = true;
    while (made) {
      made = false;
      const zeroes = pool.filter(w => (matchCounts.get(w.id) ?? 0) === 0);
      if (zeroes.length === 0) return;
      for (const a of zeroes) {
        const currentA = matchCounts.get(a.id) ?? 0;
        if (currentA >= maxMatches) continue;
        const candidates: { b: typeof a; score: number; notes: string; count: number }[] = [];
        for (const b of pool) {
          if (a.id === b.id) continue;
          const currentB = matchCounts.get(b.id) ?? 0;
          if (currentB >= maxMatches) continue;
          if (!eligible(a, b, settings.allowSameTeamMatches)) continue;
          if (paired.has(pairKey(a.id, b.id))) continue;
          const d = baseScore(a, b);
          candidates.push({
            b,
            score: d.score,
            count: currentB,
            notes: `wDiff=${d.wDiff.toFixed(1)} ageGapDays=${d.ageGap} expGap=${d.expGap} skillGap=${d.skillGap} wPct=${d.wPct.toFixed(1)}%`,
          });
        }
        if (candidates.length === 0) continue;
        const zeroCandidates = candidates.filter(c => c.count === 0);
        const usable = zeroCandidates.length > 0 ? zeroCandidates : candidates;
        usable.sort((x, y) => (x.score - y.score) || (x.count - y.count));
        if (usable.length === 0) continue;
        const pick = usable[0];
        matchCounts.set(a.id, (matchCounts.get(a.id) ?? 0) + 1);
        matchCounts.set(pick.b.id, (matchCounts.get(pick.b.id) ?? 0) + 1);
        paired.add(pairKey(a.id, pick.b.id));
        newBouts.push({ redId: a.id, greenId: pick.b.id, score: pick.score, notes: pick.notes });
        made = true;
      }
    }
  }

  fillZeroMatches();

  let removedExtra = true;
  while (removedExtra) {
    removedExtra = false;
    for (let i = newBouts.length - 1; i >= 0; i--) {
      const bout = newBouts[i];
      const redCount = matchCounts.get(bout.redId) ?? 0;
      const greenCount = matchCounts.get(bout.greenId) ?? 0;
      if (redCount > targetMatches && greenCount > targetMatches) {
        newBouts.splice(i, 1);
        matchCounts.set(bout.redId, redCount - 1);
        matchCounts.set(bout.greenId, greenCount - 1);
        removedExtra = true;
      }
    }
  }

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
