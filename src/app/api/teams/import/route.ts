import { Prisma } from "@prisma/client";
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
  experienceYears: z.number().int().min(0),
  skill: z.number().int().min(0).max(5),
  isGirl: z.boolean().optional(),
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
  let user: Awaited<ReturnType<typeof requireRole>>["user"];
  try {
    ({ user } = await requireRole("COACH"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Coaches or admins only." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const bodyResult = BodySchema.safeParse(await req.json());
  if (!bodyResult.success) {
    const detail = bodyResult.error.issues.map((issue) => issue.message).join("; ");
    return NextResponse.json({ error: detail || "Invalid roster data." }, { status: 400 });
  }
  const body = bodyResult.data;

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
    select: { id: true, first: true, last: true, birthdate: true, weight: true, experienceYears: true, skill: true, isGirl: true },
  });

  const plan = planRosterUpsert({
    teamId,
    incoming: body.wrestlers,
    existing: existingWrestlers,
  });

  if (plan.toUpdate.length) {
    await db.$transaction(
      plan.toUpdate.map(u =>
        db.wrestler.update({
          where: { id: u.id },
          data: {
            weight: u.weight,
            birthdate: u.birthdate,
            experienceYears: u.experienceYears,
            skill: u.skill,
            ...(u.isGirl !== undefined ? { isGirl: u.isGirl } : {}),
          },
        }),
      ),
    );
  }

  let createdCount = 0;
  if (plan.toCreate.length) {
    for (const w of plan.toCreate) {
      try {
        await db.wrestler.create({
          data: { ...w, active: true },
        });
        createdCount += 1;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          continue;
        }
        throw err;
      }
    }
  }

  return NextResponse.json({
    teamId,
    created: createdCount,
    updated: plan.toUpdate.length,
  });
}
