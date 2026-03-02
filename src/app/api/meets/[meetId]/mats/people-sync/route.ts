import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

export async function POST(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { id: true, deletedAt: true, homeTeamId: true, status: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team before syncing staff mats." }, { status: 400 });
  }
  if (meet.status !== "DRAFT") {
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

  const result = await syncPeopleRuleAssignmentsForMeet(meetId);

  if (result.updated > 0) {
    const details = [
      `moved ${result.moved} bout${result.moved === 1 ? "" : "s"}`,
      `newly assigned ${result.newlyAssigned}`,
      `cleared ${result.cleared}`,
    ].join(", ");
    await logMeetChange(meetId, user.id, `Synced staff-driven mat assignments (${details}).`);
  }

  return NextResponse.json(result);
}
