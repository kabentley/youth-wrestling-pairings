import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getPhoneValidationError, normalizePhoneNumber } from "@/lib/phone";
import { requireAdmin, requireRole } from "@/lib/rbac";
import { LAST_NAME_SUFFIX_VALIDATION_MESSAGE, lastNameHasDisallowedSuffix, resolveStoredUserName } from "@/lib/userName";

const PatchSchema = z.object({
  role: z.enum(["ADMIN", "COACH", "PARENT", "TABLE_WORKER"]).optional(),
  teamId: z.string().nullable().optional(),
  username: z.string().trim().min(6).refine((value) => !value.includes("@"), {
    message: "Username must not include @",
  }).optional(),
  firstName: z.string().trim().max(60).nullable().optional(),
  lastName: z.string().trim().max(60).nullable().optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  phone: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.lastName !== undefined && lastNameHasDisallowedSuffix(value.lastName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastName"],
      message: LAST_NAME_SUFFIX_VALIDATION_MESSAGE,
    });
  }
  const phoneError = getPhoneValidationError(value.phone);
  if (phoneError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phone"],
      message: phoneError,
    });
  }
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const existing = await db.user.findUnique({
    where: { id },
    select: { role: true, teamId: true, firstName: true, lastName: true },
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
  if (body.email !== undefined) {
    const trimmedEmail = body.email.trim();
    data.email = trimmedEmail.length > 0 ? trimmedEmail.toLowerCase() : "";
  }
  if (body.username !== undefined) {
    data.username = body.username.trim().toLowerCase();
  }
  if (body.phone !== undefined) {
    data.phone = normalizePhoneNumber(body.phone);
  }
  if (body.firstName !== undefined || body.lastName !== undefined) {
    const resolvedName = resolveStoredUserName({
      firstName: body.firstName !== undefined ? body.firstName : existing.firstName,
      lastName: body.lastName !== undefined ? body.lastName : existing.lastName,
    });
    data.firstName = resolvedName.firstName;
    data.lastName = resolvedName.lastName;
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

  let user;
  try {
    user = await db.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data,
        select: { id: true, username: true, firstName: true, lastName: true, email: true, phone: true, role: true, teamId: true },
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
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Username or email is already in use." },
        { status: 409 },
      );
    }
    throw error;
  }
  return NextResponse.json({
    ...user,
    name: resolveStoredUserName({ firstName: user.firstName, lastName: user.lastName }).fullName,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireRole("COACH");
  if (user.id === id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, teamId: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.role !== "ADMIN") {
    if (!user.teamId || !target.teamId || target.teamId !== user.teamId) {
      return NextResponse.json({ error: "You may only delete users on your own team." }, { status: 403 });
    }
    if (target.role === "ADMIN") {
      return NextResponse.json({ error: "Only admins can delete admin accounts." }, { status: 403 });
    }
    const team = await db.team.findUnique({
      where: { id: user.teamId },
      select: { headCoachId: true },
    });
    if (!team?.headCoachId || team.headCoachId !== user.id) {
      return NextResponse.json({ error: "Only the head coach can delete team users." }, { status: 403 });
    }
  }
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
