import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireTeamCoach } from "@/lib/rbac";

const MIN_MATS = 1;
const MAX_MATS = 10;

const RuleSchema = z.object({
  matIndex: z.number().int().min(1).max(MAX_MATS),
  color: z.string().trim().max(20).optional(),
  minExperience: z.number().int().min(0).max(50),
  maxExperience: z.number().int().min(0).max(50),
  minAge: z.number().min(0).max(100),
  maxAge: z.number().min(0).max(100),
})
  .refine((rule) => rule.minExperience <= rule.maxExperience, {
    message: "minExperience must be <= maxExperience",
  })
  .refine((rule) => rule.minAge <= rule.maxAge, {
    message: "minAge must be <= maxAge",
  });

const BodySchema = z.object({
  homeTeamPreferSameMat: z.boolean().optional(),
  numMats: z.number().int().min(MIN_MATS).max(MAX_MATS).optional(),
  rules: z.array(RuleSchema).max(MAX_MATS),
});

export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireTeamCoach(teamId);
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      homeTeamPreferSameMat: true,
      numMats: true,
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
    numMats: Math.max(MIN_MATS, Math.min(MAX_MATS, team.numMats)),
    rules: team.matRules,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireTeamCoach(teamId);
  const body = BodySchema.parse(await req.json());

  const desiredNumMats = Math.max(
    MIN_MATS,
    Math.min(MAX_MATS, body.numMats ?? Math.max(body.rules.length, MIN_MATS)),
  );

  await db.team.update({
    where: { id: teamId },
    data: {
      homeTeamPreferSameMat: body.homeTeamPreferSameMat ?? false,
      numMats: desiredNumMats,
    },
  });

  await db.teamMatRule.deleteMany({ where: { teamId } });
  await db.teamMatRule.createMany({
    data: Array.from({ length: desiredNumMats }, (_, index) => {
      const rule = body.rules[index];
      if (rule) {
        return {
          teamId,
          matIndex: index + 1,
          color: rule.color ?? null,
          minExperience: rule.minExperience,
          maxExperience: rule.maxExperience,
          minAge: rule.minAge,
          maxAge: rule.maxAge,
        };
      }
      return {
        teamId,
        matIndex: index + 1,
        color: null,
        minExperience: 0,
        maxExperience: 0,
        minAge: 0,
        maxAge: 0,
      };
    }),
  });

  return NextResponse.json({ ok: true });
}
