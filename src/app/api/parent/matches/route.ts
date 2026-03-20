import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { requireSession } from "@/lib/rbac";

type AttendanceStatus = "COMING" | "NOT_COMING" | "ABSENT" | null;

function normalizeAttendanceStatus(status?: string | null): AttendanceStatus {
  if (status === "ABSENT") return "ABSENT";
  if (status === "NOT_COMING") return "NOT_COMING";
  if (status === "COMING" || status === "LATE" || status === "EARLY") return "COMING";
  return null;
}

function hasRecordedResult(bout: {
  resultWinnerId: string | null;
  resultType: string | null;
  resultScore: string | null;
  resultTime: string | null;
}) {
  return bout.resultWinnerId !== null
    || (bout.resultType?.trim() ?? "") !== ""
    || (bout.resultScore?.trim() ?? "") !== ""
    || (bout.resultTime?.trim() ?? "") !== "";
}

export async function GET() {
  let userId: string;
  try {
    ({ userId } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const [currentUser, children] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        teamId: true,
        staffMatNumber: true,
      },
    }),
    db.userChild.findMany({
      where: { userId },
      select: {
        wrestler: {
          select: {
            id: true,
            guid: true,
            first: true,
            last: true,
            teamId: true,
            birthdate: true,
            weight: true,
            experienceYears: true,
            team: { select: { name: true, symbol: true, color: true } },
          },
        },
      },
    }),
  ]);

  if (children.length === 0) {
    return NextResponse.json({
      currentUser: currentUser
        ? {
          id: currentUser.id,
          name: currentUser.name,
          username: currentUser.username,
          role: currentUser.role,
          teamId: currentUser.teamId,
          staffMatNumber: currentUser.staffMatNumber ?? null,
        }
        : null,
      children: [],
      meets: [],
      pastMatches: [],
    });
  }

  const childIds = children.map((c) => c.wrestler.id);
  const childTeamIds = Array.from(new Set(children.map((c) => c.wrestler.teamId)));

  const [bouts, meetStatuses, teamMeets] = await Promise.all([
    db.bout.findMany({
      where: {
        OR: [{ redId: { in: childIds } }, { greenId: { in: childIds } }],
      },
      select: {
        id: true,
        meetId: true,
        redId: true,
        greenId: true,
        mat: true,
        order: true,
        resultWinnerId: true,
        resultType: true,
        resultScore: true,
        resultPeriod: true,
        resultTime: true,
        meet: {
          select: {
            id: true,
            name: true,
            date: true,
            resultsCompletedAt: true,
            location: true,
            status: true,
            attendanceDeadline: true,
            checkinStartAt: true,
            checkinDurationMinutes: true,
            homeTeamId: true,
            numMats: true,
            meetTeams: { select: { teamId: true, checkinCompletedAt: true } },
          },
        },
      },
      orderBy: [{ meet: { date: "asc" } }, { mat: "asc" }, { order: "asc" }],
    }),
    db.meetWrestlerStatus.findMany({
      where: { wrestlerId: { in: childIds } },
      select: { meetId: true, wrestlerId: true, status: true },
    }),
    db.meet.findMany({
      where: {
        deletedAt: null,
        status: { in: ["ATTENDANCE", "CREATED", "READY_FOR_CHECKIN", "PUBLISHED"] },
        meetTeams: { some: { teamId: { in: childTeamIds } } },
      },
      select: {
        id: true,
        name: true,
        date: true,
        resultsCompletedAt: true,
        location: true,
        status: true,
        attendanceDeadline: true,
        checkinStartAt: true,
        checkinDurationMinutes: true,
        homeTeamId: true,
        numMats: true,
        meetTeams: { select: { teamId: true, checkinCompletedAt: true } },
      },
      orderBy: [{ date: "asc" }],
    }),
  ]);

  const wrestlerIds = new Set<string>();
  const formatOpponent = (
    wrestler: { teamId: string; team?: { name?: string | null; symbol?: string | null; color?: string | null } } | undefined,
  ) => {
    const team = wrestler?.team ?? null;
    const opponentTeam =
      team?.symbol ??
      team?.name ??
      wrestler?.teamId ??
      "";
    const opponentTeamColor = team?.color ?? "#000000";
    return { opponentTeam, opponentTeamColor };
  };

  for (const b of bouts) {
    wrestlerIds.add(b.redId);
    wrestlerIds.add(b.greenId);
  }

  const wrestlers = wrestlerIds.size > 0
    ? await db.wrestler.findMany({
        where: { id: { in: Array.from(wrestlerIds) } },
        select: { id: true, first: true, last: true, teamId: true, team: { select: { name: true, symbol: true, color: true } } },
      })
    : [];
  const wMap = new Map(wrestlers.map((w) => [w.id, w]));
  const childMap = new Map(children.map((c) => [c.wrestler.id, c.wrestler]));
  const statusMap = new Map(
    meetStatuses.map((entry) => [`${entry.meetId}:${entry.wrestlerId}`, normalizeAttendanceStatus(entry.status)]),
  );

  const meetMap = new Map<string, {
    meet: {
      id: string;
      name: string;
      date: Date;
      location: string | null;
      status: string | null;
      attendanceDeadline: Date | null;
      checkinStartAt: Date | null;
      checkinDurationMinutes: number | null;
      homeTeamId: string | null;
      numMats: number;
      meetTeams: Array<{
        teamId: string;
        checkinCompletedAt: Date | null;
      }>;
    };
    matches: Array<Record<string, unknown>>;
    children: Array<{
      childId: string;
      first: string;
      last: string;
      teamSymbol?: string | null;
      teamName: string;
      teamColor?: string | null;
      attendanceStatus: AttendanceStatus;
      teamCheckinCompleted: boolean;
    }>;
  }>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastMatches: Array<Record<string, unknown>> = [];

  for (const meet of teamMeets) {
    const linkedChildren = children
      .map((entry) => entry.wrestler)
      .filter((wrestler) => meet.meetTeams.some((team) => team.teamId === wrestler.teamId))
      .map((wrestler) => ({
        childId: wrestler.id,
        first: wrestler.first,
        last: wrestler.last,
        teamSymbol: wrestler.team.symbol,
        teamName: wrestler.team.name,
        teamColor: wrestler.team.color,
        attendanceStatus: statusMap.get(`${meet.id}:${wrestler.id}`) ?? null,
        teamCheckinCompleted: meet.meetTeams.some((team) => team.teamId === wrestler.teamId && team.checkinCompletedAt != null),
      }));
    meetMap.set(meet.id, { meet, matches: [], children: linkedChildren });
  }

  for (const b of bouts) {
    const meet = b.meet;
    if (!meetMap.has(meet.id)) {
      meetMap.set(meet.id, { meet, matches: [], children: [] });
    }

    if (childIds.includes(b.redId)) {
      const opp = wMap.get(b.greenId);
      const { opponentTeam, opponentTeamColor } = formatOpponent(opp);
      const match = {
        boutId: b.id,
        childId: b.redId,
        corner: "red",
        opponentId: b.greenId,
        opponentName: opp ? `${opp.first} ${opp.last}` : b.greenId,
        opponentTeam,
        opponentTeamColor,
        mat: b.mat,
        order: b.order,
        result: {
          winnerId: b.resultWinnerId ?? null,
          type: b.resultType ?? null,
          score: b.resultScore ?? null,
          period: b.resultPeriod ?? null,
          time: b.resultTime ?? null,
        },
      };
      meetMap.get(meet.id)!.matches.push(match);
      if (meet.date < today || hasRecordedResult(b)) {
        pastMatches.push({
          ...match,
          meetId: meet.id,
          meetName: meet.name,
          meetDate: meet.date,
          resultsCompletedAt: meet.resultsCompletedAt,
        });
      }
    }
    if (childIds.includes(b.greenId)) {
      const opp = wMap.get(b.redId);
      const { opponentTeam, opponentTeamColor } = formatOpponent(opp);
      const match = {
        boutId: b.id,
        childId: b.greenId,
        corner: "green",
        opponentId: b.redId,
        opponentName: opp ? `${opp.first} ${opp.last}` : b.redId,
        opponentTeam,
        opponentTeamColor,
        mat: b.mat,
        order: b.order,
        result: {
          winnerId: b.resultWinnerId ?? null,
          type: b.resultType ?? null,
          score: b.resultScore ?? null,
          period: b.resultPeriod ?? null,
          time: b.resultTime ?? null,
        },
      };
      meetMap.get(meet.id)!.matches.push(match);
      if (meet.date < today || hasRecordedResult(b)) {
        pastMatches.push({
          ...match,
          meetId: meet.id,
          meetName: meet.name,
          meetDate: meet.date,
          resultsCompletedAt: meet.resultsCompletedAt,
        });
      }
    }
  }

  const meets = Array.from(meetMap.values()).sort((a, b) => a.meet.date.getTime() - b.meet.date.getTime());

  return NextResponse.json({
    currentUser: currentUser
      ? {
        id: currentUser.id,
        name: currentUser.name,
        username: currentUser.username,
        role: currentUser.role,
        teamId: currentUser.teamId,
        staffMatNumber: currentUser.staffMatNumber ?? null,
      }
      : null,
    children: children.map((c) => ({
      id: c.wrestler.id,
      guid: c.wrestler.guid,
      first: c.wrestler.first,
      last: c.wrestler.last,
      teamId: c.wrestler.teamId,
      teamName: c.wrestler.team.name,
      teamSymbol: c.wrestler.team.symbol,
      teamColor: c.wrestler.team.color,
      birthdate: c.wrestler.birthdate,
      weight: c.wrestler.weight,
      experienceYears: c.wrestler.experienceYears,
    })),
    meets: meets.map((entry) => ({
      meet: {
        id: entry.meet.id,
        name: entry.meet.name,
        date: entry.meet.date,
        location: entry.meet.location,
        status: normalizeMeetPhase(entry.meet.status),
        attendanceDeadline: entry.meet.attendanceDeadline,
        checkinStartAt: entry.meet.checkinStartAt,
        checkinDurationMinutes: entry.meet.checkinDurationMinutes,
        homeTeamId: entry.meet.homeTeamId,
        numMats: entry.meet.numMats,
      },
      matches: entry.matches,
      children: entry.children.length > 0
        ? entry.children
        : childIds
          .filter((childId) => childMap.has(childId))
          .map((childId) => {
            const child = childMap.get(childId)!;
            return {
              childId: child.id,
              first: child.first,
              last: child.last,
              teamSymbol: child.team.symbol,
              teamName: child.team.name,
              teamColor: child.team.color,
              attendanceStatus: statusMap.get(`${entry.meet.id}:${child.id}`) ?? null,
              teamCheckinCompleted: entry.meet.meetTeams.some((team) => team.teamId === child.teamId && team.checkinCompletedAt != null),
            };
          }),
    })),
    pastMatches,
  });
}
