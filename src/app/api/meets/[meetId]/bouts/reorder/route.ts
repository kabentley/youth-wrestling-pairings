import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  mats: z.record(z.string(), z.array(z.string().min(1))),
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

  const allIds = Object.values(body.mats).flat();
  const found = await db.bout.findMany({
    where: { id: { in: allIds }, meetId },
    select: { id: true, mat: true, order: true },
  });
  const foundSet = new Set(found.map(b => b.id));
  const currentById = new Map(found.map(b => [b.id, { mat: b.mat, order: b.order }]));
  for (const id of allIds) {
    if (!foundSet.has(id)) return NextResponse.json({ error: `Invalid bout id for meet: ${id}` }, { status: 400 });
  }

  const matsChanged = new Set<number>();
  for (const [matStr, ids] of Object.entries(body.mats)) {
    const mat = Number(matStr);
    for (let i = 0; i < ids.length; i++) {
      const nextOrder = i + 1;
      const current = currentById.get(ids[i]);
      if (current?.mat !== mat || current.order !== nextOrder) {
        matsChanged.add(mat);
        await db.bout.update({ where: { id: ids[i] }, data: { mat, order: nextOrder } });
      }
    }
  }

  if (matsChanged.size > 0) {
    const mats = [...matsChanged].sort((a, b) => a - b);
    const matLabel = mats.length === 1
      ? `mat ${mats[0]}`
      : `mats ${mats.join(", ")}`;
    await logMeetChange(meetId, user.id, `Reordered bouts on ${matLabel}.`);
  }

  return NextResponse.json({ ok: true });
}
