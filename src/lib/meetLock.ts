import { db } from "@/lib/db";

/** Server-side lock lifetime for a meet (milliseconds). */
export const MEET_LOCK_TTL_MS = 2 * 60 * 1000;

type MeetLockInfo = {
  lockedByUsername: string | null;
  lockExpiresAt: Date | null;
};

type MeetLockErrorPayload = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Ensures the current user holds the meet lock.
 *
 * - If the stored lock is expired, it is cleared and the request is allowed to continue.
 * - If another user holds the lock, throws `MEET_LOCKED` with display metadata.
 * - If no lock exists, throws `MEET_LOCK_REQUIRED`.
 *
 * Callers typically map these errors to `409` responses via `getMeetLockError`.
 */
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

  if (!meet.lockedById) {
    const err = new Error("MEET_LOCK_REQUIRED");
    throw err;
  }
}

/**
 * Converts a thrown lock error into an HTTP-friendly payload.
 *
 * Returns `null` if the error is not a known meet-lock condition.
 */
export function getMeetLockError(err: unknown): MeetLockErrorPayload | null {
  if (!(err instanceof Error)) return null;
  if (err.message === "MEET_NOT_FOUND") {
    return { status: 404, body: { error: "Meet not found" } };
  }
  if (err.message === "MEET_LOCK_REQUIRED") {
    return { status: 409, body: { error: "Meet lock required" } };
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
