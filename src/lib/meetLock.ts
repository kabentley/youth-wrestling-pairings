import { db } from "@/lib/db";

export const MEET_LOCK_TTL_MS = 2 * 60 * 1000;

type MeetLockInfo = {
  lockedByUsername: string | null;
  lockExpiresAt: Date | null;
};

type MeetLockErrorPayload = {
  status: number;
  body: Record<string, unknown>;
};

export async function requireMeetLock(meetId: string, userId: string) {
  const now = new Date();
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      lockedById: true,
      lockExpiresAt: true,
      lockedBy: { select: { username: true } },
    },
  });

  if (!meet) {
    const err = new Error("MEET_NOT_FOUND");
    throw err;
  }

  if (meet.lockExpiresAt && meet.lockExpiresAt < now) {
    await db.meet.update({
      where: { id: meetId },
      data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
    });
    return;
  }

  if (meet.lockedById && meet.lockedById !== userId) {
    const err = new Error("MEET_LOCKED") as Error & MeetLockInfo;
    err.lockedByUsername = meet.lockedBy?.username ?? "another user";
    err.lockExpiresAt = meet.lockExpiresAt ?? null;
    throw err;
  }
}

export function getMeetLockError(err: unknown): MeetLockErrorPayload | null {
  if (!(err instanceof Error)) return null;
  if (err.message === "MEET_NOT_FOUND") {
    return { status: 404, body: { error: "Meet not found" } };
  }
  if (err.message === "MEET_LOCKED") {
    const info = err as Error & MeetLockInfo;
    return {
      status: 409,
      body: {
        error: "Meet is locked",
        lockedByUsername: info.lockedByUsername ?? null,
        lockExpiresAt: info.lockExpiresAt ?? null,
      },
    };
  }
  return null;
}
