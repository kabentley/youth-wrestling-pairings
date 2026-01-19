import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const BodySchema = z.object({
  name: z.string().trim().max(100).optional(),
  website: z.string().trim().url().optional().or(z.literal("")),
});

export async function GET() {
  const league = await db.league.findFirst({
    select: { id: true, name: true, logoData: true, website: true },
  });
  return NextResponse.json({
    name: league?.name ?? null,
    hasLogo: Boolean(league?.logoData),
    website: league?.website ?? null,
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

  if (!existing) {
    await db.league.create({ data: { name: body.name ?? null, website: normalizeWebsite(body.website) } });
  } else {
    await db.league.update({
      where: { id: existing.id },
      data: { name: body.name ?? null, website: normalizeWebsite(body.website) },
    });
  }

  return NextResponse.json({ ok: true });
}
