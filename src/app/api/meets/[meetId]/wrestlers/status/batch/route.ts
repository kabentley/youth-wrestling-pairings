import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

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
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
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

  await db.$transaction(async tx => {
    const historyEntries = changes.map(change => ({
      meetId,
      wrestlerId: change.wrestlerId,
      status: change.status ?? "COMING",
      changedById: user.id,
    }));

    for (const change of changes) {
      if (change.status === null) {
        await tx.meetWrestlerStatus.deleteMany({
          where: { meetId, wrestlerId: change.wrestlerId },
        });
      } else {
        await tx.meetWrestlerStatus.upsert({
          where: { meetId_wrestlerId: { meetId, wrestlerId: change.wrestlerId } },
          update: { status: change.status },
          create: { meetId, wrestlerId: change.wrestlerId, status: change.status },
        });
      }
    }

    await tx.meetWrestlerStatusHistory.createMany({
      data: historyEntries,
    });

    const absentStatuses = await tx.meetWrestlerStatus.findMany({
      where: { meetId, status: { in: ["NOT_COMING"] } },
      select: { wrestlerId: true },
    });
    const absentIds = absentStatuses.map(status => status.wrestlerId);
    if (absentIds.length > 0) {
      await tx.bout.deleteMany({
        where: {
          meetId,
          OR: [
            { redId: { in: absentIds } },
            { greenId: { in: absentIds } },
          ],
        },
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
