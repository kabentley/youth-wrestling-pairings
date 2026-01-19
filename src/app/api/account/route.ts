import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

const BodySchema = z.object({
  email: z.string().trim().email().optional(),
  teamId: z.string().trim().optional().or(z.literal("")),
});

export async function GET() {
  const { user } = await requireSession();
  const full = await db.user.findUnique({
    where: { id: user.id },
    select: {
      username: true,
      email: true,
      role: true,
      teamId: true,
      team: { select: { name: true, symbol: true } },
    },
  });
  if (!full) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const teamLabel = full.team ? `${full.team.name} (${full.team.symbol})`.trim() : null;
  return NextResponse.json({
    username: full.username,
    email: full.email,
    role: full.role,
    teamId: full.teamId,
    team: teamLabel,
  });
}

export async function PATCH(req: Request) {
  const { user } = await requireSession();
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { email, teamId } = parsed.data;

  const data: { email?: string; teamId?: string | null } = {};
  if (email) {
    data.email = email.trim().toLowerCase();
  }
  if (teamId !== undefined) {
    const nextTeamId = teamId.trim() || null;
    const canChangeTeam = user.role === "PARENT" || user.role === "ADMIN";
    if (!canChangeTeam) {
      return NextResponse.json({ error: "Only parents and admins can change their team." }, { status: 403 });
    }
    if (!nextTeamId) {
      return NextResponse.json({ error: "Select a team." }, { status: 400 });
    }
    const team = await db.team.findUnique({ where: { id: nextTeamId }, select: { id: true } });
    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    data.teamId = nextTeamId;
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: { username: true, email: true, role: true, teamId: true },
  });
  return NextResponse.json(updated);
}
