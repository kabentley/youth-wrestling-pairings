import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { requireSession } from "@/lib/rbac";

type ParentAttendanceStatus = "COMING" | "NOT_COMING" | null;

function normalizeParentAttendanceStatus(status?: string | null): ParentAttendanceStatus {
  if (status === "NOT_COMING" || status === "ABSENT") return "NOT_COMING";
  if (status === "COMING" || status === "LATE" || status === "EARLY") return "COMING";
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ meetId: string }> },
) {
  const { meetId } = await params;
  const { userId } = await requireSession();

  const children = await db.userChild.findMany({
    where: { userId },
    select: { wrestlerId: true },
  });
  if (children.length === 0) {
    return NextResponse.json({ error: "No linked wrestlers." }, { status: 404 });
  }

  const childIds = children.map((c) => c.wrestlerId);
  const childTeamIds = await db.wrestler.findMany({
    where: { id: { in: childIds } },
    select: { teamId: true },
  });
  const teamIds = Array.from(new Set(childTeamIds.map((entry) => entry.teamId)));
  const hasAccess = await db.meet.findFirst({
    where: {
      id: meetId,
      deletedAt: null,
      OR: [
        { meetTeams: { some: { teamId: { in: teamIds } } } },
        { bouts: { some: { OR: [{ redId: { in: childIds } }, { greenId: { in: childIds } }] } } },
      ],
    },
    select: { id: true },
  });
  if (!hasAccess) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      attendanceDeadline: true,
      status: true,
      location: true,
      homeTeam: { select: { name: true, symbol: true, address: true } },
      meetTeams: { select: { teamId: true } },
      deletedAt: true,
    },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found." }, { status: 404 });

  const wrestlers = await db.wrestler.findMany({
    where: {
      id: { in: childIds },
      teamId: { in: meet.meetTeams.map((entry) => entry.teamId) },
    },
    select: {
      id: true,
      first: true,
      last: true,
      team: { select: { name: true, symbol: true, color: true } },
    },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });
  const statuses = wrestlers.length > 0
    ? await db.meetWrestlerStatus.findMany({
        where: {
          meetId,
          wrestlerId: { in: wrestlers.map((wrestler) => wrestler.id) },
        },
        select: { wrestlerId: true, status: true },
      })
    : [];
  const statusMap = new Map(statuses.map((entry) => [entry.wrestlerId, normalizeParentAttendanceStatus(entry.status)]));
  const location = meet.location ?? (meet.homeTeam ? meet.homeTeam.address : null);
  const homeTeamLabel = meet.homeTeam ? `${meet.homeTeam.name} (${meet.homeTeam.symbol})`.trim() : null;
  const canEditAttendance = normalizeMeetPhase(meet.status) === "ATTENDANCE";

  return NextResponse.json({
    id: meet.id,
    name: meet.name,
    date: meet.date,
    attendanceDeadline: meet.attendanceDeadline,
    status: meet.status,
    location,
    homeTeam: homeTeamLabel,
    canEditAttendance,
    children: wrestlers.map((wrestler) => ({
      id: wrestler.id,
      first: wrestler.first,
      last: wrestler.last,
      teamName: wrestler.team.name,
      teamSymbol: wrestler.team.symbol,
      teamColor: wrestler.team.color,
      attendanceStatus: statusMap.get(wrestler.id) ?? null,
    })),
  });
}
