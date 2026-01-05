import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";

const BodySchema = z.object({
  winnerId: z.string().nullable().optional(), // null to clear
  type: z.string().trim().min(1).max(20).nullable().optional(),
  score: z.string().trim().min(1).max(20).nullable().optional(),
  period: z.number().int().min(1).max(10).nullable().optional(),
  time: z.string().trim().min(1).max(10).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { boutId: string } }) {
  const { user } = await requireRole("COACH");

  const body = BodySchema.parse(await req.json());

  const bout = await db.bout.findUnique({
    where: { id: params.boutId },
    include: { red: true, green: true },
  });
  if (!bout) return NextResponse.json({ error: "Bout not found" }, { status: 404 });

  const absent = await db.meetWrestlerStatus.findMany({
    where: { meetId: bout.meetId, status: "ABSENT" },
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
  let winnerId: string | null | undefined = body.winnerId ?? undefined;
  if (winnerId !== undefined && winnerId !== null) {
    const allowed = [bout.redId, bout.greenId].filter(Boolean);
    if (!allowed.includes(winnerId)) {
      return NextResponse.json({ error: "winnerId must be one of the bout wrestlers" }, { status: 400 });
    }
  }

  const updated = await db.bout.update({
    where: { id: params.boutId },
    data: {
      resultWinnerId: winnerId === undefined ? undefined : winnerId,
      resultType: body.type === undefined ? undefined : body.type,
      resultScore: body.score === undefined ? undefined : body.score,
      resultPeriod: body.period === undefined ? undefined : body.period,
      resultTime: body.time === undefined ? undefined : body.time,
      resultNotes: body.notes === undefined ? undefined : body.notes,
      resultAt: new Date(),
    },
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
