import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  await requireRole("COACH");
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      homeTeamId: true,
      numMats: true,
      allowSameTeamMatches: true,
      matchesPerWrestler: true,
    },
  });
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  return NextResponse.json(meet);
}
