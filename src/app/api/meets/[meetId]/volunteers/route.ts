import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const HomeVolunteerRoles = ["COACH", "TABLE_WORKER", "PARENT"] as const;
const HomeVolunteerRolesForQuery = [...HomeVolunteerRoles];

const BodySchema = z.object({
  assignments: z.array(z.object({
    userId: z.string().min(1),
    matNumber: z.number().int().nullable(),
  })).max(500),
});

function roleRank(role: string) {
  if (role === "COACH") return 0;
  if (role === "TABLE_WORKER") return 1;
  if (role === "PARENT") return 2;
  return 3;
}

function isHomeTeamCoach(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return user.role === "COACH" && Boolean(homeTeamId) && Boolean(user.teamId) && user.teamId === homeTeamId;
}

function isHomeTeamAdmin(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return user.role === "ADMIN" && Boolean(homeTeamId) && Boolean(user.teamId) && user.teamId === homeTeamId;
}

function canManageVolunteers(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return isHomeTeamCoach(user, homeTeamId) || isHomeTeamAdmin(user, homeTeamId);
}

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      deletedAt: true,
      numMats: true,
      homeTeamId: true,
      meetTeams: {
        select: {
          team: {
            select: {
              id: true,
              name: true,
              symbol: true,
            },
          },
        },
      },
    },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }

  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team before managing volunteers." }, { status: 400 });
  }
  if (!canManageVolunteers(user, meet.homeTeamId)) {
    return NextResponse.json({ error: "Only home team coaches or admins assigned to the home team can manage volunteers for this meet." }, { status: 403 });
  }

  const volunteers = await db.user.findMany({
    where: {
      teamId: meet.homeTeamId,
      role: { in: HomeVolunteerRolesForQuery },
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      teamId: true,
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
    },
    orderBy: [{ role: "asc" }, { username: "asc" }],
  });

  const maxMat = Math.max(1, Math.min(6, meet.numMats));
  const mapped = volunteers
    .map((entry) => {
      const rawMat = entry.staffMatNumber;
      const matNumber = typeof rawMat === "number" && rawMat >= 1 && rawMat <= maxMat
        ? rawMat
        : null;
      const trimmedName = (entry.name ?? "").trim();
      const displayName = trimmedName.length > 0 ? trimmedName : entry.username;
      return {
        id: entry.id,
        displayName,
        role: entry.role,
        teamId: entry.teamId ?? null,
        matNumber,
        kids: entry.children
          .map((link) => link.wrestler)
          .filter((wrestler) => wrestler.teamId === meet.homeTeamId)
          .sort((a, b) => {
            const lastCmp = a.last.localeCompare(b.last);
            if (lastCmp !== 0) return lastCmp;
            return a.first.localeCompare(b.first);
          })
          .map((wrestler) => `${wrestler.first} ${wrestler.last}`.trim()),
      };
    })
    .sort((a, b) => {
      const aHome = a.teamId && meet.homeTeamId ? a.teamId === meet.homeTeamId : false;
      const bHome = b.teamId && meet.homeTeamId ? b.teamId === meet.homeTeamId : false;
      if (aHome !== bHome) return aHome ? -1 : 1;
      const roleCmp = roleRank(a.role) - roleRank(b.role);
      if (roleCmp !== 0) return roleCmp;
      return a.displayName.localeCompare(b.displayName);
    });

  return NextResponse.json({
    meet: {
      id: meet.id,
      numMats: maxMat,
      homeTeamId: meet.homeTeamId,
      teams: meet.meetTeams.map((entry) => entry.team),
    },
    volunteers: mapped,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  const body = BodySchema.parse(await req.json());
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      deletedAt: true,
      status: true,
      homeTeamId: true,
      numMats: true,
      meetTeams: { select: { teamId: true } },
    },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team before managing volunteers." }, { status: 400 });
  }
  if (meet.status !== "DRAFT") {
    return NextResponse.json({ error: "Volunteer mat changes are only available before the meet starts." }, { status: 400 });
  }
  const hasResults = await db.bout.findFirst({
    where: { meetId, resultAt: { not: null } },
    select: { id: true },
  });
  if (hasResults) {
    return NextResponse.json({ error: "Cannot change volunteer mats after results have been entered." }, { status: 400 });
  }

  if (!canManageVolunteers(user, meet.homeTeamId)) {
    return NextResponse.json({ error: "Only home team coaches or admins assigned to the home team can manage volunteers for this meet." }, { status: 403 });
  }

  const maxMat = Math.max(1, Math.min(6, meet.numMats));
  for (const assignment of body.assignments) {
    if (assignment.matNumber !== null && (assignment.matNumber < 1 || assignment.matNumber > maxMat)) {
      return NextResponse.json({ error: `Mat number must be between 1 and ${maxMat}.` }, { status: 400 });
    }
  }

  const userIds = Array.from(new Set(body.assignments.map((entry) => entry.userId)));
  const volunteers = await db.user.findMany({
    where: {
      id: { in: userIds },
      teamId: meet.homeTeamId,
      role: { in: HomeVolunteerRolesForQuery },
    },
    select: { id: true, staffMatNumber: true },
  });
  const validIds = new Set(volunteers.map((entry) => entry.id));
  const invalid = userIds.find((id) => !validIds.has(id));
  if (invalid) {
    return NextResponse.json({ error: `Invalid volunteer id for this meet: ${invalid}` }, { status: 400 });
  }

  const byUser = new Map<string, number | null>();
  for (const assignment of body.assignments) {
    byUser.set(assignment.userId, assignment.matNumber);
  }

  const assignmentsToUpdate: Array<{ userId: string; matNumber: number | null }> = [];
  const affectedMats = new Set<number>();
  for (const volunteer of volunteers) {
    const nextMat = byUser.get(volunteer.id);
    if (nextMat === undefined) continue;
    const rawCurrent = volunteer.staffMatNumber;
    const currentMat =
      typeof rawCurrent === "number" && rawCurrent >= 1 && rawCurrent <= maxMat
        ? rawCurrent
        : null;
    if (currentMat === nextMat) continue;
    assignmentsToUpdate.push({ userId: volunteer.id, matNumber: nextMat });
    if (currentMat !== null) affectedMats.add(currentMat);
    if (nextMat !== null) affectedMats.add(nextMat);
  }

  await db.$transaction(async (tx) => {
    for (const assignment of assignmentsToUpdate) {
      await tx.user.update({
        where: { id: assignment.userId },
        data: { staffMatNumber: assignment.matNumber },
      });
    }
  });

  const updatedCount = assignmentsToUpdate.length;
  if (updatedCount > 0) {
    await logMeetChange(
      meetId,
      user.id,
      `Updated ${updatedCount} volunteer mat assignment${updatedCount === 1 ? "" : "s"}.`,
    );
  }

  return NextResponse.json({
    ok: true,
    updatedAssignments: updatedCount,
    affectedMats: Array.from(affectedMats).sort((a, b) => a - b),
  });
}
