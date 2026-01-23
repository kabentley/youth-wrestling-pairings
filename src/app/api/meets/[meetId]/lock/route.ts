import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { MEET_LOCK_TTL_MS } from "@/lib/meetLock";
import { requireAnyRole } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  try {
    await requireAnyRole(["COACH", "TABLE_WORKER", "ADMIN"]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to edit meets." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const now = new Date();
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      lockedById: true,
      lockedBy: { select: { username: true } },
      lockedAt: true,
      lockExpiresAt: true,
      deletedAt: true,
    },
  });

  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });

  if (meet.lockExpiresAt && meet.lockExpiresAt < now) {
    await db.meet.update({
      where: { id: meetId },
      data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
    });
    return NextResponse.json({ locked: false });
  }

  const lockedByUsername = meet.lockedBy ? meet.lockedBy.username : null;
  return NextResponse.json({
    locked: Boolean(meet.lockedById),
    lockedByUsername,
    lockExpiresAt: meet.lockExpiresAt ?? null,
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let user: Awaited<ReturnType<typeof requireAnyRole>>["user"];
  try {
    ({ user } = await requireAnyRole(["COACH", "TABLE_WORKER", "ADMIN"]));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to edit meets." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + MEET_LOCK_TTL_MS);

  const updated = await db.meet.updateMany({
    where: {
      id: meetId,
      deletedAt: null,
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
        deletedAt: true,
      },
    });

    if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });

    return NextResponse.json(
      {
        error: "Meet is locked",
        lockedByUsername: meet.lockedBy ? meet.lockedBy.username : null,
        lockExpiresAt: meet.lockExpiresAt ?? null,
      },
      { status: 409 },
    );
  }

  if (process.env.LOCK_ACTIVITY_LOG === "true") {
    console.log("meet-lock-acquire", {
      meetId,
      userId: user.id,
      role: user.role,
      at: new Date().toISOString(),
    });
  }
  return NextResponse.json({
    locked: true,
    lockedByUsername: null,
    lockExpiresAt,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let user: Awaited<ReturnType<typeof requireAnyRole>>["user"];
  try {
    ({ user } = await requireAnyRole(["COACH", "TABLE_WORKER", "ADMIN"]));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to edit meets." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const where =
    user.role === "ADMIN"
      ? { id: meetId, deletedAt: null }
      : { id: meetId, lockedById: user.id, deletedAt: null };

  const updated = await db.meet.updateMany({
    where,
    data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
  });
  if (updated.count === 0) {
    const meet = await db.meet.findUnique({
      where: { id: meetId },
      select: {
        lockedById: true,
        lockedBy: { select: { username: true } },
        lockExpiresAt: true,
        deletedAt: true,
      },
    });
    if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
    if (meet.lockedById) {
      return NextResponse.json(
        {
          error: "Meet is locked",
          lockedByUsername: meet.lockedBy ? meet.lockedBy.username : null,
          lockExpiresAt: meet.lockExpiresAt ?? null,
        },
        { status: 409 },
      );
    }
  }
  if (process.env.LOCK_ACTIVITY_LOG === "true") {
    console.log("meet-lock-release", {
      meetId,
      userId: user.id,
      role: user.role,
      at: new Date().toISOString(),
      reason: new URL(_req.url).searchParams.get("reason") ?? null,
    });
  }
  return NextResponse.json({ ok: true });
}
