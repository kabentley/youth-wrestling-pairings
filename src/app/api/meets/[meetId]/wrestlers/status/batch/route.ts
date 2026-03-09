import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { buildMeetStatusAttribution } from "@/lib/meetStatusAttribution";
import { requireRole } from "@/lib/rbac";
import { deleteBoutsAndRenumber } from "@/lib/renumberBouts";

const ChangeSchema = z.object({
  wrestlerId: z.string().min(1),
  status: z.enum(["COMING", "NOT_COMING", "LATE", "EARLY"]).nullable(),
});

const BodySchema = z.object({
  changes: z.array(ChangeSchema).min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      deletedAt: true,
      status: true,
      homeTeam: { select: { headCoachId: true } },
    },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  const isCoordinator = meet.homeTeam?.headCoachId === user.id;
  const allowCoachWithoutLock =
    normalizeMeetPhase(meet.status) === "DRAFT" &&
    user.role === "COACH" &&
    Boolean(user.teamId);
  if (!allowCoachWithoutLock) {
    try {
      await requireMeetLock(meetId, user.id, user.role);
    } catch (err) {
      const lockError = getMeetLockError(err);
      if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
      throw err;
    }
  }

  const body = BodySchema.parse(await req.json());
  const uniqueChanges = new Map<string, z.infer<typeof ChangeSchema>>();
  for (const change of body.changes) {
    uniqueChanges.set(change.wrestlerId, change);
  }
  const changes = [...uniqueChanges.values()];
  const wrestlerIds = changes.map(change => change.wrestlerId);

  const [wrestlers, meetTeams] = await Promise.all([
    db.wrestler.findMany({
      where: { id: { in: wrestlerIds } },
      select: { id: true, teamId: true },
    }),
    db.meetTeam.findMany({
      where: { meetId },
      select: { teamId: true },
    }),
  ]);
  if (wrestlers.length !== wrestlerIds.length) {
    return NextResponse.json({ error: "Wrestler not found" }, { status: 404 });
  }
  const meetTeamIds = new Set(meetTeams.map(team => team.teamId));
  for (const wrestler of wrestlers) {
    if (!meetTeamIds.has(wrestler.teamId)) {
      return NextResponse.json({ error: "Wrestler not in this meet" }, { status: 400 });
    }
  }
  if (allowCoachWithoutLock) {
    const unauthorizedWrestler = !isCoordinator
      ? wrestlers.find((wrestler) => wrestler.teamId !== user.teamId)
      : null;
    if (unauthorizedWrestler) {
      return NextResponse.json(
        { error: "Coaches may only edit attendance for their own team during Draft." },
        { status: 403 },
      );
    }
  }

  await db.$transaction(async tx => {
    const changedAt = new Date();
    const attribution = buildMeetStatusAttribution(user, "COACH", changedAt);

    for (const change of changes) {
      if (change.status === null) {
        await tx.meetWrestlerStatus.deleteMany({
          where: { meetId, wrestlerId: change.wrestlerId },
        });
      } else {
        await tx.meetWrestlerStatus.upsert({
          where: { meetId_wrestlerId: { meetId, wrestlerId: change.wrestlerId } },
          update: { status: change.status, ...attribution },
          create: { meetId, wrestlerId: change.wrestlerId, status: change.status, ...attribution },
        });
      }
    }

    const explicitNonAttending = changes
      .filter((change) => change.status === null || change.status === "NOT_COMING")
      .map((change) => change.wrestlerId);
    const absentStatuses = await tx.meetWrestlerStatus.findMany({
      where: { meetId, status: { in: ["NOT_COMING"] } },
      select: { wrestlerId: true },
    });
    const absentIds = [...new Set([...explicitNonAttending, ...absentStatuses.map(status => status.wrestlerId)])];
    if (absentIds.length > 0) {
      await deleteBoutsAndRenumber(tx, meetId, {
        OR: [
          { redId: { in: absentIds } },
          { greenId: { in: absentIds } },
        ],
      });
    }
  });

  await logMeetChange(
    meetId,
    user.id,
    `Attendance: updated ${changes.length} wrestler${changes.length === 1 ? "" : "s"}.`,
  );

  return NextResponse.json({ ok: true });
}
