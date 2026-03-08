import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { buildMeetCheckpointPayload, buildTeamSignature } from "@/lib/meetCheckpoints";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import {
  buildAutoPhaseCheckpointName,
  canTransitionMeetPhase,
  MEET_PHASES,
  meetPhaseLabel,
  normalizeMeetPhase,
  shouldCreateAutoCheckpoint,
} from "@/lib/meetPhase";
import { buildReadyForCheckinChecklist } from "@/lib/meetReadyForCheckin";
import { requireRole } from "@/lib/rbac";
import { deleteBoutsAndRenumber } from "@/lib/renumberBouts";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  date: z.string().optional(),
  attendanceDeadline: z.string().trim().nullable().optional().refine(
    (value) => value == null || value === "" || !Number.isNaN(new Date(value).getTime()),
    "Invalid attendance deadline.",
  ),
  location: z.string().optional().nullable(),
  homeTeamId: z.string().nullable().optional(),
  numMats: z.number().int().min(1).max(6).optional(),
  allowSameTeamMatches: z.boolean().optional(),
  girlsWrestleGirls: z.boolean().optional(),
  matchesPerWrestler: z.number().int().min(1).max(5).optional(),
  maxMatchesPerWrestler: z.number().int().min(1).max(5).optional(),
  restGap: z.number().int().min(0).max(20).optional(),
  status: z.enum(MEET_PHASES).optional(),
});

const CheckpointAttendanceSchema = z.object({
  wrestlerId: z.string().min(1),
  status: z.enum(["COMING", "NOT_COMING", "LATE", "EARLY"]).nullable(),
});

const CheckpointBoutSchema = z.object({
  redId: z.string().min(1),
  greenId: z.string().min(1),
  pairingScore: z.number(),
  mat: z.number().int().nullable().optional(),
  order: z.number().int().nullable().optional(),
  originalMat: z.number().int().nullable().optional(),
  locked: z.boolean().optional(),
  assignedByPeopleRule: z.boolean().optional(),
  peopleRuleUserId: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

const MeetCheckpointPayloadSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  createdAt: z.string(),
  meetId: z.string(),
  meetName: z.string(),
  meetDate: z.string(),
  teamIds: z.array(z.string()),
  attendance: z.array(CheckpointAttendanceSchema),
  bouts: z.array(CheckpointBoutSchema),
});

function normalizeNullableString(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizeNullableDateTime(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return new Date(trimmed);
}

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  try {
    await requireRole("COACH");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to view this meet." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      attendanceDeadline: true,
      location: true,
      homeTeamId: true,
      numMats: true,
      allowSameTeamMatches: true,
      girlsWrestleGirls: true,
      matchesPerWrestler: true,
      maxMatchesPerWrestler: true,
      restGap: true,
      status: true,
      updatedAt: true,
      deletedAt: true,
      updatedBy: { select: { username: true } },
      meetTeams: {
        select: {
          teamId: true,
          checkinCompletedAt: true,
          checkinCompletedBy: {
            select: {
              username: true,
            },
          },
        },
      },
    },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  const lastChange = await db.meetChange.findFirst({
    where: { meetId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, actor: { select: { username: true } } },
  });
  const lastChangeAt = lastChange ? lastChange.createdAt : null;
  const lastChangeBy = lastChange?.actor ? lastChange.actor.username : null;
  return NextResponse.json({
    ...meet,
    teamCheckins: meet.meetTeams.map((entry) => ({
      teamId: entry.teamId,
      checkinCompletedAt: entry.checkinCompletedAt?.toISOString() ?? null,
      completedByUsername: entry.checkinCompletedBy?.username ?? null,
    })),
    lastChangeAt,
    lastChangeBy,
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

  const body = PatchSchema.parse(await req.json());
  if (body.homeTeamId !== undefined && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can change the home team." }, { status: 403 });
  }
  if (body.homeTeamId === null) {
    return NextResponse.json({ error: "Meet must have a home team." }, { status: 400 });
  }
  const current = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      name: true,
      status: true,
      homeTeamId: true,
      homeTeam: { select: { headCoachId: true } },
    },
  });
  if (!current) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  if (body.status) {
    const coordinatorId = current.homeTeam?.headCoachId ?? null;
    const canChangePhase = user.role === "ADMIN" || (Boolean(coordinatorId) && coordinatorId === user.id);
    if (!canChangePhase) {
      return NextResponse.json(
        { error: "Only the Meet Coordinator or an admin can change the meet phase." },
        { status: 403 },
      );
    }
  }
  const currentStatus = normalizeMeetPhase(current.status);
  const nextStatus = body.status ? normalizeMeetPhase(body.status) : currentStatus;
  if (body.status && !canTransitionMeetPhase(currentStatus, nextStatus)) {
    return NextResponse.json(
      { error: `Cannot change meet status from ${currentStatus} to ${nextStatus}.` },
      { status: 400 },
    );
  }
  if (currentStatus === "DRAFT" && nextStatus === "READY_FOR_CHECKIN") {
    const checklist = await buildReadyForCheckinChecklist(meetId);
    if (!checklist) {
      return NextResponse.json({ error: "Meet not found" }, { status: 404 });
    }
    if (!checklist.ok) {
      return NextResponse.json(
        {
          error: "Check-in checklist failed.",
          checklist,
        },
        { status: 400 },
      );
    }
  }
  if (currentStatus === "READY_FOR_CHECKIN" && nextStatus === "PUBLISHED") {
    const checklist = await buildReadyForCheckinChecklist(meetId, undefined, "PUBLISHED");
    if (!checklist) {
      return NextResponse.json({ error: "Meet not found" }, { status: 404 });
    }
    if (!checklist.ok) {
      return NextResponse.json(
        {
          error: "Publish checklist failed.",
          checklist,
        },
        { status: 400 },
      );
    }
  }
  if (currentStatus === "DRAFT" && nextStatus === "ATTENDANCE") {
    const existingBout = await db.bout.findFirst({
      where: { meetId },
      select: { id: true },
    });
    if (existingBout) {
      return NextResponse.json(
        { error: "Cannot reopen attendance after bouts have been assigned." },
        { status: 400 },
      );
    }
  }
  const reopeningFromCheckin = currentStatus === "READY_FOR_CHECKIN" && nextStatus === "DRAFT";
  const reopeningAttendance = currentStatus === "DRAFT" && nextStatus === "ATTENDANCE";
  const reopenCheckpoint = (reopeningFromCheckin || reopeningAttendance)
    ? await db.meetCheckpoint.findFirst({
        where: {
          meetId,
          OR: reopeningFromCheckin
            ? [
                { name: { startsWith: "Ready for Check-in " } },
                { name: { startsWith: "Check-in " } },
              ]
            : [
                { name: { startsWith: "Attendance Closed " } },
              ],
        },
        orderBy: { createdAt: "desc" },
        select: { name: true, teamSignature: true, payload: true },
      })
    : null;
  if ((reopeningFromCheckin || reopeningAttendance) && !reopenCheckpoint) {
    return NextResponse.json(
      {
        error: reopeningFromCheckin
          ? "No Check-in checkpoint found. Cannot reopen as Draft."
          : "No Attendance Closed checkpoint found. Cannot reopen attendance.",
      },
      { status: 400 },
    );
  }
  const parsedReopenCheckpointPayload = reopenCheckpoint
    ? MeetCheckpointPayloadSchema.safeParse(reopenCheckpoint.payload)
    : null;
  if ((reopeningFromCheckin || reopeningAttendance) && (!parsedReopenCheckpointPayload?.success)) {
    return NextResponse.json(
      {
        error: reopeningFromCheckin
          ? "Check-in checkpoint data is invalid. Cannot reopen as Draft."
          : "Attendance Closed checkpoint data is invalid. Cannot reopen attendance.",
      },
      { status: 400 },
    );
  }

  const data: {
    name?: string;
    date?: Date;
    attendanceDeadline?: Date | null;
    location?: string | null;
    homeTeamId?: string | null;
    numMats?: number;
    allowSameTeamMatches?: boolean;
    girlsWrestleGirls?: boolean;
    matchesPerWrestler?: number;
    maxMatchesPerWrestler?: number;
    restGap?: number;
    status?: string;
    updatedById?: string;
  } = { updatedById: user.id };

  if (body.name) data.name = body.name.trim();
  if (body.date) data.date = new Date(body.date);
  if (body.attendanceDeadline !== undefined) data.attendanceDeadline = normalizeNullableDateTime(body.attendanceDeadline);
  if (body.location !== undefined) data.location = normalizeNullableString(body.location);
  if (body.homeTeamId !== undefined) data.homeTeamId = body.homeTeamId;
  if (body.numMats !== undefined) data.numMats = body.numMats;
  if (body.allowSameTeamMatches !== undefined) data.allowSameTeamMatches = body.allowSameTeamMatches;
  if (body.girlsWrestleGirls !== undefined) data.girlsWrestleGirls = body.girlsWrestleGirls;
  if (body.matchesPerWrestler !== undefined) data.matchesPerWrestler = body.matchesPerWrestler;
  if (body.maxMatchesPerWrestler !== undefined) data.maxMatchesPerWrestler = body.maxMatchesPerWrestler;
  if (body.restGap !== undefined) data.restGap = body.restGap;
  if (body.status) data.status = body.status;

  const now = new Date();
  const closingAttendance = currentStatus === "ATTENDANCE" && nextStatus === "DRAFT";
  const shouldCreateCheckpoint = closingAttendance || shouldCreateAutoCheckpoint(currentStatus, nextStatus);
  const autoCheckpointName = shouldCreateCheckpoint
    ? (
        closingAttendance
          ? `Attendance Closed ${new Intl.DateTimeFormat("en-US", {
              year: "numeric",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }).format(now).replace(",", "")}`
          : buildAutoPhaseCheckpointName(nextStatus, now)
      )
    : "";
  let autoMarkedNoReplyCount = 0;
  const updated = await db.$transaction(async (tx) => {
    if (closingAttendance) {
      const payload = await buildMeetCheckpointPayload(meetId, autoCheckpointName, tx);
      if (!payload) {
        throw new Error("Meet not found");
      }
      await tx.meetCheckpoint.create({
        data: {
          meetId,
          name: autoCheckpointName,
          payload,
          teamSignature: buildTeamSignature(payload.teamIds),
          createdById: user.id,
        },
      });
    }

    if (currentStatus === "ATTENDANCE" && nextStatus === "DRAFT") {
      const meetTeams = await tx.meetTeam.findMany({
        where: { meetId },
        select: { teamId: true },
      });
      const teamIds = meetTeams.map((team) => team.teamId);

      if (teamIds.length > 0) {
        const [existingStatuses, bouts] = await Promise.all([
          tx.meetWrestlerStatus.findMany({
            where: { meetId },
            select: { wrestlerId: true },
          }),
          tx.bout.findMany({
            where: { meetId },
            select: { redId: true, greenId: true },
          }),
        ]);
        const existingStatusIds = existingStatuses.map((entry) => entry.wrestlerId);
        const boutWrestlerIds = [...new Set(bouts.flatMap((bout) => [bout.redId, bout.greenId]))];

        const noReplyWrestlers = await tx.wrestler.findMany({
          where: {
            teamId: { in: teamIds },
            id: { notIn: existingStatusIds },
            ...(boutWrestlerIds.length > 0
              ? { OR: [{ active: true }, { id: { in: boutWrestlerIds } }] }
              : { active: true }),
          },
          select: { id: true },
        });

        if (noReplyWrestlers.length > 0) {
          const noReplyIds = noReplyWrestlers.map((wrestler) => wrestler.id);
          autoMarkedNoReplyCount = noReplyIds.length;

          await tx.meetWrestlerStatus.createMany({
            data: noReplyIds.map((wrestlerId) => ({
              meetId,
              wrestlerId,
              status: "NOT_COMING",
            })),
          });

          await tx.meetWrestlerStatusHistory.createMany({
            data: noReplyIds.map((wrestlerId) => ({
              meetId,
              wrestlerId,
              status: "NOT_COMING",
              changedById: user.id,
            })),
          });

          await deleteBoutsAndRenumber(tx, meetId, {
            OR: [
              { redId: { in: noReplyIds } },
              { greenId: { in: noReplyIds } },
            ],
          });
        }
      }
    }
    if ((reopeningFromCheckin || reopeningAttendance) && reopenCheckpoint && parsedReopenCheckpointPayload?.success) {
      const checkpoint = reopenCheckpoint;
      const payload = parsedReopenCheckpointPayload.data;

      const meetTeams = await tx.meetTeam.findMany({
        where: { meetId },
        select: { teamId: true, team: { select: { id: true, name: true, symbol: true } } },
      });
      const meetTeamIds = meetTeams.map((entry) => entry.teamId);
      const meetSignature = buildTeamSignature(meetTeamIds);
      if (
        meetSignature !== checkpoint.teamSignature ||
        meetSignature !== buildTeamSignature(payload.teamIds)
      ) {
        throw new Error("Checkpoint teams do not match this meet.");
      }

      const wrestlers = await tx.wrestler.findMany({
        where: { teamId: { in: meetTeamIds } },
        select: { id: true, active: true, first: true, last: true, teamId: true },
      });
      const wrestlerIds = new Set(wrestlers.map((wrestler) => wrestler.id));
      const activeIds = new Set(wrestlers.filter((wrestler) => wrestler.active).map((wrestler) => wrestler.id));

      const attendance = payload.attendance.filter(
        (entry) => wrestlerIds.has(entry.wrestlerId) && activeIds.has(entry.wrestlerId),
      );
      const attendanceWithStatus = attendance.filter(
        (entry): entry is typeof entry & { status: "COMING" | "NOT_COMING" | "LATE" | "EARLY" } => entry.status != null,
      );
      const teamOrder = (() => {
        const order = new Map<string, number>();
        const homeId = body.homeTeamId ?? current.homeTeamId ?? null;
        const allTeams = meetTeams.map((entry) => entry.team);
        const label = (team: (typeof allTeams)[number]) =>
          (team.symbol || team.name || team.id).toLowerCase();
        let index = 0;
        if (homeId) {
          order.set(homeId, index);
          index += 1;
        }
        const ordered = allTeams
          .filter((team) => team.id !== homeId)
          .sort((a, b) => label(a).localeCompare(label(b)));
        for (const team of ordered) {
          if (!order.has(team.id)) {
            order.set(team.id, index);
            index += 1;
          }
        }
        return order;
      })();
      const wrestlerById = new Map(wrestlers.map((wrestler) => [wrestler.id, wrestler]));
      const compareWrestlers = (aId: string, bId: string) => {
        const a = wrestlerById.get(aId);
        const b = wrestlerById.get(bId);
        if (!a || !b) return aId.localeCompare(bId);
        const aOrder = teamOrder.get(a.teamId) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = teamOrder.get(b.teamId) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const lastCompare = a.last.toLowerCase().localeCompare(b.last.toLowerCase());
        if (lastCompare !== 0) return lastCompare;
        const firstCompare = a.first.toLowerCase().localeCompare(b.first.toLowerCase());
        if (firstCompare !== 0) return firstCompare;
        return a.id.localeCompare(b.id);
      };
      const bouts = payload.bouts
        .filter((bout) => activeIds.has(bout.redId) && activeIds.has(bout.greenId))
        .map((bout) => {
          const compare = compareWrestlers(bout.redId, bout.greenId);
          if (compare <= 0) return bout;
          return { ...bout, redId: bout.greenId, greenId: bout.redId, pairingScore: -bout.pairingScore };
        });

      await tx.meetWrestlerStatus.deleteMany({ where: { meetId } });
      if (attendanceWithStatus.length > 0) {
        await tx.meetWrestlerStatus.createMany({
          data: attendanceWithStatus.map((entry) => ({
            meetId,
            wrestlerId: entry.wrestlerId,
            status: entry.status,
          })),
        });
        await tx.meetWrestlerStatusHistory.createMany({
          data: attendanceWithStatus.map((entry) => ({
            meetId,
            wrestlerId: entry.wrestlerId,
            status: entry.status,
            changedById: user.id,
          })),
        });
      }

      await tx.bout.deleteMany({ where: { meetId } });
      if (bouts.length > 0) {
        await tx.bout.createMany({
          data: bouts.map((bout) => ({
            meetId,
            redId: bout.redId,
            greenId: bout.greenId,
            pairingScore: bout.pairingScore,
            mat: bout.mat ?? null,
            order: bout.order ?? null,
            originalMat: bout.originalMat ?? null,
            locked: bout.locked ?? false,
            assignedByPeopleRule: bout.assignedByPeopleRule ?? false,
            peopleRuleUserId: bout.peopleRuleUserId ?? null,
            source: bout.source ?? null,
            ...(bout.createdAt ? { createdAt: new Date(bout.createdAt) } : {}),
          })),
        });
      }
    }

    if ((currentStatus !== "READY_FOR_CHECKIN" && nextStatus === "READY_FOR_CHECKIN") || reopeningFromCheckin) {
      await tx.meetTeam.updateMany({
        where: { meetId },
        data: { checkinCompletedAt: null, checkinCompletedById: null },
      });
    }

    const updatedMeet = await tx.meet.update({
      where: { id: meetId },
      data,
      select: {
        id: true,
        name: true,
        date: true,
        attendanceDeadline: true,
        location: true,
        homeTeamId: true,
        numMats: true,
        allowSameTeamMatches: true,
        girlsWrestleGirls: true,
        matchesPerWrestler: true,
        maxMatchesPerWrestler: true,
        restGap: true,
        status: true,
        updatedAt: true,
        updatedBy: { select: { username: true } },
      },
    });

    if (shouldCreateCheckpoint && !closingAttendance) {
      const payload = await buildMeetCheckpointPayload(meetId, autoCheckpointName, tx);
      if (!payload) {
        throw new Error("Meet not found");
      }
      await tx.meetCheckpoint.create({
        data: {
          meetId,
          name: autoCheckpointName,
          payload,
          teamSignature: buildTeamSignature(payload.teamIds),
          createdById: user.id,
        },
      });
    }

    return updatedMeet;
  });

  const otherChanges: string[] = [];
  let nameChangeMessage = "";
  if (body.name) {
    const oldName = current.name;
    const newName = body.name.trim();
    nameChangeMessage = `Update meet name from [${oldName}] to [${newName}].`;
  }
  if (body.date) otherChanges.push("date");
  if (body.attendanceDeadline !== undefined) otherChanges.push("attendance deadline");
  if (body.location !== undefined) otherChanges.push("location");
  if (body.homeTeamId !== undefined) otherChanges.push("home team");
  if (body.numMats !== undefined) otherChanges.push("mats");
  if (body.allowSameTeamMatches !== undefined) otherChanges.push("same-team matches");
  if (body.girlsWrestleGirls !== undefined) otherChanges.push("girls wrestle girls");
  if (body.matchesPerWrestler !== undefined) otherChanges.push("matches per wrestler");
  if (body.maxMatchesPerWrestler !== undefined) otherChanges.push("max matches per wrestler");
  if (body.restGap !== undefined) otherChanges.push("rest gap");
  if (body.status) otherChanges.push(`status set to ${meetPhaseLabel(body.status)}`);
  if (nameChangeMessage || otherChanges.length > 0) {
    const otherMessage = otherChanges.length > 0 ? `Updated ${otherChanges.join(", ")}.` : "";
    const message = nameChangeMessage && otherMessage
      ? `${nameChangeMessage} ${otherMessage}`
      : (nameChangeMessage || otherMessage);
    await logMeetChange(meetId, user.id, message);
  }
  if (shouldCreateCheckpoint) {
    await logMeetChange(
      meetId,
      user.id,
      `Saved checkpoint automatically on ${
        closingAttendance
          ? "attendance close"
          : nextStatus === "READY_FOR_CHECKIN"
            ? "check-in"
            : "publish"
      }: ${autoCheckpointName}.`,
    );
  }
  if (autoMarkedNoReplyCount > 0) {
    await logMeetChange(
      meetId,
      user.id,
      `Attendance: marked ${autoMarkedNoReplyCount} no-reply wrestler${autoMarkedNoReplyCount === 1 ? "" : "s"} as not coming when closing attendance.`,
    );
  }
  if (reopenCheckpoint && (reopeningFromCheckin || reopeningAttendance)) {
    await logMeetChange(
      meetId,
      user.id,
      reopeningFromCheckin
        ? `Reopened as Draft and restored checkpoint: ${reopenCheckpoint.name}.`
        : `Reopened attendance and restored checkpoint: ${reopenCheckpoint.name}.`,
    );
  }

  revalidatePath(`/meets/${meetId}`);

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const now = new Date();
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      status: true,
      homeTeam: { select: { headCoachId: true } },
      lockedById: true,
      lockExpiresAt: true,
      lockedBy: { select: { username: true } },
      deletedAt: true,
    },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  const coordinatorId = meet.homeTeam?.headCoachId ?? null;
  const isPublished = normalizeMeetPhase(meet.status) === "PUBLISHED";
  const canDelete = user.role === "ADMIN" || (!isPublished && Boolean(coordinatorId) && coordinatorId === user.id);
  if (!canDelete) {
    return NextResponse.json(
      { error: isPublished ? "Only admins can delete a published meet." : "Only the Meet Coordinator or an admin can delete this meet." },
      { status: 403 },
    );
  }
  if (meet.lockExpiresAt && meet.lockExpiresAt < now) {
    await db.meet.update({
      where: { id: meetId },
      data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
    });
  } else if (meet.lockedById && !meet.lockExpiresAt) {
    await db.meet.update({
      where: { id: meetId },
      data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
    });
  } else if (meet.lockedById && meet.lockedById !== user.id) {
    return NextResponse.json(
      {
        error: "Meet is locked",
        lockedByUsername: meet.lockedBy ? meet.lockedBy.username : "another user",
        lockExpiresAt: meet.lockExpiresAt ?? null,
      },
      { status: 409 },
    );
  }

  await db.meet.delete({
    where: { id: meetId },
  });

  revalidatePath("/meets");
  revalidatePath(`/meets/${meetId}`);

  return NextResponse.json({ ok: true });
}
