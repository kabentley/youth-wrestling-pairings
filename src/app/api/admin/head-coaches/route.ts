import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { getUserDisplayName, getUserFullName } from "@/lib/userName";

const UpdateHeadCoachSchema = z.object({
  teamId: z.string().trim().min(1),
  coachId: z.string().trim().min(1).nullable(),
});

export async function GET() {
  await requireAdmin();

  const [teams, coaches] = await Promise.all([
    db.team.findMany({
      orderBy: [{ symbol: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        symbol: true,
        color: true,
        logoData: true,
        headCoachId: true,
        headCoach: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    db.user.findMany({
      where: { role: "COACH" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { username: "asc" }],
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        teamId: true,
        team: {
          select: {
            symbol: true,
          },
        },
        headCoachTeam: {
          select: {
            id: true,
            symbol: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      symbol: team.symbol,
      color: team.color,
      hasLogo: Boolean(team.logoData),
      headCoachId: team.headCoachId ?? null,
      headCoach: team.headCoach
        ? {
            id: team.headCoach.id,
            username: team.headCoach.username,
            name: getUserFullName(team.headCoach),
          }
        : null,
    })),
    coaches: coaches.map((coach) => ({
      id: coach.id,
      username: coach.username,
      name: getUserDisplayName(coach),
      teamId: coach.teamId ?? null,
      teamSymbol: coach.team?.symbol ?? null,
      headCoachTeamId: coach.headCoachTeam?.id ?? null,
      headCoachTeamSymbol: coach.headCoachTeam?.symbol ?? null,
    })),
  });
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();

    const parsed = UpdateHeadCoachSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid head coach assignment." }, { status: 400 });
    }

    const { teamId, coachId } = parsed.data;

    const result = await db.$transaction(async (tx) => {
      const team = await tx.team.findUnique({
        where: { id: teamId },
        select: { id: true, headCoachId: true },
      });
      if (!team) {
        throw new Error("TEAM_NOT_FOUND");
      }

      if (!coachId) {
        const updated = await tx.team.update({
          where: { id: teamId },
          data: { headCoachId: null },
          select: {
            id: true,
            headCoachId: true,
            headCoach: { select: { id: true, username: true, firstName: true, lastName: true } },
          },
        });
        return updated;
      }

      const coach = await tx.user.findUnique({
        where: { id: coachId },
        select: {
          id: true,
          role: true,
          teamId: true,
        },
      });
      if (coach?.role !== "COACH") {
        throw new Error("COACH_NOT_FOUND");
      }

      const existingHeadCoachTeam = await tx.team.findFirst({
        where: { headCoachId: coachId },
        select: { id: true },
      });
      if (existingHeadCoachTeam?.id && existingHeadCoachTeam.id !== teamId) {
        await tx.team.update({
          where: { id: existingHeadCoachTeam.id },
          data: { headCoachId: null },
        });
      }

      if (coach.teamId !== teamId) {
        throw new Error("COACH_NOT_ON_TEAM");
      }

      const updated = await tx.team.update({
        where: { id: teamId },
        data: { headCoachId: coachId },
        select: {
          id: true,
          headCoachId: true,
          headCoach: { select: { id: true, username: true, firstName: true, lastName: true } },
        },
      });
      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "TEAM_NOT_FOUND") {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    if (message === "COACH_NOT_FOUND") {
      return NextResponse.json({ error: "Coach not found." }, { status: 404 });
    }
    if (message === "COACH_NOT_ON_TEAM") {
      return NextResponse.json({ error: "Selected coach must already be assigned to that team." }, { status: 400 });
    }
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to update head coach." }, { status: 500 });
  }
}
