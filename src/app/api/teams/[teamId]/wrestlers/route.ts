import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const WrestlerSchema = z.object({
  first: z.string().min(1),
  last: z.string().min(1),
  weight: z.number().positive(),
  birthdate: z.string(),
  experienceYears: z.number().int().min(0),
  skill: z.number().int().min(0).max(5),
});

export async function GET(_: Request, { params }: { params: { teamId: string } }) {
  const url = new URL(_.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  const wrestlers = await db.wrestler.findMany({
    where: { teamId: params.teamId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });
  return NextResponse.json(wrestlers);
}

export async function POST(req: Request) {
  await requireRole("COACH");
  const body = await req.json();
  const parsed = WrestlerSchema.parse(body);

  const w = await db.wrestler.create({
    data: {
      teamId: params.teamId,
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
