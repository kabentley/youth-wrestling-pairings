import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  if (!meetId) {
    return NextResponse.json({ error: "Meet ID required" }, { status: 400 });
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      meetTeams: {
        include: {
          team: {
            select: {
              id: true,
              name: true,
              symbol: true,
              color: true,
            },
          },
        },
      },
    },
  });
  if (!meet) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  const [bouts, statuses] = await Promise.all([
    db.bout.findMany({
      where: { meetId },
      orderBy: [{ mat: "asc" }, { order: "asc" }, { score: "asc" }],
      select: {
        id: true,
        redId: true,
        greenId: true,
        mat: true,
        order: true,
      },
    }),
    db.meetWrestlerStatus.findMany({
      where: { meetId },
      select: { wrestlerId: true, status: true },
    }),
  ]);

  const teamIds = meet.meetTeams.map(mt => mt.teamId);
  const wrestlers =
    teamIds.length > 0
      ? await db.wrestler.findMany({
          where: { teamId: { in: teamIds } },
          select: {
            id: true,
            teamId: true,
            first: true,
            last: true,
          },
        })
      : [];

  return NextResponse.json({ meet, bouts, statuses, wrestlers });
}
