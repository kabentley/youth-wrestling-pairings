import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { isEditableMeetPhase } from "@/lib/meetPhase";
import { requireRole } from "@/lib/rbac";
import { reorderBoutsForMeetUntilStable } from "@/lib/reorderBouts";

export async function POST(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id, user.role);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { id: true, deletedAt: true, status: true, numMats: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!isEditableMeetPhase(meet.status)) {
    return NextResponse.json({ error: "Rest-conflict fixes are only available before the meet starts." }, { status: 400 });
  }

  const hasResults = await db.bout.findFirst({
    where: { meetId, resultAt: { not: null } },
    select: { id: true },
  });
  if (hasResults) {
    return NextResponse.json({ error: "Cannot reorder bouts after results have been entered." }, { status: 400 });
  }

  const result = await reorderBoutsForMeetUntilStable(meetId, {
    numMats: Math.max(1, Math.min(8, meet.numMats)),
    maxPasses: 8,
  });

  await logMeetChange(
    meetId,
    user.id,
    `Optimized mat order for rest conflicts (${result.reordered} bout${result.reordered === 1 ? "" : "s"} reordered).`,
  );

  return NextResponse.json({
    ok: true,
    reordered: result.reordered,
  });
}
