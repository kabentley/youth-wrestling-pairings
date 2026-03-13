import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { isMeetAttendanceStatusAttending, normalizeMeetAttendanceStatus } from "@/lib/meetAttendanceStatus";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { isEditableMeetPhase } from "@/lib/meetPhase";
import { buildCoachSafeStatusAttribution, preserveParentResponseStatus } from "@/lib/meetStatusAttribution";
import { requireRole } from "@/lib/rbac";

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
    select: {
      deletedAt: true,
      status: true,
      meetTeams: { select: { teamId: true } },
    },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!isEditableMeetPhase(meet.status)) {
    return NextResponse.json({ error: "This action is only available before the meet starts." }, { status: 400 });
  }

  const teamIds = meet.meetTeams.map((entry) => entry.teamId);
  const [wrestlers, statuses, bouts] = await Promise.all([
    db.wrestler.findMany({
      where: { teamId: { in: teamIds }, active: true },
      select: { id: true, first: true, last: true },
      orderBy: [{ last: "asc" }, { first: "asc" }],
    }),
    db.meetWrestlerStatus.findMany({
      where: { meetId },
      select: { wrestlerId: true, status: true },
    }),
    db.bout.findMany({
      where: { meetId },
      select: { redId: true, greenId: true },
    }),
  ]);

  const statusByWrestler = new Map(
    statuses.map((entry) => [entry.wrestlerId, normalizeMeetAttendanceStatus(entry.status)]),
  );
  const pairedWrestlerIds = new Set<string>();
  for (const bout of bouts) {
    pairedWrestlerIds.add(bout.redId);
    pairedWrestlerIds.add(bout.greenId);
  }

  const wrestlerIdsToMark = wrestlers
    .filter((wrestler) => isMeetAttendanceStatusAttending(statusByWrestler.get(wrestler.id)) && !pairedWrestlerIds.has(wrestler.id))
    .map((wrestler) => wrestler.id);

  if (wrestlerIdsToMark.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  await db.$transaction(async (tx) => {
    const existingStatuses = await tx.meetWrestlerStatus.findMany({
      where: {
        meetId,
        wrestlerId: { in: wrestlerIdsToMark },
      },
      select: {
        wrestlerId: true,
        parentResponseStatus: true,
        lastChangedById: true,
        lastChangedByUsername: true,
        lastChangedByRole: true,
        lastChangedSource: true,
        lastChangedAt: true,
      },
    });
    const existingStatusByWrestlerId = new Map(existingStatuses.map((row) => [row.wrestlerId, row]));
    for (const wrestlerId of wrestlerIdsToMark) {
      const existingStatus = existingStatusByWrestlerId.get(wrestlerId);
      const safeAttribution = buildCoachSafeStatusAttribution(existingStatus);
      const preservedParentResponseStatus = preserveParentResponseStatus(existingStatus);
      await tx.meetWrestlerStatus.upsert({
        where: { meetId_wrestlerId: { meetId, wrestlerId } },
        update: { status: "NOT_COMING", parentResponseStatus: preservedParentResponseStatus, ...safeAttribution },
        create: { meetId, wrestlerId, status: "NOT_COMING", parentResponseStatus: preservedParentResponseStatus, ...safeAttribution },
      });
    }
  });

  await logMeetChange(
    meetId,
    user.id,
    `Attendance: marked ${wrestlerIdsToMark.length} wrestler${wrestlerIdsToMark.length === 1 ? "" : "s"} with no bouts not coming.`,
  );

  return NextResponse.json({ ok: true, updated: wrestlerIdsToMark.length });
}
