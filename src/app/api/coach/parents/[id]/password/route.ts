import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  password: z.string().trim().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("teamId");
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid password." }, { status: 400 });
  }

  const { user } = await requireRole("COACH");
  const teamId = user.role === "ADMIN" && requestedTeamId
    ? requestedTeamId
    : user.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "You must be assigned a team." }, { status: 403 });
  }
  if (requestedTeamId && user.role !== "ADMIN" && requestedTeamId !== user.teamId) {
    return NextResponse.json({ error: "That team is not assigned to you." }, { status: 403 });
  }

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { headCoachId: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }
  if (user.role !== "ADMIN" && user.id !== team.headCoachId) {
    return NextResponse.json({ error: "Only the head coach or an admin can reset team user passwords." }, { status: 403 });
  }

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, teamId: true, role: true, username: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.teamId !== teamId) {
    return NextResponse.json({ error: "That person is not on your team." }, { status: 403 });
  }
  if (user.role !== "ADMIN" && target.role === "ADMIN") {
    return NextResponse.json({ error: "Only admins can reset admin passwords here." }, { status: 403 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password.trim(), 10);
  await db.user.update({
    where: { id },
    data: {
      passwordHash,
      mustResetPassword: true,
      sessionVersion: { increment: 1 },
    },
  });

  return NextResponse.json({
    reset: {
      id: target.id,
      username: target.username,
      name: target.name,
    },
  });
}
