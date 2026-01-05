import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  wrestlerId: z.string().min(1),
  status: z.enum(["LATE", "EARLY", "ABSENT"]).nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
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

  const wrestler = await db.wrestler.findUnique({
    where: { id: body.wrestlerId },
    select: { teamId: true },
  });
  if (!wrestler) return NextResponse.json({ error: "Wrestler not found" }, { status: 404 });
  const inMeet = await db.meetTeam.findFirst({
    where: { meetId, teamId: wrestler.teamId },
    select: { teamId: true },
  });
  if (!inMeet) return NextResponse.json({ error: "Wrestler not in this meet" }, { status: 400 });

  if (body.status === null) {
    await db.meetWrestlerStatus.deleteMany({
      where: { meetId, wrestlerId: body.wrestlerId },
    });
  } else {
    await db.meetWrestlerStatus.upsert({
      where: { meetId_wrestlerId: { meetId, wrestlerId: body.wrestlerId } },
      update: { status: body.status },
      create: { meetId, wrestlerId: body.wrestlerId, status: body.status },
    });
  }

  if (body.status === "ABSENT") {
    await db.bout.deleteMany({
      where: {
        meetId,
        OR: [{ redId: body.wrestlerId }, { greenId: body.wrestlerId }],
      },
    });
  } else {
    const statuses = await db.meetWrestlerStatus.findMany({
      where: { meetId, status: "ABSENT" },
      select: { wrestlerId: true },
    });
    const absentIds = new Set(statuses.map(s => s.wrestlerId));
    if (absentIds.size > 0) {
      await db.bout.deleteMany({
        where: {
          meetId,
          OR: [
            { redId: { in: Array.from(absentIds) } },
            { greenId: { in: Array.from(absentIds) } },
          ],
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
