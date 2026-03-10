/** Minimal bout shape used by the shared reordering algorithms. */
export type BoutLite = {
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

export type WrestlerStatusMap = Map<string, string>;
const SINGLE_MATCH_EARLY_STATUS = "SINGLE_MATCH_EARLY";

function isEarlyStatus(status?: string | null) {
  return status === "EARLY";
}

function isSingleMatchEarlyStatus(status?: string | null) {
  return status === SINGLE_MATCH_EARLY_STATUS;
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
      const hasExplicitEarly = isEarlyStatus(redStatus) || isEarlyStatus(greenStatus);
      const hasLate = isLateStatus(redStatus) || isLateStatus(greenStatus);
      if (hasExplicitEarly && hasLate) {
        minOrder = middleThirdMin <= middleThirdMax ? middleThirdMin : fallbackMiddleMin;
        maxOrder = middleThirdMin <= middleThirdMax ? middleThirdMax : fallbackMiddleMax;
      } else {
        if (hasExplicitEarly) {
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
  const hasEarly = isEarlyStatus(redStatus) || isEarlyStatus(greenStatus);
  const hasLate = isLateStatus(redStatus) || isLateStatus(greenStatus);
  if (hasEarly && hasLate) return 1;
  if (hasEarly || hasLate) return 1;
  return 1;
}

function getSingleMatchPriorityLevel(bout: BoutLite, statusByWrestler?: WrestlerStatusMap) {
  let level = 0;
  if (isSingleMatchEarlyStatus(statusByWrestler?.get(bout.redId))) level += 1;
  if (isSingleMatchEarlyStatus(statusByWrestler?.get(bout.greenId))) level += 1;
  return level;
}

function getSingleMatchPriorityWindowMaxOrder(
  list: BoutLite[],
  gap: number,
  statusByWrestler?: WrestlerStatusMap,
) {
  const priorityBoutCount = list.reduce((count, bout) => (
    getSingleMatchPriorityLevel(bout, statusByWrestler) > 0 ? count + 1 : count
  ), 0);
  return Math.min(list.length, priorityBoutCount + Math.max(0, gap));
}

function hasSingleMatchPriorityWindowViolationAt(
  list: BoutLite[],
  idx: number,
  gap: number,
  statusByWrestler?: WrestlerStatusMap,
) {
  const bout = list[idx];
  if (bout.locked) return false;
  const level = getSingleMatchPriorityLevel(bout, statusByWrestler);
  if (level <= 0) return false;
  return idx + 1 > getSingleMatchPriorityWindowMaxOrder(list, gap, statusByWrestler);
}

function countSingleMatchPriorityWindowViolations(
  list: BoutLite[],
  gap: number,
  statusByWrestler?: WrestlerStatusMap,
) {
  let violations = 0;
  for (let idx = 0; idx < list.length; idx += 1) {
    if (hasSingleMatchPriorityWindowViolationAt(list, idx, gap, statusByWrestler)) {
      violations += getSingleMatchPriorityLevel(list[idx], statusByWrestler) * 3;
    }
  }
  return violations;
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

function respectsSingleMatchPriorityWindow(
  list: BoutLite[],
  gap: number,
  statusByWrestler?: WrestlerStatusMap,
) {
  for (let idx = 0; idx < list.length; idx += 1) {
    if (hasSingleMatchPriorityWindowViolationAt(list, idx, gap, statusByWrestler)) {
      return false;
    }
  }
  return true;
}

function frontloadSingleMatchPriorityBouts(list: BoutLite[], statusByWrestler?: WrestlerStatusMap) {
  const doublePriorityUnlocked: BoutLite[] = [];
  const singlePriorityUnlocked: BoutLite[] = [];
  const otherUnlocked: BoutLite[] = [];
  for (const bout of list) {
    if (bout.locked) continue;
    const level = getSingleMatchPriorityLevel(bout, statusByWrestler);
    if (level >= 2) {
      doublePriorityUnlocked.push(bout);
    } else if (level === 1) {
      singlePriorityUnlocked.push(bout);
    } else {
      otherUnlocked.push(bout);
    }
  }
  if (doublePriorityUnlocked.length === 0 && singlePriorityUnlocked.length === 0) {
    return list.slice();
  }
  const rebuilt: BoutLite[] = [];
  let doublePriorityIndex = 0;
  let singlePriorityIndex = 0;
  let otherIndex = 0;
  for (const bout of list) {
    if (bout.locked) {
      rebuilt.push(bout);
      continue;
    }
    if (doublePriorityIndex < doublePriorityUnlocked.length) {
      rebuilt.push(doublePriorityUnlocked[doublePriorityIndex]);
      doublePriorityIndex += 1;
      continue;
    }
    if (singlePriorityIndex < singlePriorityUnlocked.length) {
      rebuilt.push(singlePriorityUnlocked[singlePriorityIndex]);
      singlePriorityIndex += 1;
      continue;
    }
    rebuilt.push(otherUnlocked[otherIndex]);
    otherIndex += 1;
  }
  return rebuilt;
}

function reorderBoutsForMat(
  list: BoutLite[],
  allMats: BoutLite[][],
  matIndex: number,
  gap: number,
  statusByWrestler?: WrestlerStatusMap,
) {
  const working = frontloadSingleMatchPriorityBouts(list, statusByWrestler);
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
      const violatesSingleMatchPriorityWindow = hasSingleMatchPriorityWindowViolationAt(
        working,
        idx,
        gap,
        statusByWrestler,
      );
      if (
        !hasCrossMatConflict
        && !hasSameMatConflict
        && !outOfConstraintRange
        && !violatesSingleMatchPriorityWindow
      ) {
        continue;
      }

      const baseScore = computeConflictSummary(allMats, gap);
      const baseViolations =
        countOrderConstraintViolations(working, constraints, statusByWrestler)
        + countSingleMatchPriorityWindowViolations(working, gap, statusByWrestler);
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
        if (!respectsSingleMatchPriorityWindow(working, gap, statusByWrestler)) {
          [working[idx], working[target]] = [working[target], working[idx]];
          continue;
        }
        const candidateScore = computeConflictSummary(allMats, gap);
        const candidateViolations =
          countOrderConstraintViolations(working, constraints, statusByWrestler)
          + countSingleMatchPriorityWindowViolations(working, gap, statusByWrestler);
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

export function reorderBoutsByMat(
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
