import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { buildMeetStatusAttribution } from "@/lib/meetStatusAttribution";
import { requireRole } from "@/lib/rbac";
import { deleteBoutsAndRenumber } from "@/lib/renumberBouts";

const BodySchema = z.object({
  wrestlerId: z.string().min(1),
  status: z.enum(["COMING", "NOT_COMING", "LATE", "EARLY"]).nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      deletedAt: true,
      status: true,
      homeTeam: { select: { headCoachId: true } },
      meetTeams: { select: { teamId: true } },
      lockAccesses: {
        where: { userId: user.id },
        select: { userId: true },
      },
    },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  const isCoordinator = meet.homeTeam?.headCoachId === user.id;
  const meetPhase = normalizeMeetPhase(meet.status);
  const meetTeamIds = new Set(meet.meetTeams.map((entry) => entry.teamId));
  const userTeamId = user.teamId;
  const isCoachOnMeetTeam = userTeamId !== null && meetTeamIds.has(userTeamId);
  const coachAttendanceScopeWithoutLock: "all" | "team" | null =
    user.role !== "COACH"
      ? null
      : meetPhase === "ATTENDANCE"
        ? isCoordinator
          ? "all"
          : isCoachOnMeetTeam
            ? "team"
            : null
          : null;
  if (!coachAttendanceScopeWithoutLock) {
    try {
      await requireMeetLock(meetId, user.id, user.role);
    } catch (err) {
      const lockError = getMeetLockError(err);
      if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
      throw err;
    }
  }

  const body = BodySchema.parse(await req.json());
  const attribution = buildMeetStatusAttribution(user, "COACH");

  const wrestler = await db.wrestler.findUnique({
    where: { id: body.wrestlerId },
    select: { teamId: true, first: true, last: true },
  });
  if (!wrestler) return NextResponse.json({ error: "Wrestler not found" }, { status: 404 });
  const inMeet = await db.meetTeam.findFirst({
    where: { meetId, teamId: wrestler.teamId },
    select: { teamId: true },
  });
  if (!inMeet) return NextResponse.json({ error: "Wrestler not in this meet" }, { status: 400 });
  if (coachAttendanceScopeWithoutLock === "team" && wrestler.teamId !== userTeamId) {
    return NextResponse.json(
      { error: "Coaches may only edit attendance for their own team during Attendance, or during Draft if they have edit access." },
      { status: 403 },
    );
  }

  if (body.status === null) {
    await db.meetWrestlerStatus.deleteMany({
      where: { meetId, wrestlerId: body.wrestlerId },
    });
  } else {
    await db.meetWrestlerStatus.upsert({
      where: { meetId_wrestlerId: { meetId, wrestlerId: body.wrestlerId } },
      update: { status: body.status, ...attribution },
      create: { meetId, wrestlerId: body.wrestlerId, status: body.status, ...attribution },
    });
  }

  const nonAttendingStatuses = new Set(["NOT_COMING"]);
  if (body.status === null || nonAttendingStatuses.has(body.status)) {
    await deleteBoutsAndRenumber(db, meetId, {
      OR: [{ redId: body.wrestlerId }, { greenId: body.wrestlerId }],
    });
  } else {
    const statuses = await db.meetWrestlerStatus.findMany({
      where: { meetId },
      select: { wrestlerId: true, status: true },
    });
    const nonAttendingIds = new Set(
      statuses
        .filter((status) => status.status === "NOT_COMING")
        .map((status) => status.wrestlerId),
    );
    if (nonAttendingIds.size > 0) {
      await deleteBoutsAndRenumber(db, meetId, {
        OR: [
          { redId: { in: Array.from(nonAttendingIds) } },
          { greenId: { in: Array.from(nonAttendingIds) } },
        ],
      });
    }
  }

  const statusLabel = body.status ?? "NO_REPLY";
  await logMeetChange(
    meetId,
    user.id,
    `Attendance: ${wrestler.first} ${wrestler.last} -> ${statusLabel.replace(/_/g, " ").toLowerCase()}.`
  );

  return NextResponse.json({
    ok: true,
    wrestler: {
      id: body.wrestlerId,
      status: body.status,
      statusChangedByUsername: body.status === null ? null : attribution.lastChangedByUsername,
      statusChangedByRole: body.status === null ? null : attribution.lastChangedByRole,
      statusChangedSource: body.status === null ? null : attribution.lastChangedSource,
      statusChangedAt: body.status === null
        ? null
        : attribution.lastChangedAt.toISOString(),
    },
  });
}
