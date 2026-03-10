import { DEFAULT_MAT_COUNT, MIN_MATS } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { reorderBoutsByMat } from "@/lib/reorderBoutsCore";

/**
 * Loads the meet's bouts, applies the shared reorder core, and persists updates.
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
