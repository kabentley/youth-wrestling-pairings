import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireAnyRole } from "@/lib/rbac";
import { getUserFullName } from "@/lib/userName";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { deletedAt: true },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404, headers: NO_STORE_HEADERS });
  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { pairingScore: "asc" }],
  });
  const sourceIds = [...new Set(bouts.map(b => b.source).filter((id): id is string => Boolean(id)))];
  const peopleRuleUserIds = [
    ...new Set(bouts.map(b => b.peopleRuleUserId).filter((id): id is string => Boolean(id))),
  ];
  const sourceUsers = sourceIds.length > 0
    ? await db.user.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, firstName: true, lastName: true, username: true, teamId: true, team: { select: { color: true } } },
    })
    : [];
  const peopleRuleUsers = peopleRuleUserIds.length > 0
    ? await db.user.findMany({
      where: { id: { in: peopleRuleUserIds } },
      select: { id: true, role: true, firstName: true, lastName: true, username: true, teamId: true, team: { select: { color: true } } },
    })
    : [];
  const sourceMap = new Map(sourceUsers.map(user => [user.id, {
    id: user.id,
    name: getUserFullName(user),
    username: user.username,
    teamId: user.teamId,
    teamColor: user.team?.color ?? null,
  }]));
  const peopleRuleMap = new Map(peopleRuleUsers.map(user => [user.id, {
    id: user.id,
    role: user.role,
    name: getUserFullName(user),
    username: user.username,
    teamId: user.teamId,
    teamColor: user.team?.color ?? null,
  }]));
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
  const enriched = filtered.map(b => ({
    ...b,
    sourceUser: b.source ? sourceMap.get(b.source) ?? null : null,
    peopleRuleUser: b.peopleRuleUserId ? peopleRuleMap.get(b.peopleRuleUserId) ?? null : null,
  }));
  return NextResponse.json(enriched, { headers: NO_STORE_HEADERS });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireAnyRole(["COACH", "ADMIN"]);
  try {
    await requireMeetLock(meetId, user.id, user.role);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  await db.bout.deleteMany({ where: { meetId } });
  await logMeetChange(meetId, user.id, "Restarted meet setup and cleared pairings.");
  revalidatePath(`/meets/${meetId}`);
  revalidatePath("/meets");
  return NextResponse.json({ ok: true });
}
