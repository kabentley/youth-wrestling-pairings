import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

const CreateTeamUserSchema = z.object({
  username: z.string().trim().min(6).max(32).refine((value) => !value.includes("@"), {
    message: "Username may not contain @.",
  }),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional().or(z.literal("")),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  role: z.enum(["COACH", "TABLE_WORKER", "PARENT"]).default("TABLE_WORKER"),
  password: z.string().trim().min(1),
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
    name: true,
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
    name: string | null;
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
      name: member.name,
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
    select: { id: true, headCoachId: true },
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

  const passwordHash = await bcrypt.hash(payload.password.trim(), 10);
  const fullName = `${payload.firstName.trim()} ${payload.lastName.trim()}`;
  try {
    const created = await db.user.create({
      data: {
        username,
        email: payload.email ? payload.email.trim().toLowerCase() : "",
        phone: payload.phone ? payload.phone.trim() : "",
        name: fullName,
        role: payload.role,
        teamId,
        passwordHash,
        mustResetPassword: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        teamId: true,
        staffMatNumber: true,
      },
    });
    return NextResponse.json({
      created: {
        id: created.id,
        username: created.username,
        email: created.email,
        phone: created.phone,
        name: created.name,
        role: created.role,
        matNumber: created.staffMatNumber ?? null,
        wrestlerIds: [] as string[],
      },
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
