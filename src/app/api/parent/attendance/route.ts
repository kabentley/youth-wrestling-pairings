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

export async function GET() {
  const { userId, user } = await requireSession();

  const childLinks = await db.userChild.findMany({
    where: { userId },
    select: { wrestlerId: true },
  });
  if (childLinks.length === 0) {
    return NextResponse.json({ meets: [] });
  }

  const childIds = childLinks.map((entry) => entry.wrestlerId);
  const childWrestlers = await db.wrestler.findMany({
    where: { id: { in: childIds } },
    select: {
      id: true,
      first: true,
      last: true,
      teamId: true,
      team: { select: { name: true, symbol: true, color: true } },
    },
  });
  const childTeamIds = Array.from(new Set(childWrestlers.map((wrestler) => wrestler.teamId)));
  if (childTeamIds.length === 0) {
    return NextResponse.json({ meets: [] });
  }

  const meets = await db.meet.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ATTENDANCE", "CREATED", "DRAFT"] },
      meetTeams: { some: { teamId: { in: childTeamIds } } },
    },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      status: true,
      attendanceDeadline: true,
      homeTeam: {
        select: {
          name: true,
          symbol: true,
          address: true,
          headCoach: { select: { name: true, username: true } },
        },
      },
      meetTeams: { select: { teamId: true } },
    },
    orderBy: [{ date: "asc" }],
  });

  if (meets.length === 0) {
    return NextResponse.json({ meets: [] });
  }

  const meetIds = meets.map((meet) => meet.id);
  const statuses = await db.meetWrestlerStatus.findMany({
    where: {
      meetId: { in: meetIds },
      wrestlerId: { in: childIds },
    },
    select: { meetId: true, wrestlerId: true, status: true },
  });
  const statusMap = new Map(
    statuses.map((entry) => [`${entry.meetId}:${entry.wrestlerId}`, normalizeParentAttendanceStatus(entry.status)]),
  );
  const parentTeam = user.teamId
    ? await db.team.findUnique({
        where: { id: user.teamId },
        select: { headCoach: { select: { name: true, username: true } } },
      })
    : null;
  const headCoachName = parentTeam?.headCoach?.name?.trim() || parentTeam?.headCoach?.username || null;

  return NextResponse.json({
    meets: meets.map((meet) => {
      const meetTeamIds = new Set(meet.meetTeams.map((entry) => entry.teamId));
      const meetChildren = childWrestlers
        .filter((wrestler) => meetTeamIds.has(wrestler.teamId))
        .sort((a, b) => {
          const lastCompare = a.last.localeCompare(b.last);
          if (lastCompare !== 0) return lastCompare;
          return a.first.localeCompare(b.first);
        });
      const children = meetChildren.map((wrestler) => ({
        id: wrestler.id,
        first: wrestler.first,
        last: wrestler.last,
        attendanceStatus: statusMap.get(`${meet.id}:${wrestler.id}`) ?? null,
      }));
      const homeTeamLabel = meet.homeTeam ? `${meet.homeTeam.name} (${meet.homeTeam.symbol})`.trim() : null;
      return {
        id: meet.id,
        name: meet.name,
        date: meet.date,
        location: meet.location ?? meet.homeTeam?.address ?? null,
        homeTeam: homeTeamLabel,
        headCoachName,
        status: normalizeMeetPhase(meet.status),
        attendanceDeadline: meet.attendanceDeadline,
        canEditAttendance:
          normalizeMeetPhase(meet.status) === "ATTENDANCE" &&
          (!meet.attendanceDeadline || meet.attendanceDeadline.getTime() > Date.now()),
        children,
      };
    }),
  });
}
