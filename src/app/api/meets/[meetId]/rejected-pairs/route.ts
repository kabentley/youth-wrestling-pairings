import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { deletedAt: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  const pairs = await db.meetRejectedPair.findMany({
    where: { meetId },
    select: {
      pairKey: true,
      createdAt: true,
      createdBy: { select: { username: true, teamId: true, team: { select: { color: true } } } },
      wrestlerA: { select: { first: true, last: true, teamId: true } },
      wrestlerB: { select: { first: true, last: true, teamId: true } },
    },
  });
  return NextResponse.json({ pairs });
}
