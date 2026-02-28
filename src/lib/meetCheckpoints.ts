import { db } from "@/lib/db";

export type AttendanceStatus = "COMING" | "NOT_COMING" | "LATE" | "EARLY";

export type BoutSource = string | null;

export type MeetCheckpointPayload = {
  version: 1;
  name: string;
  createdAt: string;
  meetId: string;
  meetName: string;
  meetDate: string;
  teamIds: string[];
  attendance: { wrestlerId: string; status: AttendanceStatus }[];
  bouts: {
    redId: string;
    greenId: string;
    pairingScore: number;
    mat?: number | null;
    order?: number | null;
    originalMat?: number | null;
    locked?: boolean;
    source?: BoutSource;
    createdAt?: string;
  }[];
};

export function buildTeamSignature(teamIds: string[]) {
  return teamIds.slice().sort().join("|");
}

function normalizeAttendanceStatus(status?: string | null): AttendanceStatus {
  if (status === "ABSENT") return "NOT_COMING";
  if (status === "NOT_COMING" || status === "LATE" || status === "EARLY") return status;
  return "COMING";
}

export async function buildMeetCheckpointPayload(meetId: string, name: string): Promise<MeetCheckpointPayload | null> {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { id: true, name: true, date: true, deletedAt: true },
  });
  if (!meet || meet.deletedAt) return null;

  const meetTeams = await db.meetTeam.findMany({
    where: { meetId },
    select: { teamId: true },
  });
  const teamIds = meetTeams.map(mt => mt.teamId);

  const [wrestlers, statuses, bouts] = await Promise.all([
    db.wrestler.findMany({
      where: { teamId: { in: teamIds } },
      select: { id: true, teamId: true, first: true, last: true },
    }),
    db.meetWrestlerStatus.findMany({
      where: { meetId },
      select: { wrestlerId: true, status: true },
    }),
    db.bout.findMany({
      where: { meetId },
      select: {
        redId: true,
        greenId: true,
        pairingScore: true,
        mat: true,
        order: true,
        originalMat: true,
        locked: true,
        source: true,
        createdAt: true,
      },
    }),
  ]);

  const statusMap = new Map(statuses.map(s => [s.wrestlerId, s.status]));
  const sortedWrestlers = wrestlers.slice().sort((a, b) => {
    if (a.teamId !== b.teamId) return a.teamId.localeCompare(b.teamId);
    if (a.last !== b.last) return a.last.localeCompare(b.last);
    return a.first.localeCompare(b.first);
  });

  const attendance = sortedWrestlers.map(w => ({
    wrestlerId: w.id,
    status: normalizeAttendanceStatus(statusMap.get(w.id)),
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
      locked: b.locked ?? false,
      source: b.source ?? null,
      createdAt: b.createdAt.toISOString(),
    })),
  };
}
