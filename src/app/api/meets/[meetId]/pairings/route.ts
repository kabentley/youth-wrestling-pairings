import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

export async function GET(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { deletedAt: true },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { score: "asc" }],
  });
  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: { in: ["NOT_COMING"] } },
    select: { wrestlerId: true },
  });
  const absentIds = new Set(statuses.map(s => s.wrestlerId));
  const filtered = bouts.filter(b => !absentIds.has(b.redId) && !absentIds.has(b.greenId));
  return NextResponse.json(filtered);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  await db.bout.deleteMany({ where: { meetId } });
  await logMeetChange(meetId, user.id, "Restarted meet setup and cleared pairings.");
  revalidatePath(`/meets/${meetId}`);
  revalidatePath("/meets");
  return NextResponse.json({ ok: true });
}
