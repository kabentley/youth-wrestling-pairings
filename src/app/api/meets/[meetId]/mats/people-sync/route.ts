import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { isEditableMeetPhase } from "@/lib/meetPhase";
import { requireRole } from "@/lib/rbac";
import { reorderBoutsForMeetUntilStable } from "@/lib/reorderBouts";

const BodySchema = z.object({
  matsToReorder: z.array(z.number().int().min(1).max(6)).max(6).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const bodyResult = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!bodyResult.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const requestedMats = bodyResult.data.matsToReorder ?? [];
  const dryRun = bodyResult.data.dryRun === true;
  if (!dryRun) {
    try {
      await requireMeetLock(meetId, user.id, user.role);
    } catch (err) {
      const lockError = getMeetLockError(err);
      if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
      throw err;
    }
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { id: true, deletedAt: true, homeTeamId: true, status: true, numMats: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team before syncing staff mats." }, { status: 400 });
  }
  if (!isEditableMeetPhase(meet.status)) {
    return NextResponse.json({ error: "Staff-based mat sync is only available before the meet starts." }, { status: 400 });
  }

  const hasResults = await db.bout.findFirst({
    where: { meetId, resultAt: { not: null } },
    select: { id: true },
  });
  if (hasResults) {
    return NextResponse.json({ error: "Cannot sync staff mats after results have been entered." }, { status: 400 });
  }

  const assignMatsModule = await import("@/lib/assignMats");
  const syncPeopleRuleAssignmentsForMeet = assignMatsModule.syncPeopleRuleAssignmentsForMeet;
  if (typeof syncPeopleRuleAssignmentsForMeet !== "function") {
    return NextResponse.json(
      {
        error:
          "Staff mat sync function is unavailable in the current server process. Restart the dev server and try again.",
      },
      { status: 500 },
    );
  }

  const result = await syncPeopleRuleAssignmentsForMeet(meetId, { dryRun });
  if (dryRun) {
    return NextResponse.json({
      ...result,
      reordered: 0,
      reorderedMats: [],
    });
  }
  const maxMat = Math.max(1, Math.min(6, meet.numMats));
  const allMats = Array.from({ length: maxMat }, (_, idx) => idx + 1);
  const shouldReorderAllMats = result.moved > 0 || requestedMats.length > 0;
  const reorderResult =
    shouldReorderAllMats
      ? await reorderBoutsForMeetUntilStable(meetId, {
        numMats: maxMat,
        mats: allMats,
        maxPasses: 8,
      })
      : { reordered: 0, numMats: maxMat };

  if (result.updated > 0 || reorderResult.reordered > 0) {
    const details = [
      `moved ${result.moved} bout${result.moved === 1 ? "" : "s"}`,
      `newly assigned ${result.newlyAssigned}`,
      `cleared ${result.cleared}`,
      `reordered ${reorderResult.reordered} bout${reorderResult.reordered === 1 ? "" : "s"}`,
    ].join(", ");
    const matsLabel = shouldReorderAllMats ? " on all mats" : "";
    await logMeetChange(meetId, user.id, `Synced staff-driven mat assignments${matsLabel} (${details}).`);
  }

  return NextResponse.json({
    ...result,
    reordered: reorderResult.reordered,
    reorderedMats: shouldReorderAllMats ? allMats : [],
  });
}
