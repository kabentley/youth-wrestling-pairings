import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { buildMeetStatusAttribution } from "@/lib/meetStatusAttribution";
import { requireSession } from "@/lib/rbac";

const UpdateSchema = z.object({
  wrestlerId: z.string().min(1),
  status: z.enum(["COMING", "NOT_COMING"]).nullable(),
});

const BodySchema = z.union([
  UpdateSchema,
  z.object({
    updates: z.array(UpdateSchema).min(1),
  }),
]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ meetId: string }> },
) {
  const { meetId } = await params;
  const { userId, user } = await requireSession();
  const body = BodySchema.parse(await req.json());
  const updates = "updates" in body ? body.updates : [body];
  const wrestlerIds = Array.from(new Set(updates.map((entry) => entry.wrestlerId)));

  const [links, meet, wrestlers] = await Promise.all([
    db.userChild.findMany({
      where: {
        userId,
        wrestlerId: { in: wrestlerIds },
      },
      select: { wrestlerId: true },
    }),
    db.meet.findUnique({
      where: { id: meetId },
      select: {
        id: true,
        deletedAt: true,
        status: true,
        attendanceDeadline: true,
      },
    }),
    db.wrestler.findMany({
      where: { id: { in: wrestlerIds } },
      select: { id: true, first: true, last: true, teamId: true },
    }),
  ]);

  if (links.length !== wrestlerIds.length) {
    return NextResponse.json({ error: "One or more wrestlers are not linked to your account." }, { status: 403 });
  }
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (normalizeMeetPhase(meet.status) !== "ATTENDANCE") {
    return NextResponse.json({ error: "Parent attendance is only available while the meet is in Attendance phase." }, { status: 400 });
  }
  if (meet.attendanceDeadline && new Date() > meet.attendanceDeadline) {
    return NextResponse.json({ error: "The attendance deadline has passed." }, { status: 400 });
  }
  if (wrestlers.length !== wrestlerIds.length) {
    return NextResponse.json({ error: "One or more wrestlers were not found." }, { status: 404 });
  }

  const meetTeams = await db.meetTeam.findMany({
    where: { meetId },
    select: { teamId: true },
  });
  const meetTeamIds = new Set(meetTeams.map((entry) => entry.teamId));
  if (wrestlers.some((wrestler) => !meetTeamIds.has(wrestler.teamId))) {
    return NextResponse.json({ error: "One or more wrestlers are not in this meet." }, { status: 400 });
  }

  const wrestlerMap = new Map(wrestlers.map((wrestler) => [wrestler.id, wrestler]));
  for (const update of updates) {
    const wrestler = wrestlerMap.get(update.wrestlerId);
    if (!wrestler) continue;
    if (update.status === null) {
      await db.meetWrestlerStatus.deleteMany({
        where: { meetId, wrestlerId: update.wrestlerId },
      });
    } else {
      const attribution = buildMeetStatusAttribution(user, "PARENT");
      await db.meetWrestlerStatus.upsert({
        where: { meetId_wrestlerId: { meetId, wrestlerId: update.wrestlerId } },
        update: { status: update.status, ...attribution },
        create: { meetId, wrestlerId: update.wrestlerId, status: update.status, ...attribution },
      });
    }

  }

  return NextResponse.json({ ok: true });
}
