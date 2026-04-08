import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getPhoneValidationError, normalizePhoneNumber } from "@/lib/phone";
import { requireRole } from "@/lib/rbac";
import { getUserFullName, LAST_NAME_SUFFIX_VALIDATION_MESSAGE, lastNameHasDisallowedSuffix, resolveStoredUserName } from "@/lib/userName";

const PatchSchema = z.object({
  username: z.string().trim().min(6).max(32).refine((value) => !value.includes("@"), {
    message: "Username may not contain @.",
  }),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  phone: z.string().default(""),
}).superRefine((value, ctx) => {
  if (!value.firstName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstName"], message: "First name is required." });
  }
  if (!value.lastName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lastName"], message: "Last name is required." });
  }
  if (value.lastName && lastNameHasDisallowedSuffix(value.lastName)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lastName"], message: LAST_NAME_SUFFIX_VALIDATION_MESSAGE });
  }
  const phoneError = getPhoneValidationError(value.phone);
  if (phoneError) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: phoneError });
  }
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("teamId");
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid team user details." }, { status: 400 });
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
    return NextResponse.json({ error: "Only the head coach or an admin can edit team users." }, { status: 403 });
  }

  const target = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      teamId: true,
      role: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.teamId !== teamId) {
    return NextResponse.json({ error: "That person is not on your team." }, { status: 403 });
  }
  if (user.role !== "ADMIN" && target.role === "ADMIN") {
    return NextResponse.json({ error: "Only admins can edit admin accounts here." }, { status: 403 });
  }
  const resolvedName = resolveStoredUserName({
    firstName: parsed.data.firstName ?? target.firstName,
    lastName: parsed.data.lastName ?? target.lastName,
  });

  try {
    const updated = await db.user.update({
      where: { id },
      data: {
        username: parsed.data.username.trim().toLowerCase(),
        firstName: resolvedName.firstName,
        lastName: resolvedName.lastName,
        email: parsed.data.email.trim().toLowerCase(),
        phone: normalizePhoneNumber(parsed.data.phone),
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        staffMatNumber: true,
        children: {
          select: {
            wrestler: {
              select: {
                id: true,
                teamId: true,
              },
            },
          },
        },
      },
    });
    return NextResponse.json({
      updated: {
        id: updated.id,
        username: updated.username,
        firstName: updated.firstName,
        lastName: updated.lastName,
        name: getUserFullName(updated),
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        matNumber: updated.staffMatNumber ?? null,
        wrestlerIds: updated.children
          .map((link) => link.wrestler)
          .filter((wrestler) => wrestler.teamId === teamId)
          .map((wrestler) => wrestler.id),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Username or email is already in use." }, { status: 409 });
    }
    throw error;
  }
}
