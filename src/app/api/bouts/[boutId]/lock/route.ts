import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";

const BodySchema = z.object({ locked: z.boolean() });

export async function PATCH(req: Request, { params }: { params: { boutId: string } }) {
  const { user } = await requireRole("COACH");
  const body = BodySchema.parse(await req.json());

  const bout = await db.bout.findUnique({
    where: { id: params.boutId },
    select: { id: true, meetId: true, redId: true, greenId: true },
  });
  if (!bout) return NextResponse.json({ error: "Bout not found" }, { status: 404 });

  const absent = await db.meetWrestlerStatus.findMany({
    where: { meetId: bout.meetId, status: "ABSENT" },
    select: { wrestlerId: true },
  });
  const absentIds = new Set(absent.map(a => a.wrestlerId));
  if (absentIds.has(bout.redId) || absentIds.has(bout.greenId)) {
    return NextResponse.json({ error: "Cannot lock a bout with a not-attending wrestler" }, { status: 400 });
  }

  try {
    await requireMeetLock(bout.meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  const updated = await db.bout.update({
    where: { id: params.boutId },
    data: { locked: body.locked },
  });

  return NextResponse.json(updated);
}
