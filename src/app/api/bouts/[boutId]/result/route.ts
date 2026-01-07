import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  winnerId: z.string().nullable().optional(), // null to clear
  type: z.string().trim().min(1).max(20).nullable().optional(),
  score: z.string().trim().min(1).max(20).nullable().optional(),
  period: z.number().int().min(1).max(10).nullable().optional(),
  time: z.string().trim().min(1).max(10).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ boutId: string }> }) {
  const { boutId } = await params;
  const { user } = await requireRole("COACH");

  const body = BodySchema.parse(await req.json());

  const bout = await db.bout.findUnique({
    where: { id: boutId },
    include: { red: true, green: true },
  });
  if (!bout) return NextResponse.json({ error: "Bout not found" }, { status: 404 });

  const absent = await db.meetWrestlerStatus.findMany({
    where: { meetId: bout.meetId, status: { in: ["NOT_COMING"] } },
    select: { wrestlerId: true },
  });
  const absentIds = new Set(absent.map(a => a.wrestlerId));
  if (absentIds.has(bout.redId) || absentIds.has(bout.greenId)) {
    return NextResponse.json({ error: "Cannot record results for a bout with a not-attending wrestler" }, { status: 400 });
  }

  try {
    await requireMeetLock(bout.meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  // Validate winnerId (must be red or green if provided)
  const winnerId = body.winnerId;
  if (winnerId != null) {
    if (winnerId !== bout.redId && winnerId !== bout.greenId) {
      return NextResponse.json({ error: "winnerId must be one of the bout wrestlers" }, { status: 400 });
    }
  }

  const data: {
    resultWinnerId?: string | null;
    resultType?: string | null;
    resultScore?: string | null;
    resultPeriod?: number | null;
    resultTime?: string | null;
    resultNotes?: string | null;
    resultAt: Date;
  } = { resultAt: new Date() };

  if (winnerId !== undefined) data.resultWinnerId = winnerId;
  if (body.type !== undefined) data.resultType = body.type;
  if (body.score !== undefined) data.resultScore = body.score;
  if (body.period !== undefined) data.resultPeriod = body.period;
  if (body.time !== undefined) data.resultTime = body.time;
  if (body.notes !== undefined) data.resultNotes = body.notes;

  const updated = await db.bout.update({
    where: { id: boutId },
    data,
    select: {
      id: true,
      resultWinnerId: true,
      resultType: true,
      resultScore: true,
      resultPeriod: true,
      resultTime: true,
      resultNotes: true,
      resultAt: true,
    },
  });

  return NextResponse.json(updated);
}
