import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({ redId: z.string().min(1), greenId: z.string().min(1) });

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
  const absent = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: "ABSENT", wrestlerId: { in: [body.redId, body.greenId] } },
    select: { wrestlerId: true },
  });
  if (absent.length > 0) {
    return NextResponse.json({ error: "Cannot create a match for a not-attending wrestler" }, { status: 400 });
  }

  const existing = await db.bout.findFirst({
    where: {
      meetId,
      OR: [
        { redId: body.redId, greenId: body.greenId },
        { redId: body.greenId, greenId: body.redId },
      ],
    },
  });
  if (existing) return NextResponse.json(existing);

  const bout = await db.bout.create({
    data: {
      meetId,
      redId: body.redId,
      greenId: body.greenId,
      type: "counting",
      score: 0,
      notes: "forced",
    },
  });

  return NextResponse.json(bout);
}
