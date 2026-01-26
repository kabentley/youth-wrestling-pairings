import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const BodySchema = z.object({
  name: z.string().trim().max(100).optional(),
  website: z.string().trim().url().optional().or(z.literal("")),
  ageAllowancePctPerYear: z.number().min(0).max(2).optional(),
  experienceAllowancePctPerYear: z.number().min(0).max(2).optional(),
  skillAllowancePctPerPoint: z.number().min(0).max(2).optional(),
  maxAgeGapYears: z.number().min(0.5).max(2.5).optional(),
  maxWeightDiffPct: z.number().min(7.5).max(15).optional(),
});

export async function GET() {
  const league = await db.league.findFirst({
    select: {
      id: true,
      name: true,
      logoData: true,
      website: true,
      ageAllowancePctPerYear: true,
      experienceAllowancePctPerYear: true,
      skillAllowancePctPerPoint: true,
      maxAgeGapYears: true,
      maxWeightDiffPct: true,
    },
  });
  const defaults = {
    ageAllowancePctPerYear: 0.5,
    experienceAllowancePctPerYear: 0.25,
    skillAllowancePctPerPoint: 0.4,
    maxAgeGapYears: 1,
    maxWeightDiffPct: 10,
  };
  return NextResponse.json({
    name: league?.name ?? null,
    hasLogo: Boolean(league?.logoData),
    website: league?.website ?? null,
    ageAllowancePctPerYear: league?.ageAllowancePctPerYear ?? defaults.ageAllowancePctPerYear,
    experienceAllowancePctPerYear: league?.experienceAllowancePctPerYear ?? defaults.experienceAllowancePctPerYear,
    skillAllowancePctPerPoint: league?.skillAllowancePctPerPoint ?? defaults.skillAllowancePctPerPoint,
    maxAgeGapYears: league?.maxAgeGapYears ?? defaults.maxAgeGapYears,
    maxWeightDiffPct: league?.maxWeightDiffPct ?? defaults.maxWeightDiffPct,
  });
}

function normalizeWebsite(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function PUT(req: Request) {
  await requireAdmin();
  const body = BodySchema.parse(await req.json());
  const existing = await db.league.findFirst({ select: { id: true } });

  const data = {
    name: body.name ?? null,
    website: normalizeWebsite(body.website),
    ageAllowancePctPerYear: body.ageAllowancePctPerYear,
    experienceAllowancePctPerYear: body.experienceAllowancePctPerYear,
    skillAllowancePctPerPoint: body.skillAllowancePctPerPoint,
    maxAgeGapYears: body.maxAgeGapYears,
    maxWeightDiffPct: body.maxWeightDiffPct,
  };
  if (!existing) {
    await db.league.create({ data });
  } else {
    await db.league.update({
      where: { id: existing.id },
      data,
    });
  }

  return NextResponse.json({ ok: true });
}
