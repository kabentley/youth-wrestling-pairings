import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

const MeetSchema = z.object({
  name: z.string().min(2),
  date: z.string(),
  location: z.string().optional(),
  teamIds: z.array(z.string()).min(2).max(4),
  homeTeamId: z.string().nullable().optional(),
  numMats: z.number().int().min(1).max(10).default(4),
  allowSameTeamMatches: z.boolean().default(false),
  matchesPerWrestler: z.number().int().min(1).max(5).default(1),
});

export async function GET() {
  const meets = await db.meet.findMany({
    orderBy: { date: "desc" },
    include: { meetTeams: { include: { team: true } } },
  });
  return NextResponse.json(meets);
}

export async function POST(req: Request) {
  await requireRole("COACH");
  const body = await req.json();
  const parsed = MeetSchema.parse(body);
  if (parsed.homeTeamId && !parsed.teamIds.includes(parsed.homeTeamId)) {
    return NextResponse.json({ error: "homeTeamId must be one of teamIds" }, { status: 400 });
  }

  const meet = await db.meet.create({
    data: {
      name: parsed.name,
      date: new Date(parsed.date),
      location: parsed.location,
      homeTeamId: parsed.homeTeamId ?? null,
      numMats: parsed.numMats,
      allowSameTeamMatches: parsed.allowSameTeamMatches,
      matchesPerWrestler: parsed.matchesPerWrestler,
      meetTeams: { create: parsed.teamIds.map(teamId => ({ teamId })) },
    },
    include: { meetTeams: { include: { team: true } } },
  });

  return NextResponse.json(meet);
}
