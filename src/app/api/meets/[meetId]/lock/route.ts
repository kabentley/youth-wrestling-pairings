import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { MEET_LOCK_TTL_MS } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  await requireRole("COACH");
  const now = new Date();
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      lockedById: true,
      lockedBy: { select: { username: true } },
      lockedAt: true,
      lockExpiresAt: true,
    },
  });

  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 });

  if (meet.lockExpiresAt && meet.lockExpiresAt < now) {
    await db.meet.update({
      where: { id: meetId },
      data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
    });
    return NextResponse.json({ locked: false });
  }

  return NextResponse.json({
    locked: Boolean(meet.lockedById),
    lockedByUsername: meet.lockedBy?.username ?? null,
    lockExpiresAt: meet.lockExpiresAt ?? null,
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + MEET_LOCK_TTL_MS);

  const updated = await db.meet.updateMany({
    where: {
      id: meetId,
      OR: [
        { lockExpiresAt: null },
        { lockExpiresAt: { lt: now } },
        { lockedById: user.id },
      ],
    },
    data: { lockedById: user.id, lockedAt: now, lockExpiresAt },
  });

  if (updated.count === 0) {
    const meet = await db.meet.findUnique({
      where: { id: meetId },
      select: {
        lockedById: true,
        lockedBy: { select: { username: true } },
        lockExpiresAt: true,
      },
    });

    if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 });

    return NextResponse.json(
      {
        error: "Meet is locked",
        lockedByUsername: meet.lockedBy?.username ?? null,
        lockExpiresAt: meet.lockExpiresAt ?? null,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    locked: true,
    lockedByUsername: null,
    lockExpiresAt,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const where =
    user.role === "ADMIN"
      ? { id: meetId }
      : { id: meetId, lockedById: user.id };

  await db.meet.updateMany({
    where,
    data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
  });
  return NextResponse.json({ ok: true });
}
