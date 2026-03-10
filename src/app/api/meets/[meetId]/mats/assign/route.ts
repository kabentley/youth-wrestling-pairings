import { NextResponse } from "next/server";
import { z } from "zod";

import { assignMatsForMeet } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  numMats: z.number().int().min(1).max(8),
  minRestBouts: z.number().int().min(0).max(20),
  restPenalty: z.number().min(0).max(1000),
});

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id, user.role);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  const body = BodySchema.parse(await req.json());
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { homeTeamId: true, deletedAt: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team before assigning mats." }, { status: 400 });
  }
  const result = await assignMatsForMeet(meetId, body);
  await logMeetChange(meetId, user.id, "Assigned mats.");
  return NextResponse.json(result);
}
