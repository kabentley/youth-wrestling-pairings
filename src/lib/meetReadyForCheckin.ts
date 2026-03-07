import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type ChecklistClient = Prisma.TransactionClient | PrismaClient;

export type ReadyForCheckinChecklistItem = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  severity: "error" | "warning";
  action?: "sync-volunteer-mats" | "fix-rest-conflicts";
  actionLabel?: string;
};

export type ReadyForCheckinChecklist = {
  ok: boolean;
  checkedAt: string;
  items: ReadyForCheckinChecklistItem[];
};

function normalizeAttendanceStatus(status?: string | null) {
  if (status === "ABSENT") return "NOT_COMING";
  if (status === "COMING" || status === "LATE" || status === "EARLY") return status;
  return "NOT_COMING";
}

function formatNames(list: Array<{ first: string; last: string }>, limit = 4) {
  const names = list.slice(0, limit).map((entry) => `${entry.first} ${entry.last}`);
  if (list.length > limit) {
    names.push(`and ${list.length - limit} more`);
  }
  return names.join(", ");
}

function formatMatList(mats: number[]) {
  return mats.map((mat) => `Mat ${mat}`).join(", ");
}

function restConflictSeverityLabel(minGap: number, restGap: number) {
  if (minGap <= 1) return "severe";
  if (minGap <= Math.max(2, Math.floor(restGap / 2))) return "high";
  return "moderate";
}

export async function buildReadyForCheckinChecklist(
  meetId: string,
  client: ChecklistClient = db,
): Promise<ReadyForCheckinChecklist | null> {
  const meet = await client.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      deletedAt: true,
      homeTeamId: true,
      numMats: true,
      restGap: true,
      meetTeams: { select: { teamId: true } },
    },
  });
  if (!meet || meet.deletedAt) return null;

  const teamIds = meet.meetTeams.map((entry) => entry.teamId);
  const [wrestlers, statuses, bouts, volunteers] = await Promise.all([
    client.wrestler.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        id: true,
        first: true,
        last: true,
        active: true,
      },
      orderBy: [{ last: "asc" }, { first: "asc" }],
    }),
    client.meetWrestlerStatus.findMany({
      where: { meetId },
      select: { wrestlerId: true, status: true },
    }),
    client.bout.findMany({
      where: { meetId },
      select: {
        id: true,
        redId: true,
        greenId: true,
        mat: true,
        order: true,
      },
      orderBy: [{ mat: "asc" }, { order: "asc" }, { id: "asc" }],
    }),
    client.user.findMany({
      where: {
        teamId: meet.homeTeamId ?? "__missing_home_team__",
        role: { in: ["COACH", "TABLE_WORKER", "PARENT"] },
      },
      select: {
        id: true,
        role: true,
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
    }),
  ]);

  const maxMat = Math.max(1, Math.min(6, meet.numMats));
  const restGap = Math.max(1, meet.restGap);
  const statusByWrestler = new Map(
    statuses.map((entry) => [entry.wrestlerId, normalizeAttendanceStatus(entry.status)]),
  );
  const activeWrestlers = wrestlers.filter((wrestler) => wrestler.active);
  const attendingWrestlers = activeWrestlers.filter(
    (wrestler) => statusByWrestler.get(wrestler.id) !== "NOT_COMING",
  );

  const pairedWrestlerIds = new Set<string>();
  const boutsByKidId = new Map<string, Array<{ id: string; mat: number | null }>>();
  const boutById = new Map<string, { id: string; mat: number | null; order: number | null }>();
  for (const bout of bouts) {
    pairedWrestlerIds.add(bout.redId);
    pairedWrestlerIds.add(bout.greenId);
    const mapped = { id: bout.id, mat: bout.mat ?? null };
    const redList = boutsByKidId.get(bout.redId) ?? [];
    redList.push(mapped);
    boutsByKidId.set(bout.redId, redList);
    const greenList = boutsByKidId.get(bout.greenId) ?? [];
    greenList.push(mapped);
    boutsByKidId.set(bout.greenId, greenList);
    boutById.set(bout.id, { id: bout.id, mat: bout.mat ?? null, order: bout.order ?? null });
  }

  const wrestlersWithoutBouts = attendingWrestlers.filter(
    (wrestler) => !pairedWrestlerIds.has(wrestler.id),
  );

  const validVolunteerMat = (matNumber: number | null | undefined) =>
    typeof matNumber === "number" && matNumber >= 1 && matNumber <= maxMat ? matNumber : null;

  const matsMissingCoach: number[] = [];
  const matsMissingTableWorker: number[] = [];
  for (let mat = 1; mat <= maxMat; mat += 1) {
    const onMat = volunteers.filter((volunteer) => validVolunteerMat(volunteer.staffMatNumber) === mat);
    if (!onMat.some((volunteer) => volunteer.role === "COACH")) {
      matsMissingCoach.push(mat);
    }
    if (!onMat.some((volunteer) => volunteer.role === "TABLE_WORKER" || volunteer.role === "PARENT")) {
      matsMissingTableWorker.push(mat);
    }
  }

  const acceptableVolunteerMatsByKidId = new Map<string, Set<number>>();
  for (const volunteer of volunteers) {
    const volunteerMat = validVolunteerMat(volunteer.staffMatNumber);
    if (volunteerMat === null) continue;
    for (const child of volunteer.children) {
      if (child.wrestler.teamId !== meet.homeTeamId) continue;
      const mats = acceptableVolunteerMatsByKidId.get(child.wrestler.id) ?? new Set<number>();
      mats.add(volunteerMat);
      acceptableVolunteerMatsByKidId.set(child.wrestler.id, mats);
    }
  }

  let wrongVolunteerBoutCount = 0;
  for (const [wrestlerId, acceptableMats] of acceptableVolunteerMatsByKidId.entries()) {
    for (const bout of boutsByKidId.get(wrestlerId) ?? []) {
      if (bout.mat !== null && !acceptableMats.has(bout.mat)) {
        wrongVolunteerBoutCount += 1;
      }
    }
  }

  const assignedBouts = bouts.filter(
    (bout): bout is typeof bout & { mat: number; order: number } =>
      typeof bout.mat === "number" &&
      bout.mat >= 1 &&
      bout.mat <= maxMat &&
      typeof bout.order === "number" &&
      bout.order >= 1,
  );
  const byWrestler = new Map<string, Array<{ boutId: string; order: number }>>();
  for (const bout of assignedBouts) {
    for (const wrestlerId of [bout.redId, bout.greenId]) {
      const list = byWrestler.get(wrestlerId) ?? [];
      list.push({ boutId: bout.id, order: bout.order });
      byWrestler.set(wrestlerId, list);
    }
  }

  const conflictByBoutWrestler = new Map<string, number>();
  for (const entries of byWrestler.values()) {
    entries.sort((a, b) => a.order - b.order);
    for (let index = 0; index < entries.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex += 1) {
        const gap = entries[nextIndex].order - entries[index].order;
        if (gap > restGap) break;
        for (const boutId of [entries[index].boutId, entries[nextIndex].boutId]) {
          const key = `${boutId}:${index}:${nextIndex}`;
          const current = conflictByBoutWrestler.get(key);
          conflictByBoutWrestler.set(key, current === undefined ? gap : Math.min(current, gap));
        }
      }
    }
  }

  const restConflictStatsByMat = new Map<number, { count: number; minGap: number }>();
  for (const [key, gap] of conflictByBoutWrestler.entries()) {
    const boutId = key.split(":")[0];
    const bout = boutById.get(boutId);
    if (!bout?.mat) continue;
    const current = restConflictStatsByMat.get(bout.mat);
    if (!current) {
      restConflictStatsByMat.set(bout.mat, { count: 1, minGap: gap });
      continue;
    }
    current.count += 1;
    current.minGap = Math.min(current.minGap, gap);
  }

  const restConflictDetails = [...restConflictStatsByMat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mat, stats]) => {
      const severity = restConflictSeverityLabel(stats.minGap, restGap);
      return `Mat ${mat}: ${stats.count} conflict${stats.count === 1 ? "" : "s"}, ${severity} severity (closest gap ${stats.minGap}).`;
    });

  const items: ReadyForCheckinChecklistItem[] = [
    {
      id: "bouts-created",
      label: "Bouts created",
      ok: bouts.length > 0,
      severity: "error",
      detail: bouts.length > 0
        ? `${bouts.length} bout${bouts.length === 1 ? "" : "s"} created.`
        : "Create bouts before moving to Check-in.",
    },
    {
      id: "coverage",
      label: "Attending wrestlers have bouts",
      ok: wrestlersWithoutBouts.length === 0,
      severity: "warning",
      detail: wrestlersWithoutBouts.length === 0
        ? "Every attending wrestler has at least one bout."
        : `${wrestlersWithoutBouts.length} attending wrestler${wrestlersWithoutBouts.length === 1 ? "" : "s"} still have no bouts: ${formatNames(wrestlersWithoutBouts)}.`,
    },
    {
      id: "mat-coaches",
      label: "Each mat has a coach",
      ok: matsMissingCoach.length === 0,
      severity: "warning",
      detail: matsMissingCoach.length === 0
        ? "Every mat has a coach assigned."
        : `${formatMatList(matsMissingCoach)} ${matsMissingCoach.length === 1 ? "has" : "have"} no coach assigned.`,
    },
    {
      id: "mat-table-workers",
      label: "Each mat has a table worker or parent",
      ok: matsMissingTableWorker.length === 0,
      severity: "warning",
      detail: matsMissingTableWorker.length === 0
        ? "Every mat has a table worker or parent assigned."
        : `${formatMatList(matsMissingTableWorker)} ${matsMissingTableWorker.length === 1 ? "has" : "have"} no table worker or parent assigned.`,
    },
    {
      id: "volunteer-mat-mismatch",
      label: "All volunteers' wrestlers are on their mat",
      ok: wrongVolunteerBoutCount === 0,
      severity: "warning",
      detail: wrongVolunteerBoutCount === 0
        ? ""
        : `${wrongVolunteerBoutCount} volunteer kid bout${wrongVolunteerBoutCount === 1 ? "" : "s"} are not on any linked volunteer mat.`,
      action: wrongVolunteerBoutCount > 0 ? "sync-volunteer-mats" : undefined,
      actionLabel: wrongVolunteerBoutCount > 0 ? "Fix volunteer mats" : undefined,
    },
    {
      id: "rest-conflicts",
      label: "Mats are clear of rest conflicts",
      ok: restConflictDetails.length === 0,
      severity: "warning",
      detail: restConflictDetails.length === 0
        ? "No rest conflicts detected across mats."
        : restConflictDetails.join(" "),
      action: restConflictDetails.length > 0 ? "fix-rest-conflicts" : undefined,
      actionLabel: restConflictDetails.length > 0 ? "Reorder Mats" : undefined,
    },
  ];

  return {
    ok: items.every((item) => item.severity !== "error" || item.ok),
    checkedAt: new Date().toISOString(),
    items,
  };
}
