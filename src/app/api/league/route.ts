import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { z } from "zod";

const BodySchema = z.object({
  name: z.string().trim().max(100).optional(),
});

export async function GET() {
  const league = await db.league.findFirst({
    select: { id: true, name: true, logoData: true },
  });
  return NextResponse.json({
    name: league?.name ?? null,
    hasLogo: Boolean(league?.logoData),
  });
}

export async function PUT(req: Request) {
  await requireAdmin();
  const body = BodySchema.parse(await req.json());
  const existing = await db.league.findFirst({ select: { id: true } });

  if (!existing) {
    await db.league.create({ data: { name: body.name ?? null } });
  } else {
    await db.league.update({
      where: { id: existing.id },
      data: { name: body.name ?? null },
    });
  }

  return NextResponse.json({ ok: true });
}
