import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const PatchSchema = z.object({
  role: z.enum(["ADMIN", "COACH", "PARENT", "TABLE_WORKER"]).optional(),
  teamId: z.string().nullable().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const body = PatchSchema.parse(await req.json());
  const existing = await db.user.findUnique({
    where: { id },
    select: { role: true, teamId: true },
  });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: { role?: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER"; teamId?: string | null; email?: string; phone?: string | null } = {};
  const finalRole = body.role ?? existing.role;
  const finalTeamId = body.teamId !== undefined ? body.teamId : existing.teamId;
  let teamForHeadCheck: { headCoachId: string | null } | null = null;
  if (finalTeamId) {
    teamForHeadCheck = await db.team.findUnique({
      where: { id: finalTeamId },
      select: { headCoachId: true },
    });
    if (teamForHeadCheck && teamForHeadCheck.headCoachId === id && finalRole !== "COACH") {
      return NextResponse.json({ error: "Only admins can remove the head coach role." }, { status: 403 });
    }
  }
  if (body.email) {
    data.email = body.email.trim().toLowerCase();
  }
  if (body.phone) {
    data.phone = body.phone.trim();
  }
  if (body.role) {
    data.role = body.role;
  }
  if (body.teamId !== undefined) {
    data.teamId = body.teamId;
  }
  if ((finalRole === "COACH" || finalRole === "PARENT" || finalRole === "TABLE_WORKER") && !finalTeamId) {
    const label = finalRole === "COACH" ? "Coaches" : finalRole === "PARENT" ? "Parents" : "Table workers";
    return NextResponse.json({ error: `${label} must be assigned a team` }, { status: 400 });
  }

  const user = await db.user.update({
    where: { id },
    data,
    select: { id: true, username: true, email: true, phone: true, name: true, role: true, teamId: true },
  });
  if (finalRole === "COACH" && finalTeamId) {
    const headCoachId = teamForHeadCheck?.headCoachId;
    if (!headCoachId) {
      await db.team.update({
        where: { id: finalTeamId },
        data: { headCoachId: id },
      });
    }
  }
  return NextResponse.json(user);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireAdmin();
  if (user.id === id) {
    return NextResponse.json({ error: "Admins cannot delete themselves" }, { status: 400 });
  }
  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role === "ADMIN") {
    const adminCount = await db.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Cannot delete the last admin" }, { status: 400 });
    }
  }

  await db.meet.updateMany({
    where: { lockedById: id },
    data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
  });
  await db.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
