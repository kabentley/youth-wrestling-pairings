import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  if (!meetId) {
    return NextResponse.json({ error: "Meet ID required" }, { status: 400 });
  }
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    include: { meetTeams: { include: { team: true } } },
  });
  if (!meet) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { score: "asc" }],
  });

  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId },
    select: { wrestlerId: true, status: true },
  });

  const teamIds = meet.meetTeams.map(mt => mt.teamId);
  const wrestlers = await db.wrestler.findMany({
    where: { teamId: { in: teamIds } },
  });

  return NextResponse.json({ meet, bouts, statuses, wrestlers });
}
