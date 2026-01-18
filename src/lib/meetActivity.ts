import { db } from "@/lib/db";

/**
 * Records an audit entry for a meet change and updates `meet.updatedById`.
 *
 * This is used to power "last edited by" UI and to provide a lightweight change
 * log for collaboration.
 */
export async function logMeetChange(meetId: string, userId: string, message: string) {
  await db.meetChange.create({
    data: {
      meetId,
      actorId: userId,
      message,
    },
  });

  await db.meet.update({
    where: { id: meetId },
    data: { updatedById: userId },
  });
}
