import { NextResponse } from "next/server";
import { z } from "zod";

import { assignMatsForMeet } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import type { MeetCheckpointPayload } from "@/lib/meetCheckpoints";
import { formatWrestlerLabel } from "@/lib/meetChangeFormat";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { requireAnyRole } from "@/lib/rbac";
import { deleteBoutsAndRenumber } from "@/lib/renumberBouts";

const BodySchema = z.object({
  wrestlerId: z.string().min(1),
  absent: z.boolean(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let user: Awaited<ReturnType<typeof requireAnyRole>>["user"];
  try {
    ({ user } = await requireAnyRole(["COACH", "ADMIN"]));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to manage scratches." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

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
      deletedAt: true,
      status: true,
      homeTeam: { select: { headCoachId: true } },
      meetTeams: { select: { teamId: true } },
    },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (normalizeMeetPhase(meet.status) !== "READY_FOR_CHECKIN") {
    return NextResponse.json({ error: "Scratches are only available during Check-in." }, { status: 400 });
  }

  const isCoordinator = Boolean(meet.homeTeam?.headCoachId) && meet.homeTeam?.headCoachId === user.id;
  if (!isCoordinator && user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only the Meet Coordinator or an admin can manage scratches." },
      { status: 403 },
    );
  }

  const wrestler = await db.wrestler.findUnique({
    where: { id: body.wrestlerId },
    select: { id: true, first: true, last: true, teamId: true },
  });
  if (!wrestler) {
    return NextResponse.json({ error: "Wrestler not found." }, { status: 404 });
  }

  const meetTeamIds = new Set(meet.meetTeams.map((entry) => entry.teamId));
  if (!meetTeamIds.has(wrestler.teamId)) {
    return NextResponse.json({ error: "Wrestler is not in this meet." }, { status: 400 });
  }

  const readyCheckpoint = !body.absent
    ? await db.meetCheckpoint.findFirst({
        where: {
          meetId,
          OR: [
            { name: { startsWith: "Ready for Check-in " } },
            { name: { startsWith: "Check-in " } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, payload: true },
      })
    : null;

  const mutationSummary = await db.$transaction(async (tx) => {
    if (body.absent) {
      await tx.meetWrestlerStatus.upsert({
        where: { meetId_wrestlerId: { meetId, wrestlerId: wrestler.id } },
        update: { status: "ABSENT" },
        create: { meetId, wrestlerId: wrestler.id, status: "ABSENT" },
      });
      await tx.meetWrestlerStatusHistory.create({
        data: {
          meetId,
          wrestlerId: wrestler.id,
          status: "ABSENT",
          changedById: user.id,
        },
      });

      const deleted = await deleteBoutsAndRenumber(tx, meetId, {
        OR: [{ redId: wrestler.id }, { greenId: wrestler.id }],
      });
      return {
        deleted,
        restoredBouts: 0,
      };
    }

    await tx.meetWrestlerStatus.upsert({
      where: { meetId_wrestlerId: { meetId, wrestlerId: wrestler.id } },
      update: { status: "COMING" },
      create: { meetId, wrestlerId: wrestler.id, status: "COMING" },
    });
    await tx.meetWrestlerStatusHistory.create({
      data: {
        meetId,
        wrestlerId: wrestler.id,
        status: "COMING",
        changedById: user.id,
      },
    });

    const checkpointPayload = readyCheckpoint?.payload as MeetCheckpointPayload | null | undefined;
    const checkpointBouts = Array.isArray(checkpointPayload?.bouts)
      ? checkpointPayload.bouts.filter((bout) => bout.redId === wrestler.id || bout.greenId === wrestler.id)
      : [];

    if (checkpointBouts.length === 0) {
      return {
        deleted: { deleted: 0, renumbered: 0, mats: [] as number[] },
        restoredBouts: 0,
      };
    }

    const [statuses, currentBouts] = await Promise.all([
      tx.meetWrestlerStatus.findMany({
        where: { meetId },
        select: { wrestlerId: true, status: true },
      }),
      tx.bout.findMany({
        where: { meetId },
        select: { redId: true, greenId: true, mat: true, order: true },
      }),
    ]);

    const attendingIds = new Set(
      statuses
        .filter((entry) => entry.status === "COMING" || entry.status === "LATE" || entry.status === "EARLY")
        .map((entry) => entry.wrestlerId),
    );
    attendingIds.add(wrestler.id);

    const currentPairs = new Set(
      currentBouts.map((bout) =>
        [bout.redId, bout.greenId].slice().sort((a, b) => a.localeCompare(b)).join("|"),
      ),
    );
    const occupiedSlots = new Set(
      currentBouts
        .filter((bout) => bout.mat != null && bout.order != null)
        .map((bout) => `${bout.mat}:${bout.order}`),
    );

    const boutsToRestore = checkpointBouts
      .filter((bout) => {
        const opponentId = bout.redId === wrestler.id ? bout.greenId : bout.redId;
        if (!attendingIds.has(opponentId)) return false;
        const pair = [bout.redId, bout.greenId].slice().sort((a, b) => a.localeCompare(b)).join("|");
        return !currentPairs.has(pair);
      })
      .map((bout) => {
        const requestedSlot = bout.mat != null && bout.order != null ? `${bout.mat}:${bout.order}` : null;
        const slotAvailable = requestedSlot ? !occupiedSlots.has(requestedSlot) : false;
        if (requestedSlot && slotAvailable) occupiedSlots.add(requestedSlot);
        return {
          meetId,
          redId: bout.redId,
          greenId: bout.greenId,
          pairingScore: bout.pairingScore,
          mat: slotAvailable ? (bout.mat ?? null) : null,
          order: slotAvailable ? (bout.order ?? null) : null,
          originalMat: bout.originalMat ?? null,
          locked: bout.locked ?? false,
          assignedByPeopleRule: bout.assignedByPeopleRule ?? false,
          peopleRuleUserId: bout.peopleRuleUserId ?? null,
          source: bout.source ?? null,
          ...(bout.createdAt ? { createdAt: new Date(bout.createdAt) } : {}),
        };
      });

    if (boutsToRestore.length > 0) {
      await tx.bout.createMany({
        data: boutsToRestore,
      });
    }

    return {
      deleted: { deleted: 0, renumbered: 0, mats: [] as number[] },
      restoredBouts: boutsToRestore.length,
    };
  });

  const assignResult = !body.absent && mutationSummary.restoredBouts > 0
    ? await assignMatsForMeet(meetId, { preserveExisting: true })
    : { assigned: 0, reordered: 0 };

  const wrestlerLabel = (formatWrestlerLabel(wrestler) ?? `${wrestler.first} ${wrestler.last}`.trim()) || "Wrestler";
  await logMeetChange(
    meetId,
    user.id,
    body.absent
      ? `Scratch: marked ${wrestlerLabel} scratched and removed ${mutationSummary.deleted.deleted} scheduled bout${mutationSummary.deleted.deleted === 1 ? "" : "s"}.`
      : (mutationSummary.restoredBouts > 0
        ? `Scratch: restored ${wrestlerLabel} to coming and restored ${mutationSummary.restoredBouts} checkpoint bout${mutationSummary.restoredBouts === 1 ? "" : "s"}.`
        : `Scratch: restored ${wrestlerLabel} to coming.`),
  );

  return NextResponse.json({
    ok: true,
    deletedBouts: mutationSummary.deleted.deleted,
    renumberedBouts: mutationSummary.deleted.renumbered,
    affectedMats: mutationSummary.deleted.mats,
    restoredBouts: mutationSummary.restoredBouts,
    assignedBouts: assignResult.assigned,
  });
}
