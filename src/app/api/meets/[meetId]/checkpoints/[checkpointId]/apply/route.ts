import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { buildTeamSignature } from "@/lib/meetCheckpoints";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const AttendanceSchema = z.object({
  wrestlerId: z.string().min(1),
  status: z.enum(["COMING", "NOT_COMING", "LATE", "EARLY"]),
});

const BoutSchema = z.object({
  redId: z.string().min(1),
  greenId: z.string().min(1),
  pairingScore: z.number(),
  mat: z.number().int().nullable().optional(),
  order: z.number().int().nullable().optional(),
  originalMat: z.number().int().nullable().optional(),
  locked: z.boolean().optional(),
  source: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

const PayloadSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  createdAt: z.string(),
  meetId: z.string(),
  meetName: z.string(),
  meetDate: z.string(),
  teamIds: z.array(z.string()),
  attendance: z.array(AttendanceSchema),
  bouts: z.array(BoutSchema),
});

export async function POST(_req: Request, { params }: { params: Promise<{ meetId: string; checkpointId: string }> }) {
  const { meetId, checkpointId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { deletedAt: true, homeTeamId: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  const checkpoint = await db.meetCheckpoint.findFirst({
    where: { id: checkpointId, meetId },
    select: { id: true, name: true, teamSignature: true, payload: true },
  });
  if (!checkpoint) {
    return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
  }

  const parsed = PayloadSchema.safeParse(checkpoint.payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Checkpoint data is invalid." }, { status: 400 });
  }
  const payload = parsed.data;
  if (payload.meetId !== meetId) {
    return NextResponse.json({ error: "Checkpoint does not match this meet." }, { status: 409 });
  }

  const meetTeams = await db.meetTeam.findMany({
    where: { meetId },
    select: { teamId: true, team: { select: { id: true, name: true, symbol: true } } },
  });
  const meetTeamIds = meetTeams.map(mt => mt.teamId);
  const meetSignature = buildTeamSignature(meetTeamIds);
  if (meetSignature !== checkpoint.teamSignature || meetSignature !== buildTeamSignature(payload.teamIds)) {
    return NextResponse.json({ error: "Checkpoint teams do not match this meet." }, { status: 409 });
  }

  const wrestlers = await db.wrestler.findMany({
    where: { teamId: { in: meetTeamIds } },
    select: { id: true, active: true, first: true, last: true, teamId: true },
  });
  const wrestlerIds = new Set(wrestlers.map(w => w.id));
  const activeIds = new Set(wrestlers.filter(w => w.active).map(w => w.id));

  const attendance = payload.attendance.filter(a => wrestlerIds.has(a.wrestlerId) && activeIds.has(a.wrestlerId));
  const teamOrder = (() => {
    const order = new Map<string, number>();
    const homeId = meet.homeTeamId ?? null;
    const allTeams = meetTeams.map(mt => mt.team);
    const label = (team: (typeof allTeams)[number]) =>
      (team.symbol || team.name || team.id).toLowerCase();
    let idx = 0;
    if (homeId) {
      order.set(homeId, idx);
      idx += 1;
    }
    const ordered = allTeams
      .filter(team => team.id !== homeId)
      .sort((a, b) => label(a).localeCompare(label(b)));
    for (const team of ordered) {
      if (!order.has(team.id)) {
        order.set(team.id, idx);
        idx += 1;
      }
    }
    return order;
  })();
  const wrestlerById = new Map(wrestlers.map(w => [w.id, w]));
  const compareWrestlers = (aId: string, bId: string) => {
    const a = wrestlerById.get(aId);
    const b = wrestlerById.get(bId);
    if (!a || !b) return aId.localeCompare(bId);
    const aOrder = teamOrder.get(a.teamId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = teamOrder.get(b.teamId) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aLast = a.last.toLowerCase();
    const bLast = b.last.toLowerCase();
    const lastCompare = aLast.localeCompare(bLast);
    if (lastCompare !== 0) return lastCompare;
    const aFirst = a.first.toLowerCase();
    const bFirst = b.first.toLowerCase();
    const firstCompare = aFirst.localeCompare(bFirst);
    if (firstCompare !== 0) return firstCompare;
    return a.id.localeCompare(b.id);
  };
  const bouts = payload.bouts
    .filter(b => activeIds.has(b.redId) && activeIds.has(b.greenId))
    .map(b => {
      const compare = compareWrestlers(b.redId, b.greenId);
      if (compare <= 0) return b;
      return { ...b, redId: b.greenId, greenId: b.redId, pairingScore: -b.pairingScore };
    });

  await db.$transaction(async (tx) => {
    await tx.meetWrestlerStatus.deleteMany({ where: { meetId } });

    const statusRows = attendance.filter(a => a.status !== "COMING");
    if (statusRows.length > 0) {
      await tx.meetWrestlerStatus.createMany({
        data: statusRows.map(a => ({
          meetId,
          wrestlerId: a.wrestlerId,
          status: a.status,
        })),
      });
    }

    if (attendance.length > 0) {
      await tx.meetWrestlerStatusHistory.createMany({
        data: attendance.map(a => ({
          meetId,
          wrestlerId: a.wrestlerId,
          status: a.status,
          changedById: user.id,
        })),
      });
    }

    await tx.bout.deleteMany({ where: { meetId } });
    if (bouts.length > 0) {
      await tx.bout.createMany({
        data: bouts.map(b => ({
          meetId,
          redId: b.redId,
          greenId: b.greenId,
          pairingScore: b.pairingScore,
          mat: b.mat ?? null,
          order: b.order ?? null,
          originalMat: b.originalMat ?? null,
          locked: b.locked ?? false,
          source: b.source ?? null,
          ...(b.createdAt ? { createdAt: new Date(b.createdAt) } : {}),
        })),
      });
    }
  });

  await logMeetChange(meetId, user.id, `Applied checkpoint: ${checkpoint.name}.`);

  return NextResponse.json({ ok: true, bouts: bouts.length, attendance: attendance.length });
}
