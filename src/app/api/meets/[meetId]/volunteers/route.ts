import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { isEditableMeetPhase } from "@/lib/meetPhase";
import { requireRole } from "@/lib/rbac";

const HomeVolunteerRoles = ["COACH", "TABLE_WORKER", "PARENT"] as const;
const HomeVolunteerRolesForQuery = [...HomeVolunteerRoles];

const BodySchema = z.object({
  assignments: z.array(z.object({
    userId: z.string().min(1),
    matNumber: z.number().int().nullable(),
  })).max(500),
});

/** Sort home-team volunteers into coach, table worker, then parent order. */
function roleRank(role: string) {
  if (role === "COACH") return 0;
  if (role === "TABLE_WORKER") return 1;
  if (role === "PARENT") return 2;
  return 3;
}

/** Home-team coaches can manage volunteer mat assignments for their own meet. */
function isHomeTeamCoach(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return user.role === "COACH" && Boolean(homeTeamId) && Boolean(user.teamId) && user.teamId === homeTeamId;
}

/** Home-team admins share the same volunteer-management privileges. */
function isHomeTeamAdmin(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return user.role === "ADMIN" && Boolean(homeTeamId) && Boolean(user.teamId) && user.teamId === homeTeamId;
}

/** Centralized permission check reused by both read and write volunteer APIs. */
function canManageVolunteers(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return isHomeTeamCoach(user, homeTeamId) || isHomeTeamAdmin(user, homeTeamId);
}

/** Converts stored mat/order values to the compact bout number shown in the UI. */
function formatBoutNumber(mat: number | null, order: number | null) {
  if (!mat || !order) return null;
  const displayOrder = Math.max(0, order - 1);
  return `${mat}${String(displayOrder).padStart(2, "0")}`;
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

  const kidIds = Array.from(
    new Set(
      volunteers
        .flatMap((entry) => entry.children.map((link) => link.wrestler))
        .filter((wrestler) => wrestler.teamId === meet.homeTeamId)
        .map((wrestler) => wrestler.id),
    ),
  );
  const kidIdSet = new Set(kidIds);
  const bouts = kidIds.length > 0
    ? await db.bout.findMany({
        where: {
          meetId,
          OR: [
            { redId: { in: kidIds } },
            { greenId: { in: kidIds } },
          ],
        },
        select: {
          id: true,
          redId: true,
          greenId: true,
          mat: true,
          order: true,
        },
        orderBy: [{ mat: "asc" }, { order: "asc" }, { id: "asc" }],
      })
    : [];
  // Precompute each home-team kid's assigned bouts so every volunteer can be
  // rendered with linked wrestlers and current mat locations in one pass.
  const kidBoutsMap = new Map<string, Array<{ id: string; mat: number | null; order: number | null; boutNumber: string | null }>>();
  for (const bout of bouts) {
    const mapped = {
      id: bout.id,
      mat: bout.mat ?? null,
      order: bout.order ?? null,
      boutNumber: formatBoutNumber(bout.mat ?? null, bout.order ?? null),
    };
    if (kidIdSet.has(bout.redId)) {
      const list = kidBoutsMap.get(bout.redId) ?? [];
      list.push(mapped);
      kidBoutsMap.set(bout.redId, list);
    }
    if (kidIdSet.has(bout.greenId)) {
      const list = kidBoutsMap.get(bout.greenId) ?? [];
      list.push(mapped);
      kidBoutsMap.set(bout.greenId, list);
    }
  }

  const maxMat = Math.max(1, Math.min(8, meet.numMats));
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
          .map((wrestler) => ({
            id: wrestler.id,
            name: `${wrestler.first} ${wrestler.last}`.trim(),
            // Keep bouts sorted inside each wrestler so the volunteer card can
            // render stable, human-readable lists without extra client work.
            bouts: (kidBoutsMap.get(wrestler.id) ?? []).slice().sort((a, b) => {
              const matA = a.mat ?? Number.MAX_SAFE_INTEGER;
              const matB = b.mat ?? Number.MAX_SAFE_INTEGER;
              if (matA !== matB) return matA - matB;
              const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
              const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
              if (orderA !== orderB) return orderA - orderB;
              return a.id.localeCompare(b.id);
            }),
          })),
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
    await requireMeetLock(meetId, user.id, user.role);
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
  if (!isEditableMeetPhase(meet.status)) {
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

  const maxMat = Math.max(1, Math.min(8, meet.numMats));
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

  // Later assignments for the same user overwrite earlier ones so the PATCH
  // body can be treated as the user's final desired volunteer layout.
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
