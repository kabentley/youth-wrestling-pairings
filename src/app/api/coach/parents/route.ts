import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

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
