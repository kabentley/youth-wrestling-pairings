import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeamCoach } from "@/lib/rbac";
import { z } from "zod";

const RuleSchema = z.object({
  matIndex: z.number().int().min(1).max(10),
  color: z.string().trim().max(20).optional(),
  minExperience: z.number().int().min(0).max(50),
  maxExperience: z.number().int().min(0).max(50),
  minAge: z.number().min(0).max(100),
  maxAge: z.number().min(0).max(100),
}).refine((rule) => rule.minExperience <= rule.maxExperience, {
  message: "minExperience must be <= maxExperience",
}).refine((rule) => rule.minAge <= rule.maxAge, {
  message: "minAge must be <= maxAge",
});

const BodySchema = z.object({
  homeTeamPreferSameMat: z.boolean().optional(),
  rules: z.array(RuleSchema).max(10),
});

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  await requireTeamCoach(params.teamId);
  const team = await db.team.findUnique({
    where: { id: params.teamId },
    select: {
      homeTeamPreferSameMat: true,
      matRules: {
        orderBy: { matIndex: "asc" },
        select: {
          matIndex: true,
          color: true,
          minExperience: true,
          maxExperience: true,
          minAge: true,
          maxAge: true,
        },
      },
    },
  });

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  return NextResponse.json({
    homeTeamPreferSameMat: team.homeTeamPreferSameMat,
    rules: team.matRules,
  });
}

export async function PUT(req: Request, { params }: { params: { teamId: string } }) {
  await requireTeamCoach(params.teamId);
  const body = BodySchema.parse(await req.json());

  await db.team.update({
    where: { id: params.teamId },
    data: { homeTeamPreferSameMat: body.homeTeamPreferSameMat ?? false },
  });

  await db.teamMatRule.deleteMany({ where: { teamId: params.teamId } });
  if (body.rules.length > 0) {
    await db.teamMatRule.createMany({
      data: body.rules.map(rule => ({
        teamId: params.teamId,
        matIndex: rule.matIndex,
        color: rule.color ?? null,
        minExperience: rule.minExperience,
        maxExperience: rule.maxExperience,
        minAge: rule.minAge,
        maxAge: rule.maxAge,
      })),
    });
  }

  return NextResponse.json({ ok: true });
}
