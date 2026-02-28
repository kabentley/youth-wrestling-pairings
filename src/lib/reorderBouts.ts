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
    const weight = status === "EARLY" || status === "LATE" ? 3 : 1;
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
      const hasEarly = redStatus === "EARLY" || greenStatus === "EARLY";
      const hasLate = redStatus === "LATE" || greenStatus === "LATE";
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

function listRespectsConstraints(list: BoutLite[], constraints: Map<string, OrderConstraint>) {
  for (let idx = 0; idx < list.length; idx++) {
    const constraint = constraints.get(list[idx].id);
    if (!orderAllowed(idx + 1, constraint)) return false;
  }
  return true;
}

function constraintViolation(order: number, constraint?: OrderConstraint) {
  if (!constraint) return 0;
  if (order < constraint.minOrder) return constraint.minOrder - order;
  if (order > constraint.maxOrder) return order - constraint.maxOrder;
  return 0;
}

function totalConstraintViolation(list: BoutLite[], constraints: Map<string, OrderConstraint>) {
  let total = 0;
  for (let idx = 0; idx < list.length; idx++) {
    total += constraintViolation(idx + 1, constraints.get(list[idx].id));
  }
  return total;
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

/** Builds a map of wrestler ids → set of orders used on other mats. */
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

function hasZeroConflict(bout: BoutLite, order: number, otherOrders: Map<string, Set<number>>) {
  const check = (id: string): boolean => otherOrders.get(id)?.has(order) ?? false;
  return check(bout.redId) || check(bout.greenId);
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

function trySlide(
  list: BoutLite[],
  idx: number,
  direction: -1 | 1,
  otherOrders: Map<string, Set<number>>,
  constraints: Map<string, OrderConstraint>,
  lockedPositions: Map<string, number>,
) {
  const target = idx + direction;
  if (target < 0 || target >= list.length) return false;
  const current = list[idx];
  const neighbor = list[target];
  if (current.locked || neighbor.locked) return false;
  const newCurrentOrder = target + 1;
  const newNeighborOrder = idx + 1;
  if (!orderAllowed(newCurrentOrder, constraints.get(current.id))) return false;
  if (!orderAllowed(newNeighborOrder, constraints.get(neighbor.id))) return false;
  if (hasZeroConflict(current, newCurrentOrder, otherOrders)) return false;
  if (hasZeroConflict(neighbor, newNeighborOrder, otherOrders)) return false;
  [list[idx], list[target]] = [list[target], list[idx]];
  if (!listRespectsLockedPositions(list, lockedPositions)) {
    [list[idx], list[target]] = [list[target], list[idx]];
    return false;
  }
  return true;
}

function resolveZeroGapConflicts(
  list: BoutLite[],
  allMats: BoutLite[][],
  matIndex: number,
  constraints: Map<string, OrderConstraint>,
  lockedPositions: Map<string, number>,
) {
  const otherOrders = buildOtherMatOrders(allMats, matIndex);
  let changed = true;
  while (changed) {
    changed = false;
    for (let idx = list.length - 1; idx >= 0; idx--) {
      const order = idx + 1;
      if (!hasZeroConflict(list[idx], order, otherOrders)) continue;
      if (
        trySlide(list, idx, -1, otherOrders, constraints, lockedPositions) ||
        trySlide(list, idx, 1, otherOrders, constraints, lockedPositions)
      ) {
        changed = true;
        break;
      }
    }
  }
  return list;
}

function closestPowerOfTwo(value: number) {
  let power = 1;
  while (power < value) power <<= 1;
  return power;
}

/**
 * Attempts to locally reorder bouts on a single mat so conflicts shrink.
 *
 * The heuristics keep sliding bouts and accept moves that lower the conflict
 * summary while occasionally trying random swaps.
 */
function reorderBoutsForMat(
  list: BoutLite[],
  allMats: BoutLite[][],
  matIndex: number,
  gap: number,
  statusByWrestler?: WrestlerStatusMap,
) {
  const base = list.slice();
  if (gap <= 0) return base;
  const constraints = buildOrderConstraints(base, statusByWrestler);
  const lockedPositions = buildLockedPositions(base);
  if (lockedPositions.size >= base.length) return base;

  function scoreCandidate(candidate: BoutLite[]) {
    const matsCopy = allMats.map(m => m.slice());
    if (matIndex >= 0) matsCopy[matIndex] = candidate;
    return computeConflictSummary(matsCopy, gap, statusByWrestler);
  }

  let best = base.slice();
  let bestScore = scoreCandidate(best);
  const attempts = Math.max(25, closestPowerOfTwo(base.length * 4));
  for (let iter = 0; iter < attempts; iter++) {
    if (best.length < 2) break;
    const next = best.slice();
    const idx = Math.floor(Math.random() * (next.length - 1));
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    if (
      !listRespectsConstraints(next, constraints) ||
      !listRespectsLockedPositions(next, lockedPositions)
    ) continue;
    const score = scoreCandidate(next);
    const delta = compareConflictSummary(score, bestScore);
    const accept = delta < 0 || Math.random() < 0.05;
    if (accept) {
      best = next;
      bestScore = score;
    }
  }
  const resolved = resolveZeroGapConflicts(best, allMats, matIndex, constraints, lockedPositions);
  allMats[matIndex] = resolved.slice();
  return resolved;
}

/**
 * Reorders bouts independently within each mat to reduce cross-mat conflicts.
 *
 * A "conflict" is when the same wrestler is scheduled at the same order on
 * different mats, or too close together across mats (within `conflictGap`).
 *
 * Returns an update list of `{id, mat, order}` for persistence.
 */
export function reorderBoutsByMat(
  bouts: BoutLite[],
  numMats: number,
  conflictGap = 4,
  statusByWrestler?: WrestlerStatusMap,
) {
  const matLists: BoutLite[][] = Array.from({ length: numMats }, () => []);
  for (const bout of bouts) {
    const mat = Math.min(Math.max(1, bout.mat ?? 1), numMats);
    matLists[mat - 1].push({ ...bout, mat });
  }
  for (const list of matLists) {
    list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  }

  for (let idx = 0; idx < matLists.length; idx++) {
    const ordered = reorderBoutsForMat(matLists[idx], matLists, idx, conflictGap, statusByWrestler);
    matLists[idx] = ordered.slice();
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
 * Fast heuristic reorder pass used by default.
 *
 * Iterates through mats and tries small local moves that improve the conflict
 * summary (fewer near-by appearances of the same wrestler across mats).
 */
function reorderBoutsSequential(
  bouts: BoutLite[],
  numMats: number,
  conflictGap = 4,
  statusByWrestler?: WrestlerStatusMap,
) {
  const matLists: BoutLite[][] = Array.from({ length: numMats }, () => []);
  for (const bout of bouts) {
    const mat = Math.min(Math.max(1, bout.mat ?? 1), numMats);
    matLists[mat - 1].push({ ...bout, mat });
  }
  for (const list of matLists) {
    list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  }

  for (let matIndex = 0; matIndex < matLists.length; matIndex++) {
    const list = matLists[matIndex];
    const constraints = buildOrderConstraints(list, statusByWrestler);
    const lockedPositions = buildLockedPositions(list);
    if (lockedPositions.size >= list.length) continue;
    const otherOrders = buildOtherMatOrders(matLists, matIndex);
    for (let pass = 0; pass < 10; pass++) {
      for (let idx = 0; idx < list.length; idx++) {
        const bout = list[idx];
        if (bout.locked) continue;
        const order = idx + 1;
        const currentViolation = constraintViolation(order, constraints.get(bout.id));
        if (
          !hasConflict(bout, order, otherOrders, conflictGap) &&
          !hasSameMatConflictAt(list, idx, conflictGap) &&
          currentViolation === 0
        ) {
          continue;
        }
        const baseScore = computeConflictSummary(matLists, conflictGap, statusByWrestler);
        const baseViolation = totalConstraintViolation(list, constraints);
        const attempts = Math.min(8, Math.max(1, list.length - 1));
        let moved = false;
        for (let attempt = 0; attempt < attempts; attempt++) {
          let target = Math.floor(Math.random() * list.length);
          if (target === idx) {
            target = (target + 1) % list.length;
          }
          if (target === idx) continue;
          list.splice(idx, 1);
          list.splice(target, 0, bout);
          if (!listRespectsLockedPositions(list, lockedPositions)) {
            list.splice(target, 1);
            list.splice(idx, 0, bout);
            continue;
          }
          const candidateViolation = totalConstraintViolation(list, constraints);
          const candidateScore = computeConflictSummary(matLists, conflictGap, statusByWrestler);
          const betterViolation = candidateViolation < baseViolation;
          const sameViolation = candidateViolation === baseViolation;
          const betterConflict = compareConflictSummary(candidateScore, baseScore) < 0;
          if (betterViolation || (sameViolation && betterConflict)) {
            moved = true;
            idx = Math.max(-1, target - 1);
            break;
          }
          list.splice(target, 1);
          list.splice(idx, 0, bout);
        }
        if (!moved) {
          list.splice(idx, 1);
          list.splice(idx, 0, bout);
        }
      }
    }
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
 * Loads the meet's bouts, applies a reorder strategy, and persists updates.
 *
 * Defaults:
 * - `numMats` comes from the meet (or fallback constants).
 * - `conflictGap` uses the meet's rest-gap setting.
 */
export async function reorderBoutsForMeet(
  meetId: string,
  options: { numMats?: number; conflictGap?: number; timeBudgetMs?: number } = {},
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
  const updates = reorderBoutsSequential(
    bouts,
    numMats,
    conflictGap,
    statusByWrestler,
  );
  if (updates.length) {
    await db.$transaction(
      updates.map(u =>
        db.bout.update({
          where: { id: u.id },
          data: { mat: u.mat, order: u.order },
        }),
      ),
    );
  }
  return { reordered: updates.length, numMats };
}
