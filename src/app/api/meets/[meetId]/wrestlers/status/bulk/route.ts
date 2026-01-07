import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  action: z.enum(["CLEAR", "SET"]),
  status: z.enum(["COMING", "NOT_COMING", "LATE", "EARLY"]).nullable().optional(),
  teamId: z.string().nullable().optional(),
});

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

  const meetTeams = await db.meetTeam.findMany({
    where: { meetId },
    select: { teamId: true },
  });
  const teamIds = meetTeams.map(t => t.teamId);
  const scopedTeamId = body.teamId && teamIds.includes(body.teamId) ? body.teamId : null;
  const scopedTeam = scopedTeamId
    ? await db.team.findUnique({ where: { id: scopedTeamId }, select: { name: true } })
    : null;
  const scopedTeamName = scopedTeam?.name ?? "team";
  const wrestlerWhere = scopedTeamId ? { teamId: scopedTeamId } : { teamId: { in: teamIds } };
  const wrestlers = await db.wrestler.findMany({
    where: wrestlerWhere,
    select: { id: true },
  });
  const wrestlerIds = wrestlers.map(w => w.id);

  if (body.action === "CLEAR") {
    await db.meetWrestlerStatus.deleteMany({ where: { meetId } });
    await db.meetWrestlerStatusHistory.createMany({
      data: wrestlerIds.map(wrestlerId => ({
        meetId,
        wrestlerId,
        status: "COMING",
        changedById: user.id,
      })),
    });
  await logMeetChange(
    meetId,
    user.id,
    scopedTeamId ? `Set ${scopedTeamName} to all coming.` : "Set all to all coming."
  );
    return NextResponse.json({ ok: true });
  }

  const status = body.status ?? "COMING";
  await db.meetWrestlerStatus.deleteMany({ where: { meetId } });
  if (status !== "COMING") {
    await db.meetWrestlerStatus.createMany({
      data: wrestlerIds.map(wrestlerId => ({
        meetId,
        wrestlerId,
        status,
      })),
    });
  }
  await db.meetWrestlerStatusHistory.createMany({
    data: wrestlerIds.map(wrestlerId => ({
      meetId,
      wrestlerId,
      status,
      changedById: user.id,
    })),
  });

  if (status === "NOT_COMING") {
    await db.bout.deleteMany({ where: { meetId } });
  }

  await logMeetChange(
    meetId,
    user.id,
    scopedTeamId
      ? `Set ${scopedTeamName} attendance to ${status.replace(/_/g, " ").toLowerCase()}.`
      : `Set all attendance to ${status.replace(/_/g, " ").toLowerCase()}.`
  );
  return NextResponse.json({ ok: true });
}
