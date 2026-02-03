import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { formatWrestlerLabel } from "@/lib/meetChangeFormat";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
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

  await db.bout.delete({ where: { id: boutId } });
  const wrestlers = await db.wrestler.findMany({
    where: { id: { in: [bout.redId, bout.greenId] } },
    select: { id: true, first: true, last: true, team: { select: { symbol: true } } },
  });
  const red = wrestlers.find(w => w.id === bout.redId);
  const green = wrestlers.find(w => w.id === bout.greenId);
  const redName = formatWrestlerLabel(red) ?? "wrestler 1";
  const greenName = formatWrestlerLabel(green) ?? "wrestler 2";
  await logMeetChange(bout.meetId, user.id, `Removed match for ${redName} with ${greenName}.`);
  return NextResponse.json({ ok: true });
}
