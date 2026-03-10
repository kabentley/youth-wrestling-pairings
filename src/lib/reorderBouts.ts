import { DEFAULT_MAT_COUNT, MIN_MATS } from "@/lib/assignMats";
import { db } from "@/lib/db";

/** Minimal bout shape used by the reordering algorithms. */
type BoutLite = {
  id: string;
  redId: string;
  greenId: string;
  mat: number | null;
  order: number | null;
  locked?: boolean | null;
};

type OrderConstraint = {
  minOrder: number;
  maxOrder: number;
};

type WrestlerStatusMap = Map<string, string>;
const SINGLE_MATCH_EARLY_STATUS = "SINGLE_MATCH_EARLY";

function isEarlyStatus(status?: string | null) {
  return status === "EARLY" || status === SINGLE_MATCH_EARLY_STATUS;
}

function isLateStatus(status?: string | null) {
  return status === "LATE";
}

function buildEffectiveStatusMap(
  bouts: BoutLite[],
  statusByWrestler?: WrestlerStatusMap,
) {
  const effective = new Map<string, string>();
  for (const [wrestlerId, status] of statusByWrestler?.entries() ?? []) {
    if (status === "EARLY" || status === "LATE") {
      effective.set(wrestlerId, status);
    }
  }
  const matchCounts = new Map<string, number>();
  for (const bout of bouts) {
    matchCounts.set(bout.redId, (matchCounts.get(bout.redId) ?? 0) + 1);
    matchCounts.set(bout.greenId, (matchCounts.get(bout.greenId) ?? 0) + 1);
  }
  for (const [wrestlerId, count] of matchCounts.entries()) {
    const explicit = effective.get(wrestlerId);
    if (count === 1 && explicit !== "LATE") {
      effective.set(wrestlerId, SINGLE_MATCH_EARLY_STATUS);
    }
  }
  return effective;
}

/**
 * Computes how many conflicts each distance from 0..`gap` appears for all mats.
 *
 * A "conflict" occurs when a wrestler is appearing too close together across mats
 * (within `gap` slots) or in the same slot on another mat. The returned array is
 * indexed by the separation distance so callers can weight near collisions more
 * heavily.
 */
function computeConflictSummary(
  matLists: BoutLite[][],
  gap: number,
  statusByWrestler?: WrestlerStatusMap,
) {
  const counts = Array(gap + 1).fill(0);
  if (gap < 0) return counts;
  const byWrestler = new Map<string, number[]>();
  for (const list of matLists) {
    list.forEach((b, idx) => {
      const o = idx + 1;
      const red = byWrestler.get(b.redId) ?? [];
      red.push(o);
      byWrestler.set(b.redId, red);
      const green = byWrestler.get(b.greenId) ?? [];
      green.push(o);
      byWrestler.set(b.greenId, green);
    });
  }
  for (const [wrestlerId, orders] of byWrestler.entries()) {
    const status = statusByWrestler?.get(wrestlerId);
    const weight = status === SINGLE_MATCH_EARLY_STATUS ? 5 : (isEarlyStatus(status) || isLateStatus(status) ? 3 : 1);
    orders.sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      for (let j = i + 1; j < orders.length; j++) {
        const diff = Math.abs(orders[j] - orders[i]);
        if (diff > gap) break;
        counts[diff] += weight;
      }
    }
  }
  return counts;
}

/**
 * Returns whether summary `a` is worse than `b`. Used to decide when a reorder
 * move improved the conflict profile.
 */
function compareConflictSummary(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

function totalConflictCount(summary: number[]) {
  return summary.reduce((sum, value) => sum + value, 0);
}

function allowConflictIncreaseForConstraintFix(
  baseScore: number[],
  candidateScore: number[],
  fixedViolationWeight: number,
) {
  if (fixedViolationWeight <= 0) return false;
  const baseTotal = totalConflictCount(baseScore);
  const candidateTotal = totalConflictCount(candidateScore);
  const increase = candidateTotal - baseTotal;
  // Permit a small increase in conflicts when it fixes early/late range violations.
  return increase <= Math.max(2, fixedViolationWeight * 2);
}

function buildOrderConstraints(list: BoutLite[], statusByWrestler?: WrestlerStatusMap) {
  const constraints = new Map<string, OrderConstraint>();
  const listSize = Math.max(1, list.length);
  const earlyMaxOrder = Math.max(1, Math.ceil(listSize / 3));
  const lateMinOrder = Math.max(1, Math.floor((2 * listSize) / 3) + 1);
  const middleThirdMin = earlyMaxOrder + 1;
  const middleThirdMax = lateMinOrder - 1;
  const fallbackMiddleMin = Math.floor((listSize + 1) / 2);
  const fallbackMiddleMax = Math.ceil((listSize + 1) / 2);
  for (let idx = 0; idx < list.length; idx++) {
    const bout = list[idx];
    let minOrder = 1;
    let maxOrder = listSize;
    if (statusByWrestler) {
      const redStatus = statusByWrestler.get(bout.redId);
      const greenStatus = statusByWrestler.get(bout.greenId);
      const hasEarly = isEarlyStatus(redStatus) || isEarlyStatus(greenStatus);
      const hasLate = isLateStatus(redStatus) || isLateStatus(greenStatus);
      if (hasEarly && hasLate) {
        // Mixed EARLY/LATE bouts are forced into the middle band.
        minOrder = middleThirdMin <= middleThirdMax ? middleThirdMin : fallbackMiddleMin;
        maxOrder = middleThirdMin <= middleThirdMax ? middleThirdMax : fallbackMiddleMax;
      } else {
      if (hasEarly) {
        maxOrder = Math.min(maxOrder, earlyMaxOrder);
      }
      if (hasLate) {
        minOrder = Math.max(minOrder, lateMinOrder);
      }
      }
    }
    if (minOrder > maxOrder) {
      minOrder = fallbackMiddleMin;
      maxOrder = fallbackMiddleMax;
    }
    constraints.set(bout.id, { minOrder, maxOrder });
  }
  return constraints;
}

function orderAllowed(order: number, constraint?: OrderConstraint) {
  if (!constraint) return true;
  return order >= constraint.minOrder && order <= constraint.maxOrder;
}

function getBoutConstraintPriority(bout: BoutLite, statusByWrestler?: WrestlerStatusMap) {
  const redStatus = statusByWrestler?.get(bout.redId);
  const greenStatus = statusByWrestler?.get(bout.greenId);
  const hasSingleMatchEarly =
    redStatus === SINGLE_MATCH_EARLY_STATUS || greenStatus === SINGLE_MATCH_EARLY_STATUS;
  const hasEarly = isEarlyStatus(redStatus) || isEarlyStatus(greenStatus);
  const hasLate = isLateStatus(redStatus) || isLateStatus(greenStatus);
  if (hasEarly && hasLate) return 1;
  if (hasSingleMatchEarly) return 3;
  if (hasEarly || hasLate) return 1;
  return 1;
}

function countOrderConstraintViolations(
  list: BoutLite[],
  constraints: Map<string, OrderConstraint>,
  statusByWrestler?: WrestlerStatusMap,
) {
  let violations = 0;
  for (let idx = 0; idx < list.length; idx++) {
    if (!orderAllowed(idx + 1, constraints.get(list[idx].id))) {
      violations += getBoutConstraintPriority(list[idx], statusByWrestler);
    }
  }
  return violations;
}

function buildLockedPositions(list: BoutLite[]) {
  const positions = new Map<string, number>();
  for (let idx = 0; idx < list.length; idx++) {
    if (list[idx].locked) {
      positions.set(list[idx].id, idx);
    }
  }
  return positions;
}

function listRespectsLockedPositions(list: BoutLite[], lockedPositions: Map<string, number>) {
  for (const [boutId, index] of lockedPositions.entries()) {
    if (index < 0 || index >= list.length) return false;
    if (list[index]?.id !== boutId) return false;
  }
  return true;
}

/** Builds a map of wrestler ids to the set of orders they occupy on other mats. */
function buildOtherMatOrders(allMats: BoutLite[][], matIndex: number) {
  const map = new Map<string, Set<number>>();
  allMats.forEach((list, idx) => {
    if (idx === matIndex) return;
    list.forEach((b, pos) => {
      const order = pos + 1;
      for (const id of [b.redId, b.greenId]) {
        if (!map.has(id)) map.set(id, new Set());
        map.get(id)!.add(order);
      }
    });
  });
  return map;
}

/**
 * Detects if moving `bout` to `order` would collide with entries from the same
 * wrestler living on other mats within `gap` slots.
 */
function hasConflict(
  bout: BoutLite,
  order: number,
  otherOrders: Map<string, Set<number>>,
  gap: number,
) {
  const conflictsAt = (id: string) => {
    const orders = otherOrders.get(id);
    if (!orders) return false;
    for (let delta = 0; delta <= gap; delta += 1) {
      if (orders.has(order - delta) || orders.has(order + delta)) {
        return true;
      }
    }
    return false;
  };
  return Boolean(conflictsAt(bout.redId) || conflictsAt(bout.greenId));
}

/**
 * Checks whether `list[idx]` conflicts with other bouts on the same mat within
 * `gap` slots.
 */
function hasSameMatConflictAt(list: BoutLite[], idx: number, gap: number) {
  const bout = list[idx];
  const start = Math.max(0, idx - gap);
  const end = Math.min(list.length - 1, idx + gap);
  for (let i = start; i <= end; i++) {
    if (i === idx) continue;
    const other = list[i];
    if (other.redId === bout.redId || other.greenId === bout.redId) return true;
    if (other.redId === bout.greenId || other.greenId === bout.greenId) return true;
  }
  return false;
}

/**
 * Mirrors the Mat Assignments tab's per-mat "Reorder" button behavior.
 *
 * This local pass is intentionally mat-focused and may accept a small conflict
 * increase when it meaningfully improves early/late constraint placement.
 */
function reorderBoutsForMat(
  list: BoutLite[],
  allMats: BoutLite[][],
  matIndex: number,
  gap: number,
  statusByWrestler?: WrestlerStatusMap,
) {
  const working = list.slice();
  if (working.length < 2) return working;
  allMats[matIndex] = working;
  const otherOrders = buildOtherMatOrders(allMats, matIndex);
  const constraints = buildOrderConstraints(working, statusByWrestler);
  const lockedPositions = buildLockedPositions(working);
  if (lockedPositions.size >= working.length) return working;

  for (let pass = 0; pass < 10; pass += 1) {
    for (let idx = 0; idx < working.length; idx += 1) {
      const bout = working[idx];
      if (bout.locked) continue;
      const order = idx + 1;
      const hasCrossMatConflict = hasConflict(bout, order, otherOrders, gap);
      const hasSameMatConflict = hasSameMatConflictAt(working, idx, gap);
      const outOfConstraintRange = !orderAllowed(order, constraints.get(bout.id));
      if (!hasCrossMatConflict && !hasSameMatConflict && !outOfConstraintRange) {
        continue;
      }

      // Match MatBoard behavior: score conflicts unweighted by EARLY/LATE status.
      const baseScore = computeConflictSummary(allMats, gap);
      const baseViolations = countOrderConstraintViolations(working, constraints, statusByWrestler);
      const attempts = Math.min(8, Math.max(1, working.length - 1));
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        let target = Math.floor(Math.random() * working.length);
        if (target === idx) {
          target = (target + 1) % working.length;
        }
        if (target === idx) continue;
        const targetBout = working[target];
        if (targetBout.locked) continue;
        const newCurrentOrder = target + 1;
        const newTargetOrder = idx + 1;
        if (!orderAllowed(newCurrentOrder, constraints.get(bout.id))) continue;
        if (!orderAllowed(newTargetOrder, constraints.get(targetBout.id))) continue;
        [working[idx], working[target]] = [working[target], working[idx]];
        if (!listRespectsLockedPositions(working, lockedPositions)) {
          [working[idx], working[target]] = [working[target], working[idx]];
          continue;
        }
        const candidateScore = computeConflictSummary(allMats, gap);
        const candidateViolations = countOrderConstraintViolations(working, constraints, statusByWrestler);
        const scoreCompare = compareConflictSummary(candidateScore, baseScore);
        const fixedViolations = baseViolations - candidateViolations;
        if (
          scoreCompare < 0 ||
          (scoreCompare === 0 && fixedViolations > 0) ||
          (scoreCompare > 0 &&
            fixedViolations > 0 &&
            allowConflictIncreaseForConstraintFix(baseScore, candidateScore, fixedViolations))
        ) {
          idx = Math.max(-1, Math.min(idx, target) - 1);
          break;
        }
        [working[idx], working[target]] = [working[target], working[idx]];
      }
    }
  }
  allMats[matIndex] = working.slice();
  return working;
}

function reorderBoutsByMat(
  bouts: BoutLite[],
  numMats: number,
  conflictGap = 4,
  statusByWrestler?: WrestlerStatusMap,
  matsToReorder?: Set<number>,
) {
  const effectiveStatusByWrestler = buildEffectiveStatusMap(bouts, statusByWrestler);
  const matLists: BoutLite[][] = Array.from({ length: numMats }, () => []);
  for (const bout of bouts) {
    const mat = Math.min(Math.max(1, bout.mat ?? 1), numMats);
    matLists[mat - 1].push({ ...bout, mat });
  }
  for (const list of matLists) {
    list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  }

  for (let matIndex = 0; matIndex < matLists.length; matIndex += 1) {
    if (matsToReorder && !matsToReorder.has(matIndex + 1)) continue;
    // Each mat is reordered against the current full-meet snapshot so later mats
    // can react to changes made by earlier mat passes, matching the UI behavior.
    const ordered = reorderBoutsForMat(
      matLists[matIndex],
      matLists,
      matIndex,
      conflictGap,
      effectiveStatusByWrestler,
    );
    matLists[matIndex] = ordered.slice();
  }

  const updates: Array<{ id: string; mat: number; order: number }> = [];
  matLists.forEach((list, matIndex) => {
    list.forEach((bout, idx) => {
      updates.push({ id: bout.id, mat: matIndex + 1, order: idx + 1 });
    });
  });
  return updates;
}

/**
 * Loads the meet's bouts, applies the MatBoard-style reorder pass, and persists updates.
 *
 * Defaults:
 * - `numMats` comes from the meet (or fallback constants).
 * - `conflictGap` uses the meet's rest-gap setting.
 */
export async function reorderBoutsForMeet(
  meetId: string,
  options: {
    numMats?: number;
    conflictGap?: number;
    timeBudgetMs?: number;
    mats?: number[];
  } = {},
) {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { numMats: true, restGap: true, deletedAt: true },
  });
  if (!meet || meet.deletedAt) {
    return { reordered: 0, numMats: options.numMats ?? DEFAULT_MAT_COUNT };
  }
  const bouts = await db.bout.findMany({
    where: { meetId },
    select: { id: true, redId: true, greenId: true, mat: true, order: true, locked: true },
  });
  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: { in: ["LATE", "EARLY"] } },
    select: { wrestlerId: true, status: true },
  });
  const statusByWrestler = new Map(statuses.map(s => [s.wrestlerId, s.status]));
  const numMats = Math.max(MIN_MATS, options.numMats ?? meet.numMats);
  const conflictGap = options.conflictGap ?? meet.restGap;
  const matsToReorder = Array.from(
    new Set(
      (options.mats ?? []).filter(
        (mat): mat is number =>
          Number.isInteger(mat) && mat >= 1 && mat <= numMats,
      ),
    ),
  );
  const matsFilter = matsToReorder.length > 0 ? new Set(matsToReorder) : undefined;
  const updates = reorderBoutsByMat(
    bouts,
    numMats,
    conflictGap,
    statusByWrestler,
    matsFilter,
  );
  const currentById = new Map(bouts.map((bout) => [bout.id, bout]));
  const changedUpdates = updates.filter((update) => {
    const current = currentById.get(update.id);
    if (!current) return false;
    return current.mat !== update.mat || current.order !== update.order;
  });
  if (changedUpdates.length) {
    await db.$transaction(
      changedUpdates.map(u =>
        db.bout.update({
          where: { id: u.id },
          data: { mat: u.mat, order: u.order },
        }),
      ),
    );
  }
  return { reordered: changedUpdates.length, numMats };
}

/**
 * Runs `reorderBoutsForMeet` repeatedly until no more changes are produced
 * (or max passes are reached), which helps converge after large batch moves.
 */
export async function reorderBoutsForMeetUntilStable(
  meetId: string,
  options: {
    numMats?: number;
    conflictGap?: number;
    timeBudgetMs?: number;
    mats?: number[];
    maxPasses?: number;
  } = {},
) {
  const maxPasses = Math.max(1, Math.min(12, options.maxPasses ?? 6));
  const { maxPasses: _maxPasses, ...reorderOptions } = options;
  let totalReordered = 0;
  let numMats = options.numMats ?? DEFAULT_MAT_COUNT;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const result = await reorderBoutsForMeet(meetId, reorderOptions);
    totalReordered += result.reordered;
    numMats = result.numMats;
    if (result.reordered === 0) break;
  }
  return { reordered: totalReordered, numMats };
}
