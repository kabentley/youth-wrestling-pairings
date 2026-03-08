import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

export type AttendanceStatus = "COMING" | "NOT_COMING" | "LATE" | "EARLY";
export type CheckpointAttendanceStatus = AttendanceStatus | null;

export type BoutSource = string | null;

export type MeetCheckpointPayload = {
  version: 1;
  name: string;
  createdAt: string;
  meetId: string;
  meetName: string;
  meetDate: string;
  teamIds: string[];
  attendance: {
    wrestlerId: string;
    status: CheckpointAttendanceStatus;
    lastChangedByUsername?: string | null;
    lastChangedByRole?: string | null;
    lastChangedSource?: string | null;
    lastChangedAt?: string | null;
  }[];
  bouts: {
    redId: string;
    greenId: string;
    pairingScore: number;
    mat?: number | null;
    order?: number | null;
    originalMat?: number | null;
    locked?: boolean;
    assignedByPeopleRule?: boolean;
    peopleRuleUserId?: string | null;
    source?: BoutSource;
    createdAt?: string;
  }[];
};

type CheckpointClient = Prisma.TransactionClient | PrismaClient;

export function buildTeamSignature(teamIds: string[]) {
  return teamIds.slice().sort().join("|");
}

function normalizeAttendanceStatus(status?: string | null): CheckpointAttendanceStatus {
  if (status == null) return null;
  if (status === "ABSENT" || status === "NOT_COMING") return "NOT_COMING";
  if (status === "COMING" || status === "LATE" || status === "EARLY") return status;
  return null;
}

export async function buildMeetCheckpointPayload(
  meetId: string,
  name: string,
  client: CheckpointClient = db,
): Promise<MeetCheckpointPayload | null> {
  const meet = await client.meet.findUnique({
    where: { id: meetId },
    select: { id: true, name: true, date: true, deletedAt: true },
  });
  if (!meet || meet.deletedAt) return null;

  const meetTeams = await client.meetTeam.findMany({
    where: { meetId },
    select: { teamId: true },
  });
  const teamIds = meetTeams.map(mt => mt.teamId);

  const [wrestlers, statuses, bouts] = await Promise.all([
    client.wrestler.findMany({
      where: { teamId: { in: teamIds } },
      select: { id: true, teamId: true, first: true, last: true },
    }),
    client.meetWrestlerStatus.findMany({
      where: { meetId },
      select: {
        wrestlerId: true,
        status: true,
        lastChangedByUsername: true,
        lastChangedByRole: true,
        lastChangedSource: true,
        lastChangedAt: true,
      },
    }),
    client.bout.findMany({
      where: { meetId },
      select: {
        redId: true,
        greenId: true,
        pairingScore: true,
        mat: true,
        order: true,
        originalMat: true,
        locked: true,
        assignedByPeopleRule: true,
        peopleRuleUserId: true,
        source: true,
        createdAt: true,
      },
    }),
  ]);

  const statusMap = new Map(statuses.map(s => [s.wrestlerId, s]));
  const sortedWrestlers = wrestlers.slice().sort((a, b) => {
    if (a.teamId !== b.teamId) return a.teamId.localeCompare(b.teamId);
    if (a.last !== b.last) return a.last.localeCompare(b.last);
    return a.first.localeCompare(b.first);
  });

  const attendance = sortedWrestlers.map(w => ({
    wrestlerId: w.id,
    status: normalizeAttendanceStatus(statusMap.get(w.id)?.status),
    lastChangedByUsername: statusMap.get(w.id)?.lastChangedByUsername ?? null,
    lastChangedByRole: statusMap.get(w.id)?.lastChangedByRole ?? null,
    lastChangedSource: statusMap.get(w.id)?.lastChangedSource ?? null,
    lastChangedAt: statusMap.get(w.id)?.lastChangedAt?.toISOString() ?? null,
  }));

  return {
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    meetId: meet.id,
    meetName: meet.name,
    meetDate: meet.date.toISOString(),
    teamIds,
    attendance,
    bouts: bouts.map(b => ({
      redId: b.redId,
      greenId: b.greenId,
      pairingScore: b.pairingScore,
      mat: b.mat ?? null,
      order: b.order ?? null,
      originalMat: b.originalMat ?? null,
      locked: b.locked,
      assignedByPeopleRule: b.assignedByPeopleRule,
      peopleRuleUserId: b.peopleRuleUserId ?? null,
      source: b.source ?? null,
      createdAt: b.createdAt.toISOString(),
    })),
  };
}
