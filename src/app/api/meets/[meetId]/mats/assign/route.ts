import { NextResponse } from "next/server";
import { z } from "zod";
import { assignMatsForMeet } from "@/lib/assignMats";
import { requireRole } from "@/lib/rbac";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";

const BodySchema = z.object({
  numMats: z.number().int().min(1).max(10),
  minRestBouts: z.number().int().min(0).max(20),
  restPenalty: z.number().min(0).max(1000),
});

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
  const result = await assignMatsForMeet(params.meetId, body);
  return NextResponse.json(result);
}
