import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { isEditableMeetPhase } from "@/lib/meetPhase";
import { buildMeetStatusAttribution } from "@/lib/meetStatusAttribution";
import { requireRole } from "@/lib/rbac";

function normalizeAttendanceStatus(status?: string | null) {
  if (status === "ABSENT") return "NOT_COMING";
  if (status === "COMING" || status === "LATE" || status === "EARLY") return status;
  return "NOT_COMING";
}

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
    statuses.map((entry) => [entry.wrestlerId, normalizeAttendanceStatus(entry.status)]),
  );
  const pairedWrestlerIds = new Set<string>();
  for (const bout of bouts) {
    pairedWrestlerIds.add(bout.redId);
    pairedWrestlerIds.add(bout.greenId);
  }

  const wrestlerIdsToMark = wrestlers
    .filter((wrestler) => statusByWrestler.get(wrestler.id) !== "NOT_COMING" && !pairedWrestlerIds.has(wrestler.id))
    .map((wrestler) => wrestler.id);

  if (wrestlerIdsToMark.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const changedAt = new Date();
  const attribution = buildMeetStatusAttribution(user, "COACH", changedAt);
  await db.$transaction(async (tx) => {
    for (const wrestlerId of wrestlerIdsToMark) {
      await tx.meetWrestlerStatus.upsert({
        where: { meetId_wrestlerId: { meetId, wrestlerId } },
        update: { status: "NOT_COMING", ...attribution },
        create: { meetId, wrestlerId, status: "NOT_COMING", ...attribution },
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
