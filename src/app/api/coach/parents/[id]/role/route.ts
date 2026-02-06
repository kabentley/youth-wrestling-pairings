import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

const RoleSchema = z.object({
  role: z.enum(["COACH", "TABLE_WORKER", "PARENT"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("teamId");
  const body = await req.json();
  const parsed = RoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
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
  const target = await db.user.findUnique({
    where: { id },
    select: { role: true, teamId: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.teamId !== teamId) {
    return NextResponse.json({ error: "That person is not on your team." }, { status: 403 });
  }
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { headCoachId: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }
  if (team.headCoachId === id && parsed.data.role !== "COACH" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can remove the head coach role." }, { status: 403 });
  }

  const updated = await db.user.update({
    where: { id },
    data: { role: parsed.data.role, teamId },
    select: { id: true, username: true, role: true, email: true, name: true, phone: true },
  });
  if (parsed.data.role === "COACH" && !team.headCoachId) {
    await db.team.update({
      where: { id: teamId },
      data: { headCoachId: id },
    });
  }
  return NextResponse.json({ updated });
}
