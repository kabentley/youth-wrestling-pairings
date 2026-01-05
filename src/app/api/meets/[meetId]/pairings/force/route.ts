import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";

const BodySchema = z.object({ redId: z.string().min(1), greenId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { meetId: string } }) {
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(params.meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  const body = BodySchema.parse(await req.json());

  await db.bout.deleteMany({
    where: {
      meetId: params.meetId,
      locked: false,
      OR: [
        { redId: body.redId }, { greenId: body.redId },
        { redId: body.greenId }, { greenId: body.greenId },
      ],
    },
  });

  const bout = await db.bout.create({
    data: {
      meetId: params.meetId,
      redId: body.redId,
      greenId: body.greenId,
      type: "counting",
      score: 0,
      locked: true,
      notes: "forced",
    },
  });

  return NextResponse.json(bout);
}
