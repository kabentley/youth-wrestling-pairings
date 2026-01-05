import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { z } from "zod";

const BodySchema = z.object({
  wrestlerId: z.string().min(1),
  status: z.enum(["LATE", "EARLY", "ABSENT"]).nullable(),
});

export async function PATCH(req: Request, { params }: { params: { meetId: string } }) {
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(params.meetId, user.id);
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
    where: { meetId: params.meetId, teamId: wrestler.teamId },
    select: { teamId: true },
  });
  if (!inMeet) return NextResponse.json({ error: "Wrestler not in this meet" }, { status: 400 });

  if (body.status === null) {
    await db.meetWrestlerStatus.deleteMany({
      where: { meetId: params.meetId, wrestlerId: body.wrestlerId },
    });
  } else {
    await db.meetWrestlerStatus.upsert({
      where: { meetId_wrestlerId: { meetId: params.meetId, wrestlerId: body.wrestlerId } },
      update: { status: body.status },
      create: { meetId: params.meetId, wrestlerId: body.wrestlerId, status: body.status },
    });
  }

  if (body.status === "ABSENT") {
    await db.bout.deleteMany({
      where: {
        meetId: params.meetId,
        OR: [{ redId: body.wrestlerId }, { greenId: body.wrestlerId }],
      },
    });
  } else {
    const statuses = await db.meetWrestlerStatus.findMany({
      where: { meetId: params.meetId, status: "ABSENT" },
      select: { wrestlerId: true },
    });
    const absentIds = new Set(statuses.map(s => s.wrestlerId));
    if (absentIds.size > 0) {
      await db.bout.deleteMany({
        where: {
          meetId: params.meetId,
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
