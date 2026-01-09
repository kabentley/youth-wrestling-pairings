import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin, requireSession } from "@/lib/rbac";

const TeamSchema = z.object({
  name: z.string().trim().min(2),
  symbol: z.string().trim().min(2).max(4),
  color: z.string().trim().optional(),
  address: z.string().trim().optional(),
  website: z.string().trim().url().optional().or(z.literal("")),
});

async function ensureSession() {
  try {
    await requireSession();
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await ensureSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const teams = await db.team.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      symbol: true,
      color: true,
      logoData: true,
      address: true,
      website: true,
      headCoachId: true,
      headCoach: { select: { id: true, username: true } },
      coaches: { where: { role: "COACH" }, select: { id: true, username: true } },
    },
  });
  return NextResponse.json(
    teams.map((t) => ({
      id: t.id,
      name: t.name,
      symbol: t.symbol,
      color: t.color,
      address: t.address,
      website: t.website,
      hasLogo: Boolean(t.logoData),
      headCoachId: t.headCoachId ?? null,
      headCoach: t.headCoach ? { id: t.headCoach.id, username: t.headCoach.username } : null,
      coaches: t.coaches.map((c) => ({ id: c.id, username: c.username })),
    })),
  );
}

export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json();
  const parsed = TeamSchema.parse(body);
  const team = await db.team.create({
    data: {
      name: parsed.name.trim(),
      symbol: parsed.symbol.trim().toUpperCase(),
      color: parsed.color?.trim() ?? "#000000",
      address: parsed.address?.trim() || null,
      website: parsed.website?.trim() || null,
    },
  });
  return NextResponse.json(team);
}
