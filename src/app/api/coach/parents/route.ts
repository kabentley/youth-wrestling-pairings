import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getPhoneValidationError, normalizePhoneNumber } from "@/lib/phone";
import { requireRole } from "@/lib/rbac";
import { buildFullName, getUserFullName, LAST_NAME_SUFFIX_VALIDATION_MESSAGE, lastNameHasDisallowedSuffix } from "@/lib/userName";
import { describeWelcomeEmailResult, sendWelcomeEmail } from "@/lib/welcomeEmail";

const CreateTeamUserSchema = z.object({
  username: z.string().trim().min(6).max(32).refine((value) => !value.includes("@"), {
    message: "Username may not contain @.",
  }),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().optional().default(""),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  role: z.enum(["COACH", "TABLE_WORKER", "PARENT"]).default("TABLE_WORKER"),
  password: z.string().trim().min(1),
  wrestlerIds: z.array(z.string().min(1)).max(400).optional().default([]),
}).superRefine((value, ctx) => {
  if (lastNameHasDisallowedSuffix(value.lastName)) {
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

export async function GET(request: Request) {
  const { user } = await requireRole("COACH");
  const url = new URL(request.url);
  const requestedTeamId = url.searchParams.get("teamId");
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
    select: { id: true, name: true, symbol: true, headCoachId: true, numMats: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const memberSelect = {
    id: true,
    username: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    staffMatNumber: true,
    children: {
      select: {
        wrestler: {
          select: {
            id: true,
            first: true,
            last: true,
            teamId: true,
          },
        },
      },
    },
  } as const;

  const mapMember = (member: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string;
    staffMatNumber: number | null;
    children: Array<{
      wrestler: { id: string; first: string; last: string; teamId: string };
    }>;
  }) => {
    const assigned = member.children
      .map((link) => link.wrestler)
      .filter((wrestler) => wrestler.teamId === teamId);
    return {
      id: member.id,
      username: member.username,
      firstName: member.firstName,
      lastName: member.lastName,
      name: getUserFullName(member),
      email: member.email,
      phone: member.phone,
      matNumber: member.staffMatNumber ?? null,
      wrestlerIds: assigned.map((wrestler) => wrestler.id),
    };
  };

  const parents = db.user.findMany({
    where: { teamId, role: "PARENT" },
    select: memberSelect,
    orderBy: { username: "asc" },
  });
  const coaches = db.user.findMany({
    where: { teamId, role: "COACH" },
    select: memberSelect,
    orderBy: { username: "asc" },
  });
  const tableWorkers = db.user.findMany({
    where: { teamId, role: "TABLE_WORKER" },
    select: memberSelect,
    orderBy: { username: "asc" },
  });
  const teamWrestlers = db.wrestler.findMany({
    where: { teamId, active: true },
    select: { id: true, first: true, last: true },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });

  const [parentList, coachList, tableWorkerList, wrestlerList] = await Promise.all([
    parents,
    coaches,
    tableWorkers,
    teamWrestlers,
  ]);
  return NextResponse.json({
    team,
    parents: parentList.map(mapMember),
    coaches: coachList.map(mapMember),
    tableWorkers: tableWorkerList.map(mapMember),
    teamWrestlers: wrestlerList.map((wrestler) => ({
      id: wrestler.id,
      first: wrestler.first,
      last: wrestler.last,
    })),
  });
}

export async function POST(request: Request) {
  const { user } = await requireRole("COACH");
  const url = new URL(request.url);
  const requestedTeamId = url.searchParams.get("teamId");
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
    select: { id: true, name: true, symbol: true, headCoachId: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }
  if (user.role !== "ADMIN" && user.id !== team.headCoachId) {
    return NextResponse.json({ error: "Only the head coach or an admin can add team users." }, { status: 403 });
  }

  const parsed = CreateTeamUserSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const payload = parsed.data;
  const username = payload.username.trim().toLowerCase();
  const existing = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Username already taken." }, { status: 409 });
  }

  const wrestlerIds = Array.from(new Set(payload.wrestlerIds));
  if (wrestlerIds.length > 0) {
    const validWrestlers = await db.wrestler.findMany({
      where: { teamId, id: { in: wrestlerIds } },
      select: { id: true },
    });
    if (validWrestlers.length !== wrestlerIds.length) {
      return NextResponse.json(
        { error: "One or more wrestlers are not on this team." },
        { status: 400 },
      );
    }
  }

  const passwordHash = await bcrypt.hash(payload.password.trim(), 10);
  try {
    const created = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username,
          email: payload.email ? payload.email.trim().toLowerCase() : "",
          phone: normalizePhoneNumber(payload.phone),
          firstName: payload.firstName.trim(),
          lastName: payload.lastName.trim(),
          role: payload.role,
          teamId,
          passwordHash,
          mustResetPassword: true,
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          teamId: true,
          staffMatNumber: true,
        },
      });
      if (wrestlerIds.length > 0) {
        await Promise.all(
          wrestlerIds.map((wrestlerId) =>
            tx.userChild.create({
              data: {
                userId: createdUser.id,
                wrestlerId,
              },
            }),
          ),
        );
      }
      return createdUser;
    });
    let welcomeEmailStatus: "not_applicable" | "sent" | "skipped" | "logged" | "failed" = "not_applicable";
    let welcomeEmailNote: string | null = null;
    if (created.email.trim()) {
      try {
        const welcomeResult = await sendWelcomeEmail({
          request,
          email: created.email,
          username: created.username,
          fullName: buildFullName(created.firstName, created.lastName),
          userId: created.id,
          tempPassword: payload.password.trim(),
          teamId,
          teamName: team.name,
          teamLabel: `${team.name} (${team.symbol})`,
        });
        welcomeEmailStatus = welcomeResult.status;
        welcomeEmailNote = describeWelcomeEmailResult(welcomeResult);
      } catch {
        welcomeEmailStatus = "failed";
        welcomeEmailNote = "Welcome email could not be sent.";
      }
    }
    return NextResponse.json({
      created: {
        id: created.id,
        username: created.username,
        firstName: created.firstName,
        lastName: created.lastName,
        email: created.email,
        phone: created.phone,
        name: getUserFullName(created),
        role: created.role,
        matNumber: created.staffMatNumber ?? null,
        wrestlerIds,
      },
      welcomeEmailStatus,
      welcomeEmailNote,
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Username already taken." }, { status: 409 });
    }
    throw error;
  }
}
