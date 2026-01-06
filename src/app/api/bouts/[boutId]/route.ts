import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

export async function DELETE(_req: Request, { params }: { params: Promise<{ boutId: string }> }) {
  const { boutId } = await params;
  const { user } = await requireRole("COACH");

  const bout = await db.bout.findUnique({
    where: { id: boutId },
    select: { id: true, meetId: true },
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
  return NextResponse.json({ ok: true });
}
