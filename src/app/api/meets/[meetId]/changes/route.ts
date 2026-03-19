import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthorizationErrorCode, requireMeetParticipant } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
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
  const changes = await db.meetChange.findMany({
    where: { meetId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { username: true } } },
  });
  return NextResponse.json(changes);
}
