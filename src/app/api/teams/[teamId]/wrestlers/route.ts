import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession, requireTeamCoach } from "@/lib/rbac";

const WrestlerSchema = z.object({
  first: z.string().min(1),
  last: z.string().min(1),
  weight: z.number().positive(),
  birthdate: z.string(),
  experienceYears: z.number().int().min(0),
  skill: z.number().int().min(0).max(5),
});

async function respondUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(_: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  try {
    await requireSession();
  } catch {
    return respondUnauthorized();
  }
  const url = new URL(_.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";

  const wrestlers = await db.wrestler.findMany({
    where: {
      teamId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });
  return NextResponse.json(wrestlers);
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  try {
    await requireTeamCoach(teamId);
  } catch {
    return respondUnauthorized();
  }
  const body = await req.json();
  const parsed = WrestlerSchema.parse(body);

  const w = await db.wrestler.create({
    data: {
      teamId,
      first: parsed.first,
      last: parsed.last,
      weight: parsed.weight,
      birthdate: new Date(parsed.birthdate),
      experienceYears: parsed.experienceYears,
      skill: parsed.skill,
      active: true,
    },
  });

  return NextResponse.json(w);
}
