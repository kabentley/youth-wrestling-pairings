import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { planRosterUpsert } from "@/lib/importRoster";
import { requireRole } from "@/lib/rbac";

const WrestlerRow = z.object({
  first: z.string().min(1),
  last: z.string().min(1),
  weight: z.number().positive(),
  birthdate: z.string().min(4),
  experienceYears: z.number().int().min(0).default(0),
  skill: z.number().int().min(0).max(5).default(3),
});

const BodySchema = z.object({
  teamId: z.string().min(1).optional(),
  teamName: z.string().min(2).optional(),
  teamSymbol: z.string().trim().min(2).max(4).optional(),
  wrestlers: z.array(WrestlerRow).min(1).max(500),
}).refine(v => Boolean(v.teamId ?? v.teamName), {
  message: "Provide teamId or teamName",
});

export async function POST(req: Request) {
  const { user } = await requireRole("COACH");
  const body = BodySchema.parse(await req.json());

  let teamId = body.teamId;
  if (!teamId) {
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can create teams" }, { status: 403 });
    }
    if (!body.teamSymbol) {
      return NextResponse.json({ error: "teamSymbol is required to create a team" }, { status: 400 });
    }
    const existing = await db.team.findUnique({ where: { name: body.teamName! } });
    teamId = existing
      ? existing.id
      : (await db.team.create({
          data: { name: body.teamName!, symbol: body.teamSymbol.trim().toUpperCase() },
        })).id;
  }
  if (user.role !== "ADMIN" && user.teamId !== teamId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingWrestlers = await db.wrestler.findMany({
    where: { teamId },
    select: { id: true, first: true, last: true, birthdate: true },
  });

  const plan = planRosterUpsert({
    teamId,
    incoming: body.wrestlers,
    existing: existingWrestlers,
  });

  for (const u of plan.toUpdate) {
    await db.wrestler.update({
      where: { id: u.id },
      data: { weight: u.weight, experienceYears: u.experienceYears, skill: u.skill },
    });
  }

  if (plan.toCreate.length) {
    await db.wrestler.createMany({ data: plan.toCreate.map(w => ({ ...w, active: true })) });
  }

  return NextResponse.json({
    teamId,
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
  });
}
