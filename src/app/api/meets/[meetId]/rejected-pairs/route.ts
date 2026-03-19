import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthorizationErrorCode, requireMeetParticipant } from "@/lib/rbac";

export async function GET(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  try {
    await requireMeetParticipant(meetId);
  } catch (error) {
    const code = getAuthorizationErrorCode(error);
    if (code === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (code === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Meet not found" }, { status: 404 });
    }
    throw error;
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
