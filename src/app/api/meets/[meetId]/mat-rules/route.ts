import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthorizationErrorCode, requireMeetParticipant } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let access: Awaited<ReturnType<typeof requireMeetParticipant>>;
  try {
    access = await requireMeetParticipant(meetId);
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
  if (!access.meet.homeTeamId) {
    return NextResponse.json({ rules: [] });
  }
  const rules = await db.teamMatRule.findMany({
    where: { teamId: access.meet.homeTeamId },
    orderBy: { matIndex: "asc" },
    select: {
      matIndex: true,
      color: true,
      minExperience: true,
      maxExperience: true,
      minAge: true,
      maxAge: true,
    },
  });
  return NextResponse.json({ rules });
}
