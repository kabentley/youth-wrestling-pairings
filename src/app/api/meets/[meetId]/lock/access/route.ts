import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  allowedCoachIds: z.array(z.string().trim().min(1)).max(200),
});

type MeetContext = Awaited<ReturnType<typeof loadMeetContext>>;

async function loadMeetContext(meetId: string) {
  return db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      deletedAt: true,
      homeTeamId: true,
      meetTeams: {
        select: {
          teamId: true,
          team: {
            select: {
              name: true,
              symbol: true,
            },
          },
        },
      },
      homeTeam: {
        select: {
          headCoachId: true,
          headCoach: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
        },
      },
    },
  });
}

function buildMeetTeamIds(ctx: NonNullable<MeetContext>) {
  return new Set(ctx.meetTeams.map((entry) => entry.teamId));
}

async function loadCoachRows(teamIds: string[], coordinatorId: string | null, meetId: string) {
  const [coaches, granted] = await Promise.all([
    db.user.findMany({
      where: {
        role: "COACH",
        teamId: { in: teamIds },
      },
      select: {
        id: true,
        username: true,
        name: true,
        teamId: true,
        team: {
          select: {
            name: true,
            symbol: true,
            color: true,
            headCoachId: true,
          },
        },
      },
      orderBy: [{ username: "asc" }],
    }),
    db.meetLockAccess.findMany({
      where: { meetId },
      select: { userId: true },
    }),
  ]);

  const grantedSet = new Set(granted.map((entry) => entry.userId));
  const rows = coaches
    .filter((coach) => coach.id !== coordinatorId)
    .map((coach) => ({
      id: coach.id,
      username: coach.username,
      name: coach.name ?? null,
      teamId: coach.teamId ?? null,
      teamName: coach.team?.name ?? null,
      teamSymbol: coach.team?.symbol ?? null,
      teamColor: coach.team?.color ?? null,
      isHeadCoach: coach.team?.headCoachId === coach.id,
      canAcquireLock: grantedSet.has(coach.id),
    }))
    .sort((a, b) => {
      const teamCmp = (a.teamSymbol ?? a.teamName ?? "").localeCompare(b.teamSymbol ?? b.teamName ?? "");
      if (teamCmp !== 0) return teamCmp;
      return a.username.localeCompare(b.username);
    });

  return { rows, grantedSet };
}

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const meet = await loadMeetContext(meetId);
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team." }, { status: 400 });
  }

  const coordinatorId = meet.homeTeam?.headCoachId ?? null;
  const teamIds = [...buildMeetTeamIds(meet)];
  const { rows, grantedSet } = await loadCoachRows(teamIds, coordinatorId, meet.id);
  const isCoordinator = Boolean(coordinatorId) && user.id === coordinatorId;
  const canManageEditAccess = isCoordinator || user.role === "ADMIN";
  const isMeetCoach = user.role === "COACH" && Boolean(user.teamId) && teamIds.includes(user.teamId ?? "");
  const canAcquireLock =
    user.role === "ADMIN" || isCoordinator || (isMeetCoach && (!coordinatorId || grantedSet.has(user.id)));

  return NextResponse.json({
    coordinator: meet.homeTeam?.headCoach
      ? {
          id: meet.homeTeam.headCoach.id,
          username: meet.homeTeam.headCoach.username,
          name: meet.homeTeam.headCoach.name ?? null,
        }
      : null,
    coordinatorAssigned: Boolean(coordinatorId),
    canManageLockAccess: canManageEditAccess,
    canAcquireLock,
    coaches: rows,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const body = BodySchema.parse(await req.json());
  const meet = await loadMeetContext(meetId);
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team." }, { status: 400 });
  }

  const coordinatorId = meet.homeTeam?.headCoachId ?? null;
  if (!coordinatorId) {
    return NextResponse.json(
      { error: "Assign a head coach to the home team before managing edit access." },
      { status: 400 },
    );
  }
  const canManageEditAccess = user.id === coordinatorId || user.role === "ADMIN";
  if (!canManageEditAccess) {
    return NextResponse.json(
      { error: "Only the Meet Coordinator or an admin can change coach edit access." },
      { status: 403 },
    );
  }

  const allowedCoachIds = Array.from(new Set(body.allowedCoachIds));
  const meetTeamIds = [...buildMeetTeamIds(meet)];
  const allowedCoachSet = new Set(allowedCoachIds);
  if (allowedCoachSet.has(coordinatorId)) {
    return NextResponse.json({ error: "Meet Coordinator is always allowed and should not be listed." }, { status: 400 });
  }

  if (allowedCoachIds.length > 0) {
    const validRows = await db.user.findMany({
      where: {
        id: { in: allowedCoachIds },
        role: "COACH",
        teamId: { in: meetTeamIds },
      },
      select: { id: true },
    });
    const validSet = new Set(validRows.map((row) => row.id));
    const invalidId = allowedCoachIds.find((id) => !validSet.has(id));
    if (invalidId) {
      return NextResponse.json({ error: `Invalid coach id for this meet: ${invalidId}` }, { status: 400 });
    }
  }

  let releasedUnauthorizedLock = false;
  await db.$transaction(async (tx) => {
    const existingRows = await tx.meetLockAccess.findMany({
      where: { meetId },
      select: { userId: true },
    });
    const existingSet = new Set(existingRows.map((row) => row.userId));
    const toDelete = [...existingSet].filter((id) => !allowedCoachSet.has(id));
    const toCreate = allowedCoachIds.filter((id) => !existingSet.has(id));

    if (toDelete.length > 0) {
      await tx.meetLockAccess.deleteMany({
        where: {
          meetId,
          userId: { in: toDelete },
        },
      });
    }
    if (toCreate.length > 0) {
      await tx.meetLockAccess.createMany({
        data: toCreate.map((coachId) => ({
          meetId,
          userId: coachId,
        })),
      });
    }

    const lockOwner = await tx.meet.findUnique({
      where: { id: meetId },
      select: { lockedById: true },
    });
    if (
      lockOwner?.lockedById &&
      lockOwner.lockedById !== coordinatorId &&
      !allowedCoachSet.has(lockOwner.lockedById)
    ) {
      await tx.meet.update({
        where: { id: meetId },
        data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
      });
      releasedUnauthorizedLock = true;
    }
  });

  const enabledCount = allowedCoachIds.length;
  await logMeetChange(
    meetId,
    user.id,
    `Updated edit access for ${enabledCount} coach${enabledCount === 1 ? "" : "es"}.`,
  );

  return NextResponse.json({
    ok: true,
    enabledCount,
    releasedUnauthorizedLock,
  });
}
