import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";
import { reorderBoutsForMeetUntilStable } from "@/lib/reorderBouts";

const HomeVolunteerRoles = ["COACH", "TABLE_WORKER", "PARENT"] as const;
const HomeVolunteerRolesForQuery = [...HomeVolunteerRoles];

const BodySchema = z.object({
  volunteerId: z.string().trim().min(1),
});

function isHomeTeamCoach(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return user.role === "COACH" && Boolean(homeTeamId) && Boolean(user.teamId) && user.teamId === homeTeamId;
}

function isHomeTeamAdmin(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return user.role === "ADMIN" && Boolean(homeTeamId) && Boolean(user.teamId) && user.teamId === homeTeamId;
}

function canManageVolunteers(user: { role: string; teamId?: string | null }, homeTeamId?: string | null) {
  return isHomeTeamCoach(user, homeTeamId) || isHomeTeamAdmin(user, homeTeamId);
}

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
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
    select: { id: true, deletedAt: true, status: true, homeTeamId: true, numMats: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team before moving volunteer matches." }, { status: 400 });
  }
  if (!canManageVolunteers(user, meet.homeTeamId)) {
    return NextResponse.json(
      { error: "Only home team coaches or admins assigned to the home team can manage volunteers for this meet." },
      { status: 403 },
    );
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

  const volunteer = await db.user.findFirst({
    where: {
      id: body.volunteerId,
      teamId: meet.homeTeamId,
      role: { in: HomeVolunteerRolesForQuery },
    },
    select: {
      id: true,
      username: true,
      name: true,
      staffMatNumber: true,
      children: {
        select: {
          wrestler: {
            select: {
              id: true,
              teamId: true,
            },
          },
        },
      },
    },
  });
  if (!volunteer) {
    return NextResponse.json({ error: "Volunteer not found for this home team." }, { status: 404 });
  }
  const targetMat = volunteer.staffMatNumber;
  const maxMat = Math.max(1, Math.min(6, meet.numMats));
  if (typeof targetMat !== "number" || targetMat < 1 || targetMat > maxMat) {
    return NextResponse.json({ error: "Volunteer must be assigned to a mat before moving matches." }, { status: 400 });
  }

  const kidIds = volunteer.children
    .map((link) => link.wrestler)
    .filter((wrestler) => wrestler.teamId === meet.homeTeamId)
    .map((wrestler) => wrestler.id);
  if (kidIds.length === 0) {
    return NextResponse.json({ ok: true, moved: 0, reordered: 0, affectedMats: [] });
  }

  const bouts = await db.bout.findMany({
    where: {
      meetId,
      OR: [
        { redId: { in: kidIds } },
        { greenId: { in: kidIds } },
      ],
    },
    select: { id: true, mat: true },
  });
  const boutsToMove = bouts.filter((bout) => bout.mat !== targetMat);
  if (boutsToMove.length === 0) {
    return NextResponse.json({ ok: true, moved: 0, reordered: 0, affectedMats: [] });
  }

  const affectedMats = new Set<number>();
  for (const bout of boutsToMove) {
    if (typeof bout.mat === "number" && bout.mat >= 1 && bout.mat <= maxMat) {
      affectedMats.add(bout.mat);
    }
  }
  affectedMats.add(targetMat);

  await db.$transaction(
    boutsToMove.map((bout) =>
      db.bout.update({
        where: { id: bout.id },
        data: { mat: targetMat },
      }),
    ),
  );
  const reordered = await reorderBoutsForMeetUntilStable(meetId, {
    numMats: maxMat,
    maxPasses: 8,
  });

  const volunteerLabel = volunteer.name?.trim() ? volunteer.name.trim() : `@${volunteer.username}`;
  await logMeetChange(
    meetId,
    user.id,
    `Moved ${boutsToMove.length} bout${boutsToMove.length === 1 ? "" : "s"} for ${volunteerLabel} to mat ${targetMat}.`,
  );

  return NextResponse.json({
    ok: true,
    moved: boutsToMove.length,
    reordered: reordered.reordered,
    affectedMats: [...affectedMats].sort((a, b) => a - b),
  });
}
