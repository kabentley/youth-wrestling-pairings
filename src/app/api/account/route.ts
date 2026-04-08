import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getPhoneValidationError, normalizePhoneNumber } from "@/lib/phone";
import { requireSession } from "@/lib/rbac";
import { LAST_NAME_SUFFIX_VALIDATION_MESSAGE, getUserFullName, lastNameHasDisallowedSuffix, resolveStoredUserName } from "@/lib/userName";

const BodySchema = z.object({
  firstName: z.string().trim().max(60).nullable().optional(),
  lastName: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().optional(),
  teamId: z.string().trim().optional().or(z.literal("")),
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

export async function GET() {
  const { user } = await requireSession();
  const full = await db.user.findUnique({
    where: { id: user.id },
    select: {
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      teamId: true,
      team: { select: { name: true, symbol: true } },
    },
  });
  if (!full) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const teamLabel = full.team ? `${full.team.name} (${full.team.symbol})`.trim() : null;
  return NextResponse.json({
    username: full.username,
    firstName: full.firstName,
    lastName: full.lastName,
    name: getUserFullName(full),
    email: full.email,
    phone: full.phone,
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
  const { firstName, lastName, email, phone, teamId } = parsed.data;

  const current = await db.user.findUnique({
    where: { id: user.id },
    select: { firstName: true, lastName: true },
  });
  if (!current) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
    phone?: string;
    teamId?: string | null;
  } = {};
  if (firstName !== undefined || lastName !== undefined) {
    const resolvedName = resolveStoredUserName({
      firstName: firstName !== undefined ? firstName : current.firstName,
      lastName: lastName !== undefined ? lastName : current.lastName,
    });
    data.firstName = resolvedName.firstName;
    data.lastName = resolvedName.lastName;
  }
  if (email) {
    data.email = email.trim().toLowerCase();
  }
  if (phone !== undefined) {
    data.phone = normalizePhoneNumber(phone);
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
    select: { username: true, firstName: true, lastName: true, email: true, phone: true, role: true, teamId: true },
  });
  return NextResponse.json({
    ...updated,
    name: getUserFullName(updated),
  });
}
