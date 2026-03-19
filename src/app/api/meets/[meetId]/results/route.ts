import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { requireAnyRole, requireSession } from "@/lib/rbac";

const CompleteSchema = z.object({
  completed: z.boolean(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let user: Awaited<ReturnType<typeof requireSession>>["user"];
  let userId: string;
  try {
    ({ user, userId } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      status: true,
      resultsCompletedAt: true,
      homeTeamId: true,
      homeTeam: {
        select: {
          headCoachId: true,
        },
      },
      deletedAt: true,
    },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  if (user.role === "COACH" || user.role === "TABLE_WORKER") {
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned." }, { status: 403 });
    }
    const teamRows = await db.meetTeam.findMany({
      where: { meetId },
      select: { teamId: true },
    });
    const teamIds = new Set(teamRows.map(t => t.teamId));
    if (!teamIds.has(user.teamId)) {
      return NextResponse.json({ error: "You are not authorized to enter results for this meet." }, { status: 403 });
    }
  } else if (user.role === "PARENT") {
    if (!meet.resultsCompletedAt) {
      return NextResponse.json({ error: "Meet results are not available yet." }, { status: 403 });
    }
    const childLinks = await db.userChild.findMany({
      where: { userId },
      select: { wrestlerId: true },
    });
    const childIds = childLinks.map((link) => link.wrestlerId);
    if (childIds.length === 0) {
      return NextResponse.json({ error: "You are not authorized to view results for this meet." }, { status: 403 });
    }
    const hasLinkedWrestlerInMeet = await db.bout.findFirst({
      where: {
        meetId,
        OR: [{ redId: { in: childIds } }, { greenId: { in: childIds } }],
      },
      select: { id: true },
    });
    if (!hasLinkedWrestlerInMeet) {
      return NextResponse.json({ error: "You are not authorized to view results for this meet." }, { status: 403 });
    }
  } else if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "You are not authorized to view results for this meet." }, { status: 403 });
  }

  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      mat: true,
      order: true,
      redId: true,
      greenId: true,
      resultWinnerId: true,
      resultType: true,
      resultScore: true,
      resultPeriod: true,
      resultTime: true,
      resultNotes: true,
      resultUpdatedBy: true,
      resultAt: true,
    },
  });
  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId },
    select: { wrestlerId: true, status: true },
  });
  const attendingIds = new Set(
    statuses
      .filter((status) => status.status === "COMING" || status.status === "LATE" || status.status === "EARLY")
      .map((status) => status.wrestlerId),
  );
  const filtered = bouts.filter(b => attendingIds.has(b.redId) && attendingIds.has(b.greenId));
  const updaterUsernames = Array.from(new Set(
    filtered
      .map((bout) => bout.resultUpdatedBy?.trim() ?? "")
      .filter((username) => username.length > 0),
  ));
  const wrestlerIds = new Set<string>();
  for (const b of filtered) {
    wrestlerIds.add(b.redId);
    wrestlerIds.add(b.greenId);
  }
  const updaters = updaterUsernames.length > 0
    ? await db.user.findMany({
      where: { username: { in: updaterUsernames } },
      select: {
        username: true,
        team: {
          select: {
            color: true,
          },
        },
      },
    })
    : [];
  const wrestlers = await db.wrestler.findMany({
    where: { id: { in: Array.from(wrestlerIds) } },
    select: {
      id: true,
      first: true,
      last: true,
      teamId: true,
      team: { select: { name: true, symbol: true, color: true } },
    },
  });
  const wrestlerMap = new Map(wrestlers.map(w => [w.id, w]));
  const updaterColorMap = new Map(
    updaters.map((updater) => [updater.username, updater.team?.color.trim() ?? null] as const),
  );

  return NextResponse.json({
    meet: {
      ...meet,
      viewerRole: user.role,
      canManageResultsCompletion:
        user.role === "ADMIN" || Boolean(meet.homeTeam?.headCoachId && meet.homeTeam.headCoachId === user.id),
    },
    bouts: filtered.map(b => ({
      id: b.id,
      mat: b.mat,
      order: b.order,
      red: wrestlerMap.get(b.redId) ?? { id: b.redId, first: "Unknown", last: "", teamId: "", team: { name: "", symbol: "", color: "#000000" } },
      green: wrestlerMap.get(b.greenId) ?? { id: b.greenId, first: "Unknown", last: "", teamId: "", team: { name: "", symbol: "", color: "#000000" } },
      resultWinnerId: b.resultWinnerId,
      resultType: b.resultType,
      resultScore: b.resultScore,
      resultPeriod: b.resultPeriod,
      resultTime: b.resultTime,
      resultNotes: b.resultNotes,
      resultUpdatedBy: b.resultUpdatedBy,
      resultUpdatedByColor: b.resultUpdatedBy ? (updaterColorMap.get(b.resultUpdatedBy) ?? null) : null,
      resultAt: b.resultAt,
    })),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let user: Awaited<ReturnType<typeof requireAnyRole>>["user"];
  try {
    ({ user } = await requireAnyRole(["COACH", "TABLE_WORKER", "ADMIN"]));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to manage results." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = CompleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid results completion payload." }, { status: 400 });
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      deletedAt: true,
      resultsCompletedAt: true,
      homeTeam: {
        select: {
          headCoachId: true,
        },
      },
      meetTeams: {
        select: { teamId: true },
      },
    },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  const isCoordinator = Boolean(meet.homeTeam?.headCoachId && meet.homeTeam.headCoachId === user.id);
  const canManageResultsCompletion = user.role === "ADMIN" || isCoordinator;
  if (!canManageResultsCompletion) {
    return NextResponse.json(
      { error: "Only the Meet Coordinator or an admin can change results completion." },
      { status: 403 },
    );
  }

  const nextCompletedAt = parsed.data.completed ? new Date() : null;
  const updated = await db.meet.update({
    where: { id: meetId },
    data: {
      resultsCompletedAt: nextCompletedAt,
      updatedById: user.id,
    },
    select: {
      id: true,
      resultsCompletedAt: true,
    },
  });

  await logMeetChange(
    meetId,
    user.id,
    parsed.data.completed
      ? "Marked results entry complete."
      : "Reopened results entry.",
  );

  return NextResponse.json(updated);
}
