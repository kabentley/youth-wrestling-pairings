import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { z } from "zod";

const PatchSchema = z.object({
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const team = await db.team.findUnique({
    where: { id: params.teamId },
    select: { id: true, name: true, symbol: true, color: true, homeTeamPreferSameMat: true, logoData: true },
  });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  return NextResponse.json({
    id: team.id,
    name: team.name,
    symbol: team.symbol,
    color: team.color,
    homeTeamPreferSameMat: team.homeTeamPreferSameMat,
    hasLogo: Boolean(team.logoData),
  });
}

export async function PATCH(req: Request, { params }: { params: { teamId: string } }) {
  await requireAdmin();
  const body = PatchSchema.parse(await req.json());
  const team = await db.team.update({
    where: { id: params.teamId },
    data: { color: body.color },
    select: { id: true, name: true, symbol: true, color: true, logoData: true },
  });
  return NextResponse.json({ ...team, hasLogo: Boolean(team.logoData) });
}

export async function DELETE(_req: Request, { params }: { params: { teamId: string } }) {
  await requireAdmin();
  await db.team.delete({ where: { id: params.teamId } });
  return NextResponse.json({ ok: true });
}
