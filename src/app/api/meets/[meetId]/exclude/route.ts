import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";

const BodySchema = z.object({ aId: z.string().min(1), bId: z.string().min(1) });

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
  const [aId, bId] = body.aId < body.bId ? [body.aId, body.bId] : [body.bId, body.aId];

  await db.excludedPair.upsert({
    where: { meetId_aId_bId: { meetId: params.meetId, aId, bId } },
    update: {},
    create: { meetId: params.meetId, aId, bId },
  });

  return NextResponse.json({ ok: true });
}
