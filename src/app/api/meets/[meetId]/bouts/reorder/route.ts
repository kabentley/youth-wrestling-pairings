import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";

const BodySchema = z.object({
  mats: z.record(z.string(), z.array(z.string().min(1))),
});

export async function POST(req: Request, { params }: { params: { meetId: string } }) {
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(params.meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  const body = BodySchema.parse(await req.json());

  const allIds = Object.values(body.mats).flat();
  const found = await db.bout.findMany({
    where: { id: { in: allIds }, meetId: params.meetId },
    select: { id: true },
  });
  const foundSet = new Set(found.map(b => b.id));
  for (const id of allIds) {
    if (!foundSet.has(id)) return NextResponse.json({ error: `Invalid bout id for meet: ${id}` }, { status: 400 });
  }

  for (const [matStr, ids] of Object.entries(body.mats)) {
    const mat = Number(matStr);
    for (let i = 0; i < ids.length; i++) {
      await db.bout.update({ where: { id: ids[i] }, data: { mat, order: i + 1 } });
    }
  }

  return NextResponse.json({ ok: true });
}
