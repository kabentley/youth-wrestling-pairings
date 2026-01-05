import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { z } from "zod";

const TeamSchema = z.object({
  name: z.string().trim().min(2),
  symbol: z.string().trim().min(2).max(4),
  color: z.string().trim().optional(),
});

export async function GET() {
  const teams = await db.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, symbol: true, color: true, logoData: true },
  });
  return NextResponse.json(
    teams.map((t) => ({
      id: t.id,
      name: t.name,
      symbol: t.symbol,
      color: t.color,
      hasLogo: Boolean(t.logoData),
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
      color: parsed.color?.trim() || "#000000",
    },
  });
  return NextResponse.json(team);
}
