import { db } from "@/lib/db";

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
