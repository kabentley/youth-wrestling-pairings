import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { buildMeetStatusAttribution } from "@/lib/meetStatusAttribution";
import { requireSession } from "@/lib/rbac";

const BodySchema = z.object({
  wrestlerId: z.string().min(1),
  status: z.enum(["COMING", "NOT_COMING"]).nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ meetId: string }> },
) {
  const { meetId } = await params;
  const { userId, user } = await requireSession();
  const body = BodySchema.parse(await req.json());

  const [link, meet, wrestler] = await Promise.all([
    db.userChild.findFirst({
      where: {
        userId,
        wrestlerId: body.wrestlerId,
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
    db.wrestler.findUnique({
      where: { id: body.wrestlerId },
      select: { id: true, first: true, last: true, teamId: true },
    }),
  ]);

  if (!link) {
    return NextResponse.json({ error: "That wrestler is not linked to your account." }, { status: 403 });
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
  if (!wrestler) {
    return NextResponse.json({ error: "Wrestler not found." }, { status: 404 });
  }

  const inMeet = await db.meetTeam.findFirst({
    where: { meetId, teamId: wrestler.teamId },
    select: { teamId: true },
  });
  if (!inMeet) {
    return NextResponse.json({ error: "Wrestler is not in this meet." }, { status: 400 });
  }

  if (body.status === null) {
    await db.meetWrestlerStatus.deleteMany({
      where: { meetId, wrestlerId: body.wrestlerId },
    });
  } else {
    const attribution = buildMeetStatusAttribution(user, "PARENT");
    await db.meetWrestlerStatus.upsert({
      where: { meetId_wrestlerId: { meetId, wrestlerId: body.wrestlerId } },
      update: { status: body.status, ...attribution },
      create: { meetId, wrestlerId: body.wrestlerId, status: body.status, ...attribution },
    });
  }

  await logMeetChange(
    meetId,
    userId,
    `Parent attendance: ${wrestler.first} ${wrestler.last} -> ${body.status === null ? "no reply" : body.status.replace(/_/g, " ").toLowerCase()}.`,
  );

  return NextResponse.json({ ok: true });
}
