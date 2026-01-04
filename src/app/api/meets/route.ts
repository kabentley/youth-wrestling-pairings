import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const MeetSchema = z.object({
  name: z.string().min(2),
  date: z.string(),
  location: z.string().optional(),
  teamIds: z.array(z.string()).min(2).max(4),
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

  const meet = await db.meet.create({
    data: {
      name: parsed.name,
      date: new Date(parsed.date),
      location: parsed.location,
      meetTeams: { create: parsed.teamIds.map(teamId => ({ teamId })) },
    },
    include: { meetTeams: { include: { team: true } } },
  });

  return NextResponse.json(meet);
}
