import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { formatWrestlerLabel } from "@/lib/meetChangeFormat";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { normalizePair, pairKey } from "@/lib/pairKey";
import { requireRole } from "@/lib/rbac";

export async function DELETE(_req: Request, { params }: { params: Promise<{ boutId: string }> }) {
  const { boutId } = await params;
  const { user } = await requireRole("COACH");

  const bout = await db.bout.findUnique({
    where: { id: boutId },
    select: {
      id: true,
      meetId: true,
      redId: true,
      greenId: true,
    },
  });
  if (!bout) return NextResponse.json({ error: "Bout not found" }, { status: 404 });

  try {
    await requireMeetLock(bout.meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  const [wrestlerAId, wrestlerBId] = normalizePair(bout.redId, bout.greenId);
  const key = pairKey(bout.redId, bout.greenId);
  const rejectedPair = await db.$transaction(async (tx) => {
    await tx.bout.delete({ where: { id: boutId } });
    return tx.meetRejectedPair.upsert({
      where: { meetId_pairKey: { meetId: bout.meetId, pairKey: key } },
      update: { createdById: user.id },
      create: {
        meetId: bout.meetId,
        pairKey: key,
        wrestlerAId,
        wrestlerBId,
        createdById: user.id,
      },
      select: {
        pairKey: true,
        createdAt: true,
        createdBy: { select: { username: true, teamId: true, team: { select: { color: true } } } },
        wrestlerA: { select: { first: true, last: true, teamId: true } },
        wrestlerB: { select: { first: true, last: true, teamId: true } },
      },
    });
  });
  const wrestlers = await db.wrestler.findMany({
    where: { id: { in: [bout.redId, bout.greenId] } },
    select: { id: true, first: true, last: true, team: { select: { symbol: true } } },
  });
  const red = wrestlers.find(w => w.id === bout.redId);
  const green = wrestlers.find(w => w.id === bout.greenId);
  const redName = formatWrestlerLabel(red) ?? "wrestler 1";
  const greenName = formatWrestlerLabel(green) ?? "wrestler 2";
  await logMeetChange(bout.meetId, user.id, `Removed match for ${redName} with ${greenName}.`);
  return NextResponse.json({ ok: true, removedBoutId: bout.id, rejectedPair });
}
