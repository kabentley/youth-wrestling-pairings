import type { Prisma } from "@prisma/client";
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

  const data: Prisma.UserUncheckedUpdateInput = {};
  const finalRole = body.role ?? existing.role;
  const finalTeamId = body.teamId !== undefined ? body.teamId : existing.teamId;
  const currentHeadTeam = await db.team.findFirst({
    where: { headCoachId: id },
    select: { name: true, symbol: true },
  });
  if (finalRole === "ADMIN" && currentHeadTeam) {
    const teamLabel = `${currentHeadTeam.name} (${currentHeadTeam.symbol})`;
    return NextResponse.json(
      { error: `Head coach cannot be promoted to admin. Reassign head coach for ${teamLabel} first.` },
      { status: 400 },
    );
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
    data.teamId = body.teamId ?? null;
  }
  if ((finalRole === "COACH" || finalRole === "PARENT" || finalRole === "TABLE_WORKER") && !finalTeamId) {
    const label = finalRole === "COACH" ? "Coaches" : finalRole === "PARENT" ? "Parents" : "Table workers";
    return NextResponse.json({ error: `${label} must be assigned a team` }, { status: 400 });
  }
  if (existing.role === "ADMIN" && finalRole !== "ADMIN") {
    const adminCount = await db.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Cannot remove the last admin" }, { status: 400 });
    }
  }

  const user = await db.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id },
      data,
      select: { id: true, username: true, email: true, phone: true, name: true, role: true, teamId: true },
    });
    const currentHeadTeamRecord = await tx.team.findFirst({
      where: { headCoachId: id },
      select: { id: true },
    });
    if (finalRole === "COACH" && finalTeamId) {
      if (currentHeadTeamRecord && currentHeadTeamRecord.id !== finalTeamId) {
        await tx.team.update({
          where: { id: currentHeadTeamRecord.id },
          data: { headCoachId: null },
        });
      }
      const targetTeam = await tx.team.findUnique({
        where: { id: finalTeamId },
        select: { headCoachId: true },
      });
      if (!targetTeam?.headCoachId || targetTeam.headCoachId === id) {
        await tx.team.update({
          where: { id: finalTeamId },
          data: { headCoachId: id },
        });
      }
      return updatedUser;
    }

    if (currentHeadTeamRecord) {
      await tx.team.update({
        where: { id: currentHeadTeamRecord.id },
        data: { headCoachId: null },
      });
    }
    return updatedUser;
  });
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
