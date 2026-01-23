import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function POST(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { id: true, deletedAt: true },
  });
  if (!meet || !meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  const current = await db.meet.findUnique({
    where: { id: meetId },
    select: { name: true },
  });
  const baseName = current?.name ?? "Restored Meet";
  let nextName = baseName;
  let suffix = 1;
  while (true) {
    const existing = await db.meet.findFirst({
      where: {
        name: nextName,
        deletedAt: null,
        id: { not: meetId },
      },
      select: { id: true },
    });
    if (!existing) break;
    suffix += 1;
    nextName = `${baseName} (restored ${suffix})`;
  }
  if (user.role !== "ADMIN") {
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned." }, { status: 403 });
    }
    const inMeet = await db.meetTeam.findFirst({
      where: { meetId, teamId: user.teamId },
      select: { teamId: true },
    });
    if (!inMeet) {
      return NextResponse.json({ error: "You are not authorized to restore this meet." }, { status: 403 });
    }
  }

  await db.meet.update({
    where: { id: meetId },
    data: { deletedAt: null, deletedById: null, updatedById: user.id, name: nextName },
  });

  const teamIds = await db.meetTeam.findMany({
    where: { meetId },
    select: { teamId: true },
  });
  const activeWrestlers = teamIds.length
    ? await db.wrestler.findMany({
        where: { teamId: { in: teamIds.map(t => t.teamId) }, active: true },
        select: { id: true },
      })
    : [];
  const activeIds = new Set(activeWrestlers.map(w => w.id));

  if (activeIds.size === 0) {
    await db.bout.deleteMany({ where: { meetId } });
    await db.meetWrestlerStatus.deleteMany({ where: { meetId } });
  } else {
    const activeList = Array.from(activeIds);
    await db.bout.deleteMany({
      where: {
        meetId,
        OR: [
          { redId: { notIn: activeList } },
          { greenId: { notIn: activeList } },
        ],
      },
    });

    await db.meetWrestlerStatus.deleteMany({
      where: {
        meetId,
        wrestlerId: { notIn: activeList },
      },
    });
  }

  revalidatePath("/meets");
  revalidatePath(`/meets/${meetId}`);

  return NextResponse.json({ ok: true });
}
