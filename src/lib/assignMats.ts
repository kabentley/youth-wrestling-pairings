import { db } from "./db";

/**
 * A rule describing which wrestlers should appear on a mat.
 *
 * The mat assignment algorithm uses these as a soft constraint: a bout can be
 * forced onto a specific mat (home-team preference), otherwise mats that match
 * the rule are eligible and the "best" eligible mat is chosen.
 */
export type MatRule = {
  minExperience: number;
  maxExperience: number;
  minAge: number;
  maxAge: number;
  color?: string;
};

/** Optional overrides used when assigning mats for a meet. */
export type MatSettings = {
  numMats?: number;
  preserveExisting?: boolean;
};

/** Default number of mats used if neither the meet nor caller provides a value. */
export const DEFAULT_MAT_COUNT = 4;
/** Minimum mat count enforced by the scheduler. */
export const MIN_MATS = 1;

const DEFAULT_RULE: MatRule = {
  minExperience: 0,
  maxExperience: 10,
  minAge: 0,
  maxAge: 100,
};

const RANGE_PENALTY_SCALE = 50;
const INELIGIBLE_PENALTY = 100_000;

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

export type PeopleRuleCandidate = {
  matIdx: number;
  userId: string;
  wrestlerId: string;
};

export type PeopleRuleMatMap = Map<string, PeopleRuleCandidate[]>;

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

/**
 * Returns the list of eligible mat indexes for a bout.
 *
 * If `lockHomeWrestlerMat` is enabled and one of the wrestlers is on the home
 * team, the bout may be forced onto a previously chosen mat for that wrestler.
 */
export function getEligibleMatIndexes(
  bout: { redId: string; greenId: string },
  mats: { boutIds: string[]; rule: MatRule }[],
  wMap: Map<string, MatWrestler>,
  meetDate: Date,
  homeTeamId: string | null,
  homeWrestlerMat: Map<string, number>,
  lockHomeWrestlerMat: boolean,
) {
  const red = wMap.get(bout.redId);
  const green = wMap.get(bout.greenId);
  const redHome = homeTeamId && red?.teamId === homeTeamId;
  const greenHome = homeTeamId && green?.teamId === homeTeamId;
  const redMat = redHome && lockHomeWrestlerMat ? homeWrestlerMat.get(bout.redId) : null;
  const greenMat = greenHome && lockHomeWrestlerMat ? homeWrestlerMat.get(bout.greenId) : null;
  const lockedMat = redMat ?? greenMat ?? null;

  if (lockedMat !== null) {
    return { indexes: [lockedMat] };
  }

  const indexes: number[] = [];
  for (let idx = 0; idx < mats.length; idx++) {
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

/**
 * Loads home-team volunteer mat preferences keyed by wrestler id.
 *
 * Each wrestler can have multiple linked adults and therefore multiple preferred
 * mats. The returned candidate lists are sorted deterministically so downstream
 * assignment code can make stable choices.
 */
export async function loadPeopleRuleMatMap(teamIds: string[], numMats: number): Promise<PeopleRuleMatMap> {
  if (teamIds.length === 0 || numMats < 1) return new Map<string, PeopleRuleCandidate[]>();
  const links = await db.userChild.findMany({
    where: {
      user: {
        teamId: { in: teamIds },
        role: { in: ["COACH", "TABLE_WORKER", "PARENT"] },
        staffMatNumber: { not: null },
      },
    },
    select: {
      wrestlerId: true,
      user: { select: { id: true, staffMatNumber: true } },
    },
  });
  const byWrestler = new Map<string, Map<string, PeopleRuleCandidate>>();
  for (const link of links) {
    const matNumber = link.user.staffMatNumber;
    if (typeof matNumber !== "number") continue;
    if (matNumber < 1 || matNumber > numMats) continue;
    const matIdx = matNumber - 1;
    const current = byWrestler.get(link.wrestlerId) ?? new Map<string, PeopleRuleCandidate>();
    const key = `${matIdx}:${link.user.id}`;
    current.set(key, { matIdx, userId: link.user.id, wrestlerId: link.wrestlerId });
    byWrestler.set(link.wrestlerId, current);
  }
  const out = new Map<string, PeopleRuleCandidate[]>();
  for (const [wrestlerId, entriesMap] of byWrestler.entries()) {
    const entries = Array.from(entriesMap.values()).sort((a, b) => {
      if (a.matIdx !== b.matIdx) return a.matIdx - b.matIdx;
      return a.userId.localeCompare(b.userId);
    });
    out.set(wrestlerId, entries);
  }
  return out;
}

function collectPeopleRuleCandidates(
  bout: { redId: string; greenId: string },
  peopleRuleMats: PeopleRuleMatMap,
  numMats: number,
): PeopleRuleCandidate[] {
  const redEntries = peopleRuleMats.get(bout.redId) ?? [];
  const greenEntries = peopleRuleMats.get(bout.greenId) ?? [];
  if (redEntries.length === 0 && greenEntries.length === 0) return [];

  let candidates: PeopleRuleCandidate[] = [];
  if (redEntries.length > 0 && greenEntries.length > 0) {
    const greenMats = new Set(greenEntries.map((entry) => entry.matIdx));
    const redMats = new Set(redEntries.map((entry) => entry.matIdx));
    const sharedMats = Array.from(redMats).filter((matIdx) => greenMats.has(matIdx));
    if (sharedMats.length > 0) {
      for (const matIdx of sharedMats) {
        redEntries.forEach((entry) => {
          if (entry.matIdx === matIdx) candidates.push(entry);
        });
        greenEntries.forEach((entry) => {
          if (entry.matIdx === matIdx) candidates.push(entry);
        });
      }
    } else {
      // No shared mat between red/green assignments: keep deterministic fallback
      // instead of dropping the bout from people-rule sync entirely.
      candidates = [...redEntries, ...greenEntries];
    }
  } else {
    candidates = redEntries.length > 0 ? redEntries : greenEntries;
  }

  const seen = new Set<string>();
  const out: PeopleRuleCandidate[] = [];
  for (const entry of candidates) {
    if (entry.matIdx < 0 || entry.matIdx >= numMats) continue;
    const key = `${entry.matIdx}:${entry.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/**
 * Picks the winning people-rule assignment for a bout, if one exists.
 *
 * The candidate order is deterministic so the same inputs always choose the
 * same volunteer/mat pair.
 */
export function pickPeopleRuleMatIndex(
  bout: { redId: string; greenId: string },
  peopleRuleMats: PeopleRuleMatMap,
  numMats: number,
): PeopleRuleCandidate | null {
  const candidates = collectPeopleRuleCandidates(bout, peopleRuleMats, numMats);
  if (candidates.length === 0) return null;
  // People rule precedence: first candidate in deterministic list always wins.
  return candidates[0] ?? null;
}

export type SyncPeopleRuleAssignmentsResult = {
  processed: number;
  updated: number;
  moved: number;
  newlyAssigned: number;
  cleared: number;
  affectedMats: number[];
};

/**
 * Reconciles existing bout mats with volunteer-driven people rules for a meet.
 *
 * This pass does not generate new bouts. It only updates ownership metadata and
 * moves already-created bouts when a linked volunteer mat preference requires it.
 */
export async function syncPeopleRuleAssignmentsForMeet(
  meetId: string,
  options: { dryRun?: boolean } = {},
): Promise<SyncPeopleRuleAssignmentsResult> {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { homeTeamId: true, numMats: true, deletedAt: true },
  });
  if (!meet || meet.deletedAt || !meet.homeTeamId) {
    return { processed: 0, updated: 0, moved: 0, newlyAssigned: 0, cleared: 0, affectedMats: [] };
  }

  const numMats = Math.max(MIN_MATS, meet.numMats);
  const peopleRuleMats = await loadPeopleRuleMatMap([meet.homeTeamId], numMats);

  const bouts = await db.bout.findMany({
    where: { meetId },
    select: {
      id: true,
      redId: true,
      greenId: true,
      mat: true,
      order: true,
      assignedByPeopleRule: true,
      peopleRuleUserId: true,
    },
    orderBy: [
      { mat: "asc" },
      { order: "asc" },
      { id: "asc" },
    ],
  });
  if (bouts.length === 0) {
    return { processed: 0, updated: 0, moved: 0, newlyAssigned: 0, cleared: 0, affectedMats: [] };
  }

  type AssignmentUpdate = {
    assignedByPeopleRule: boolean;
    peopleRuleUserId: string | null;
  };
  const assignmentUpdates = new Map<string, AssignmentUpdate>();
  const matUpdates = new Map<string, { mat: number }>();
  const movedBoutIds = new Set<string>();
  const targetMatByBoutId = new Map<string, number>();
  const affectedMats = new Set<number>();

  let newlyAssigned = 0;
  let cleared = 0;

  for (const bout of bouts) {
    const currentAssigned = bout.assignedByPeopleRule && Boolean(bout.peopleRuleUserId);
    const currentUserId = currentAssigned ? bout.peopleRuleUserId : null;
    const redEntries = peopleRuleMats.get(bout.redId) ?? [];
    const greenEntries = peopleRuleMats.get(bout.greenId) ?? [];
    const candidates = collectPeopleRuleCandidates(bout, peopleRuleMats, numMats);
    const redMatSet = new Set(redEntries.map((entry) => entry.matIdx + 1));
    const greenMatSet = new Set(greenEntries.map((entry) => entry.matIdx + 1));
    const preserveCurrentMatForMultiParent =
      typeof bout.mat === "number" && (
        (redMatSet.size > 1 && redMatSet.has(bout.mat)) ||
        (greenMatSet.size > 1 && greenMatSet.has(bout.mat))
      );

    // Preserve current owner when still eligible; otherwise clear. For unowned
    // bouts, assign the deterministic top candidate so repeated syncs stay stable.
    const defaultPick = currentUserId
      ? candidates.find((candidate) => candidate.userId === currentUserId) ?? null
      : (candidates[0] ?? null);
    let nextPick = defaultPick;
    if (preserveCurrentMatForMultiParent && typeof bout.mat === "number") {
      const currentMatIdx = bout.mat - 1;
      const currentMatCandidate =
        [...redEntries, ...greenEntries].find((candidate) => candidate.matIdx === currentMatIdx) ?? null;
      if (currentMatCandidate) {
        nextPick = currentMatCandidate;
      }
    }
    const nextAssigned = nextPick !== null;
    const nextUserId = nextPick?.userId ?? null;

    if (!currentUserId && nextUserId) newlyAssigned += 1;
    if (currentUserId && !nextUserId) cleared += 1;

    if (bout.assignedByPeopleRule !== nextAssigned || (bout.peopleRuleUserId ?? null) !== nextUserId) {
      assignmentUpdates.set(bout.id, {
        assignedByPeopleRule: nextAssigned,
        peopleRuleUserId: nextUserId,
      });
    }

    if (!nextPick) continue;
    const targetMat = nextPick.matIdx + 1;
    if (bout.mat === targetMat) continue;
    movedBoutIds.add(bout.id);
    targetMatByBoutId.set(bout.id, targetMat);
    matUpdates.set(bout.id, { mat: targetMat });
    affectedMats.add(targetMat);
    if (typeof bout.mat === "number" && bout.mat >= 1 && bout.mat <= numMats) {
      affectedMats.add(bout.mat);
    }
  }

  const updateIds = new Set<string>([...assignmentUpdates.keys(), ...matUpdates.keys()]);
  if (updateIds.size === 0) {
    return {
      processed: bouts.length,
      updated: 0,
      moved: 0,
      newlyAssigned,
      cleared,
      affectedMats: [],
    };
  }

  if (!options.dryRun) {
    await db.$transaction(async (tx) => {
      for (const boutId of updateIds) {
        const assignment = assignmentUpdates.get(boutId);
        const mat = matUpdates.get(boutId);
        const movedTargetMat = targetMatByBoutId.get(boutId);
        await tx.bout.update({
          where: { id: boutId },
          data: {
            ...(assignment ?? {}),
            ...(mat ?? {}),
            ...(movedTargetMat ? { originalMat: movedTargetMat } : {}),
          },
        });
      }
    });
  }

  return {
    processed: bouts.length,
    updated: updateIds.size,
    moved: movedBoutIds.size,
    newlyAssigned,
    cleared,
    affectedMats: Array.from(affectedMats).sort((a, b) => a - b),
  };
}

/**
 * Assigns every bout in a meet to a mat and initial order.
 *
 * This function resets existing `mat` and `order` values and then reassigns
 * bouts in ascending `score` order. When the home team preference is enabled,
 * bouts involving a home wrestler are biased (or locked) to keep that wrestler
 * on a consistent mat across the meet.
 */
export async function assignMatsForMeet(meetId: string, s: MatSettings = {}) {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { date: true, meetTeams: { select: { teamId: true } }, homeTeamId: true, numMats: true, deletedAt: true },
  });
  if (!meet || meet.deletedAt) {
    return { assigned: 0, numMats: s.numMats ?? DEFAULT_MAT_COUNT };
  }
  const homeTeamId = meet.homeTeamId ?? null;

  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ pairingScore: "asc" }],
  });

  const teamIds = meet.meetTeams.map(mt => mt.teamId);
  const wrestlers = await db.wrestler.findMany({
    where: { teamId: { in: teamIds } },
    select: { id: true, teamId: true, birthdate: true, experienceYears: true, first: true, last: true },
  });
  const wMap = new Map(wrestlers.map(w => [w.id, w]));
  const earlyStatuses = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: "EARLY" },
    select: { wrestlerId: true },
  });
  const earlyIds = new Set(earlyStatuses.map(s => s.wrestlerId));

  const numMats = Math.max(MIN_MATS, s.numMats ?? meet.numMats);
  const peopleRuleTeamIds = homeTeamId ? [homeTeamId] : [];
  const peopleRuleMats = await loadPeopleRuleMatMap(peopleRuleTeamIds, numMats);
  const preserveExisting = Boolean(s.preserveExisting);
  if (!preserveExisting) {
    await db.bout.updateMany({
      where: { meetId },
      data: { mat: null, order: null, assignedByPeopleRule: false, peopleRuleUserId: null },
    });
  }

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
  const homeWrestlerMat = new Map<string, number>();
  const meetDate = meet.date;

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
      // Keep ineligible mats as a last resort so every bout can still be placed
      // even when rule coverage is incomplete.
      p += INELIGIBLE_PENALTY;
    }

    p += mats[matIdx].boutIds.length * 0.01;
    return p;
  }

  const assignedBouts = preserveExisting
    ? bouts.filter(b => b.mat && b.order && b.mat >= 1 && b.mat <= numMats)
    : [];
  const unassignedBouts = preserveExisting
    ? bouts.filter(b => !(b.mat && b.order && b.mat >= 1 && b.mat <= numMats))
    : bouts;

  if (preserveExisting) {
    const sortedAssigned = [...assignedBouts].sort((a, b) => {
      const matA = a.mat ?? 0;
      const matB = b.mat ?? 0;
      if (matA !== matB) return matA - matB;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    for (const b of sortedAssigned) {
      if (!b.mat) continue;
      const matIdx = b.mat - 1;
      if (!mats[matIdx]) continue;
      mats[matIdx].boutIds.push(b.id);
      if (homeTeamId) {
        const red = getWrestler(b.redId);
        const green = getWrestler(b.greenId);
        if (red?.teamId === homeTeamId) {
          homeWrestlerMat.set(b.redId, matIdx);
        }
        if (green?.teamId === homeTeamId) {
          homeWrestlerMat.set(b.greenId, matIdx);
        }
      }
    }
  }

  for (const b of unassignedBouts) {
    const peopleRulePick = pickPeopleRuleMatIndex(b, peopleRuleMats, numMats);
    let bestMat = peopleRulePick?.matIdx ?? 0;
    let assignedByPeopleRule = peopleRulePick !== null;
    let peopleRuleUserId: string | null = peopleRulePick?.userId ?? null;
    let redId = b.redId;
    let greenId = b.greenId;
    let pairingScore = b.pairingScore;
    if (peopleRulePick === null) {
      const { indexes: eligibleMats } = getEligibleMatIndexes(
        b,
        mats,
        wMap,
        meetDate,
        homeTeamId,
        homeWrestlerMat,
        Boolean(homeTeamPrefs?.homeTeamPreferSameMat),
      );
      bestMat = eligibleMats.length > 0 ? eligibleMats[0] : pickLeastLoadedMat(mats);
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
      peopleRuleUserId = null;
    } else if (homeTeamId) {
      const red = getWrestler(b.redId);
      const green = getWrestler(b.greenId);
      const bothHome = red?.teamId === homeTeamId && green?.teamId === homeTeamId;
      if (bothHome && peopleRulePick.wrestlerId === b.greenId) {
        // Flip red/green so the people-rule-linked wrestler is treated as the
        // "home-side" wrestler everywhere downstream, including printouts.
        redId = b.greenId;
        greenId = b.redId;
        pairingScore = -b.pairingScore;
      }
    }

    const insertAtHead = earlyIds.has(b.redId) || earlyIds.has(b.greenId);
    const order = insertAtHead ? 1 : mats[bestMat].boutIds.length + 1;
    if (insertAtHead) {
      mats[bestMat].boutIds.unshift(b.id);
      // Reassigning an EARLY bout to the front shifts every existing bout on the
      // mat down by one so persisted order values stay contiguous.
      await db.bout.updateMany({
        where: { meetId, mat: bestMat + 1, order: { not: null } },
        data: { order: { increment: 1 } },
      });
    } else {
      mats[bestMat].boutIds.push(b.id);
    }

    await db.bout.update({
      where: { id: b.id },
      data: {
        mat: bestMat + 1,
        order,
        originalMat: b.originalMat ?? (bestMat + 1),
        redId,
        greenId,
        pairingScore,
        assignedByPeopleRule,
        peopleRuleUserId,
      },
    });

    if (homeTeamId) {
      const red = getWrestler(b.redId);
      const green = getWrestler(b.greenId);
      if (red?.teamId === homeTeamId) {
        homeWrestlerMat.set(b.redId, bestMat);
      }
      if (green?.teamId === homeTeamId) {
        homeWrestlerMat.set(b.greenId, bestMat);
      }
    }
  }

  const assignedCount = preserveExisting ? unassignedBouts.length : bouts.length;
  return { assigned: assignedCount, numMats };
}
