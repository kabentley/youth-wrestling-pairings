import { DEFAULT_MAT_COUNT, MIN_MATS } from "@/lib/assignMats";
import { db } from "@/lib/db";

type BoutLite = {
  id: string;
  redId: string;
  greenId: string;
  mat: number | null;
  order: number | null;
};

function computeConflictSummary(matLists: BoutLite[][], gap: number) {
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
  for (const orders of byWrestler.values()) {
    orders.sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      for (let j = i + 1; j < orders.length; j++) {
        const diff = Math.abs(orders[j] - orders[i]);
        if (diff > gap) break;
        counts[diff] += 1;
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

function conflictCost(matLists: BoutLite[][], gap: number) {
  const summary = computeConflictSummary(matLists, gap);
  let cost = 0;
  for (let diff = 0; diff < summary.length; diff++) {
    const count = summary[diff];
    if (!count) continue;
    const weight = diff === 0 ? (gap + 1) * 4 : (gap - diff + 1);
    cost += count * weight;
  }
  return cost;
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

function hasZeroConflict(bout: BoutLite, order: number, otherOrders: Map<string, Set<number>>) {
  const check = (id: string) => otherOrders.get(id)?.has(order);
  return Boolean(check(bout.redId) || check(bout.greenId));
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
  if (!bout) return false;
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
) {
  const target = idx + direction;
  if (target < 0 || target >= list.length) return false;
  const current = list[idx];
  const neighbor = list[target];
  const newCurrentOrder = target + 1;
  const newNeighborOrder = idx + 1;
  if (hasZeroConflict(current, newCurrentOrder, otherOrders)) return false;
  if (hasZeroConflict(neighbor, newNeighborOrder, otherOrders)) return false;
  [list[idx], list[target]] = [list[target], list[idx]];
  return true;
}

function resolveZeroGapConflicts(
  list: BoutLite[],
  allMats: BoutLite[][],
  matIndex: number,
  gap: number,
) {
  const otherOrders = buildOtherMatOrders(allMats, matIndex);
  let changed = true;
  while (changed) {
    changed = false;
    for (let idx = list.length - 1; idx >= 0; idx--) {
      const order = idx + 1;
      if (!hasZeroConflict(list[idx], order, otherOrders)) continue;
      if (trySlide(list, idx, -1, otherOrders) || trySlide(list, idx, 1, otherOrders)) {
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

function reorderBoutsForMat(list: BoutLite[], allMats: BoutLite[][], matIndex: number, gap: number) {
  const base = list.slice();
  if (gap <= 0) return base;

  function scoreCandidate(candidate: BoutLite[]) {
    const matsCopy = allMats.map(m => m.slice());
    if (matIndex >= 0) matsCopy[matIndex] = candidate;
    return computeConflictSummary(matsCopy, gap);
  }

  let best = base.slice();
  let bestScore = scoreCandidate(best);
  const attempts = Math.max(25, closestPowerOfTwo(base.length * 4));
  for (let iter = 0; iter < attempts; iter++) {
    if (best.length < 2) break;
    const next = best.slice();
    const idx = Math.floor(Math.random() * (next.length - 1));
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    const score = scoreCandidate(next);
    const delta = compareConflictSummary(score, bestScore);
    const accept = delta < 0 || Math.random() < 0.05;
    if (accept) {
      best = next;
      bestScore = score;
    }
  }
  const resolved = resolveZeroGapConflicts(best, allMats, matIndex, gap);
  allMats[matIndex] = resolved.slice();
  return resolved;
}

export function reorderBoutsByMat(bouts: BoutLite[], numMats: number, conflictGap = 3) {
  const matLists: BoutLite[][] = Array.from({ length: numMats }, () => []);
  for (const bout of bouts) {
    const mat = Math.min(Math.max(1, bout.mat ?? 1), numMats);
    matLists[mat - 1].push({ ...bout, mat });
  }
  for (const list of matLists) {
    list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  }

  for (let idx = 0; idx < matLists.length; idx++) {
    const ordered = reorderBoutsForMat(matLists[idx], matLists, idx, conflictGap);
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

export function reorderBoutsGlobal(
  bouts: BoutLite[],
  numMats: number,
  conflictGap = 3,
  timeBudgetMs = 5000,
) {
  const mats: BoutLite[][] = Array.from({ length: numMats }, () => []);
  for (const bout of bouts) {
    const mat = Math.min(Math.max(1, bout.mat ?? 1), numMats);
    mats[mat - 1].push({ ...bout, mat });
  }
  for (const list of mats) {
    list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  }

  const cloneMats = (source: BoutLite[][]) => source.map(list => list.map(b => ({ ...b })));
  let current = cloneMats(mats);
  let best = cloneMats(mats);
  let currentCost = conflictCost(current, conflictGap);
  let bestCost = currentCost;

  const start = Date.now();
  const tempStart = Math.max(1, currentCost / 10);
  const tempEnd = 0.1;

  while (Date.now() - start < timeBudgetMs) {
    const elapsed = Date.now() - start;
    const progress = Math.min(1, elapsed / timeBudgetMs);
    const temp = tempStart * Math.pow(tempEnd / tempStart, progress);

    const matIndex = Math.floor(Math.random() * current.length);
    const list = current[matIndex];
    if (list.length < 2) continue;
    const i = Math.floor(Math.random() * list.length);
    let j = Math.floor(Math.random() * list.length);
    if (i === j) j = (j + 1) % list.length;
    [list[i], list[j]] = [list[j], list[i]];

    const nextCost = conflictCost(current, conflictGap);
    const delta = nextCost - currentCost;
    const accept = delta <= 0 || Math.random() < Math.exp(-delta / temp);
    if (accept) {
      currentCost = nextCost;
      if (nextCost < bestCost) {
        bestCost = nextCost;
        best = cloneMats(current);
      }
    } else {
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  const updates: Array<{ id: string; mat: number; order: number }> = [];
  best.forEach((list, matIndex) => {
    list.forEach((bout, idx) => {
      updates.push({ id: bout.id, mat: matIndex + 1, order: idx + 1 });
    });
  });
  return { updates, bestCost };
}

export function reorderBoutsSequential(
  bouts: BoutLite[],
  numMats: number,
  conflictGap = 3,
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
    const otherOrders = buildOtherMatOrders(matLists, matIndex);
    for (let idx = 0; idx < list.length; idx++) {
      const bout = list[idx];
      const order = idx + 1;
      if (
        !hasConflict(bout, order, otherOrders, conflictGap) &&
        !hasSameMatConflictAt(list, idx, conflictGap)
      ) {
        continue;
      }
      const topWindow = Math.min(idx, Math.max(5, conflictGap));
      if (topWindow > 0) {
        const topTarget = Math.floor(Math.random() * (topWindow + 1));
        if (topTarget !== idx) {
          list.splice(idx, 1);
          list.splice(topTarget, 0, bout);
          const topOrder = topTarget + 1;
          if (
            !hasConflict(bout, topOrder, otherOrders, conflictGap) &&
            !hasSameMatConflictAt(list, topTarget, conflictGap)
          ) {
            idx = Math.max(-1, topTarget - 1);
            continue;
          }
          list.splice(topTarget, 1);
          list.splice(idx, 0, bout);
        }
      }
      const maxShift = Math.max(1, list.length - 1);
      let moved = false;
      for (let attempt = 0; attempt < maxShift; attempt++) {
        const shift = 1 + Math.floor(Math.random() * maxShift);
        let nextIndex = idx + shift;
        if (nextIndex >= list.length) {
          nextIndex = Math.floor(Math.random() * (idx + 1));
        }
        if (nextIndex === idx) continue;
        list.splice(idx, 1);
        list.splice(nextIndex, 0, bout);
        const nextOrder = nextIndex + 1;
        if (
          !hasConflict(bout, nextOrder, otherOrders, conflictGap) &&
          !hasSameMatConflictAt(list, nextIndex, conflictGap)
        ) {
          moved = true;
          idx = Math.max(-1, idx - 1);
          break;
        }
        list.splice(nextIndex, 1);
        list.splice(idx, 0, bout);
      }
      if (!moved) {
        const target = Math.floor(Math.random() * (Math.min(idx, list.length - 1) + 1));
        if (target !== idx) {
          list.splice(idx, 1);
          list.splice(target, 0, bout);
          idx = Math.max(-1, target - 1);
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

export async function reorderBoutsForMeet(
  meetId: string,
  options: { numMats?: number; conflictGap?: number; timeBudgetMs?: number } = {},
) {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { numMats: true, restGap: true },
  });
  const bouts = await db.bout.findMany({
    where: { meetId },
    select: { id: true, redId: true, greenId: true, mat: true, order: true },
  });
  const numMats = Math.max(MIN_MATS, options.numMats ?? meet?.numMats ?? DEFAULT_MAT_COUNT);
  const conflictGap = options.conflictGap ?? meet?.restGap ?? 3;
  const updates = reorderBoutsSequential(
    bouts,
    numMats,
    conflictGap,
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
