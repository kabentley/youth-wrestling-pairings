import { NextResponse } from "next/server";
import { z } from "zod";

import { assignMatsForMeet } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import type { MeetCheckpointPayload } from "@/lib/meetCheckpoints";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { buildMeetStatusAttribution } from "@/lib/meetStatusAttribution";
import { requireAnyRole } from "@/lib/rbac";
import { deleteBoutsAndRenumber } from "@/lib/renumberBouts";

const ScratchChangeSchema = z.object({
  wrestlerId: z.string().min(1),
  absent: z.boolean(),
});

const BodySchema = z.union([
  ScratchChangeSchema,
  z.object({
    changes: z.array(ScratchChangeSchema).default([]),
    completeTeamId: z.string().min(1).optional(),
  }).refine((value) => value.changes.length > 0 || Boolean(value.completeTeamId), {
    message: "No scratch changes were provided.",
  }),
]);

type ScratchChange = z.infer<typeof ScratchChangeSchema>;

function normalizeScratchChanges(body: z.infer<typeof BodySchema>) {
  const rawChanges = "changes" in body ? body.changes : [body];
  const deduped = new Map<string, ScratchChange>();
  for (const change of rawChanges) {
    deduped.set(change.wrestlerId, change);
  }
  return [...deduped.values()];
}

function batchChangeMessage(changeCount: number, scratchedCount: number, restoredCount: number, deletedBouts: number, restoredBouts: number, assignedBouts: number) {
  if (changeCount === 0) {
    return "Saved check-in completion.";
  }
  const parts = [
    `Saved ${changeCount} scratch change${changeCount === 1 ? "" : "s"}`,
    `(${scratchedCount} scratched, ${restoredCount} un-scratched)`,
  ];
  if (deletedBouts > 0) {
    parts.push(`removed ${deletedBouts} scheduled bout${deletedBouts === 1 ? "" : "s"}`);
  }
  if (restoredBouts > 0) {
    parts.push(`re-added ${restoredBouts} checkpoint bout${restoredBouts === 1 ? "" : "s"}`);
  }
  if (assignedBouts > 0) {
    parts.push(`updated ${assignedBouts} mat assignment${assignedBouts === 1 ? "" : "s"}`);
  }
  return `${parts.join(", ")}.`;
}

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

  const parsedBody = BodySchema.parse(await req.json());
  const changes = normalizeScratchChanges(parsedBody);
  const completeTeamId = "completeTeamId" in parsedBody ? parsedBody.completeTeamId : undefined;

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      deletedAt: true,
      status: true,
      homeTeam: { select: { headCoachId: true } },
      meetTeams: { select: { teamId: true, team: { select: { id: true, name: true, symbol: true } } } },
    },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (normalizeMeetPhase(meet.status) !== "READY_FOR_CHECKIN") {
    return NextResponse.json({ error: "Scratches are only available during Check-in." }, { status: 400 });
  }

  const isCoordinator = Boolean(meet.homeTeam?.headCoachId) && meet.homeTeam?.headCoachId === user.id;
  const wrestlerIds = changes.map((change) => change.wrestlerId);
  const wrestlers = wrestlerIds.length > 0
    ? await db.wrestler.findMany({
        where: { id: { in: wrestlerIds } },
        select: { id: true, first: true, last: true, teamId: true },
      })
    : [];
  if (wrestlers.length !== wrestlerIds.length) {
    return NextResponse.json({ error: "Wrestler not found." }, { status: 404 });
  }

  const meetTeamIds = new Set(meet.meetTeams.map((entry) => entry.teamId));
  for (const wrestler of wrestlers) {
    if (!meetTeamIds.has(wrestler.teamId)) {
      return NextResponse.json({ error: "Wrestler is not in this meet." }, { status: 400 });
    }
  }
  if (completeTeamId && !meetTeamIds.has(completeTeamId)) {
    return NextResponse.json({ error: "Team is not in this meet." }, { status: 400 });
  }
  const canManageAnyTeam = user.role === "ADMIN" || isCoordinator;
  if (!canManageAnyTeam) {
    if (user.role !== "COACH" || !user.teamId) {
      return NextResponse.json({ error: "You are not authorized to manage scratches." }, { status: 403 });
    }
    const unauthorizedWrestler = wrestlers.find((wrestler) => wrestler.teamId !== user.teamId);
    if (unauthorizedWrestler) {
      return NextResponse.json(
        { error: "Coaches may only manage scratches for their own team." },
        { status: 403 },
      );
    }
    if (completeTeamId && completeTeamId !== user.teamId) {
      return NextResponse.json(
        { error: "Coaches may only complete check-in for their own team." },
        { status: 403 },
      );
    }
  }
  if (changes.length === 0 && !completeTeamId) {
    return NextResponse.json({ error: "No scratch changes were provided." }, { status: 400 });
  }

  const restoreIds = changes.filter((change) => !change.absent).map((change) => change.wrestlerId);
  const scratchIds = changes.filter((change) => change.absent).map((change) => change.wrestlerId);
  const completedTeam = completeTeamId
    ? meet.meetTeams.find((entry) => entry.teamId === completeTeamId)?.team ?? null
    : null;
  const completionTimestamp = completeTeamId ? new Date() : null;
  const changedAt = completionTimestamp ?? new Date();
  const readyCheckpoint = restoreIds.length > 0
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
    const attribution = buildMeetStatusAttribution(user, "CHECKIN", changedAt);
    if (completeTeamId) {
      await tx.meetTeam.update({
        where: { meetId_teamId: { meetId, teamId: completeTeamId } },
        data: {
          checkinCompletedAt: completionTimestamp,
          checkinCompletedById: user.id,
        },
      });
    }

    await Promise.all(changes.map((change) => (
      tx.meetWrestlerStatus.upsert({
        where: { meetId_wrestlerId: { meetId, wrestlerId: change.wrestlerId } },
        update: { status: change.absent ? "ABSENT" : "COMING", ...attribution },
        create: { meetId, wrestlerId: change.wrestlerId, status: change.absent ? "ABSENT" : "COMING", ...attribution },
      })
    )));

    await tx.meetWrestlerStatusHistory.createMany({
      data: changes.map((change) => ({
        meetId,
        wrestlerId: change.wrestlerId,
        status: change.absent ? "ABSENT" : "COMING",
        changedById: user.id,
      })),
    });

    const deleted = scratchIds.length > 0
      ? await deleteBoutsAndRenumber(tx, meetId, {
          OR: [
            { redId: { in: scratchIds } },
            { greenId: { in: scratchIds } },
          ],
        })
      : { deleted: 0, renumbered: 0, mats: [] as number[] };

    const checkpointPayload = readyCheckpoint?.payload as MeetCheckpointPayload | null | undefined;
    const checkpointBouts = Array.isArray(checkpointPayload?.bouts)
      ? checkpointPayload.bouts.filter((bout) => restoreIds.includes(bout.redId) || restoreIds.includes(bout.greenId))
      : [];

    if (checkpointBouts.length === 0) {
      return {
        deleted,
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

    const boutsToRestore: Array<{
      meetId: string;
      redId: string;
      greenId: string;
      pairingScore: number;
      mat: number | null;
      order: number | null;
      originalMat: number | null;
      locked: boolean;
      assignedByPeopleRule: boolean;
      peopleRuleUserId: string | null;
      source: string | null;
      createdAt?: Date;
    }> = [];

    for (const bout of checkpointBouts) {
      if (!attendingIds.has(bout.redId) || !attendingIds.has(bout.greenId)) continue;
      const pair = [bout.redId, bout.greenId].slice().sort((a, b) => a.localeCompare(b)).join("|");
      if (currentPairs.has(pair)) continue;
      currentPairs.add(pair);
      const requestedSlot = bout.mat != null && bout.order != null ? `${bout.mat}:${bout.order}` : null;
      const slotAvailable = requestedSlot ? !occupiedSlots.has(requestedSlot) : false;
      if (requestedSlot && slotAvailable) occupiedSlots.add(requestedSlot);
      boutsToRestore.push({
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
      });
    }

    if (boutsToRestore.length > 0) {
      await tx.bout.createMany({
        data: boutsToRestore,
      });
    }

    return {
      deleted,
      restoredBouts: boutsToRestore.length,
    };
  });

  const assignResult = mutationSummary.restoredBouts > 0
    ? await assignMatsForMeet(meetId, { preserveExisting: true })
    : { assigned: 0, reordered: 0 };

  await logMeetChange(
    meetId,
    user.id,
    [
      `Scratch: saved ${changes.length} change${changes.length === 1 ? "" : "s"} (${scratchIds.length} scratched, ${restoreIds.length} un-scratched), removed ${mutationSummary.deleted.deleted} scheduled bout${mutationSummary.deleted.deleted === 1 ? "" : "s"}${mutationSummary.restoredBouts > 0 ? ` and re-added ${mutationSummary.restoredBouts} checkpoint bout${mutationSummary.restoredBouts === 1 ? "" : "s"}` : ""}.`,
      completedTeam ? `Check-in: ${completedTeam.symbol || completedTeam.name} marked complete.` : "",
    ].filter(Boolean).join(" "),
  );

  const completionMessage = completedTeam
    ? `${completedTeam.symbol || completedTeam.name} check-in complete.`
    : null;
  return NextResponse.json({
    ok: true,
    scratchedWrestlers: scratchIds.length,
    restoredWrestlers: restoreIds.length,
    deletedBouts: mutationSummary.deleted.deleted,
    renumberedBouts: mutationSummary.deleted.renumbered,
    affectedMats: mutationSummary.deleted.mats,
    restoredBouts: mutationSummary.restoredBouts,
    assignedBouts: assignResult.assigned,
    completedTeamCheckin: completeTeamId
      ? {
          teamId: completeTeamId,
          checkinCompletedAt: completionTimestamp?.toISOString() ?? null,
          completedByUsername: user.username,
        }
      : null,
    message: batchChangeMessage(
      changes.length,
      scratchIds.length,
      restoreIds.length,
      mutationSummary.deleted.deleted,
      mutationSummary.restoredBouts,
      assignResult.assigned,
    ) + (completionMessage ? ` ${completionMessage}` : ""),
  });
}
