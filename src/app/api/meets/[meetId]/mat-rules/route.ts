import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { homeTeamId: true, deletedAt: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  if (!meet?.homeTeamId) {
    return NextResponse.json({ rules: [] });
  }
  const rules = await db.teamMatRule.findMany({
    where: { teamId: meet.homeTeamId },
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
