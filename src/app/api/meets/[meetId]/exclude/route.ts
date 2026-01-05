import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({ aId: z.string().min(1), bId: z.string().min(1) });

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
  const [aId, bId] = body.aId < body.bId ? [body.aId, body.bId] : [body.bId, body.aId];

  await db.excludedPair.upsert({
    where: { meetId_aId_bId: { meetId, aId, bId } },
    update: {},
    create: { meetId, aId, bId },
  });

  return NextResponse.json({ ok: true });
}
