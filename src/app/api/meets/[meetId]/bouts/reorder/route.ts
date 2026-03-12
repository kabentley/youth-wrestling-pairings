import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  mats: z.record(z.string(), z.array(z.string().min(1))),
  lockedBoutIds: z.array(z.string().min(1)).optional(),
  originalMatByBoutId: z.record(z.string(), z.number().int().nullable()).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id, user.role);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  const body = BodySchema.parse(await req.json());

  const allIds = Object.values(body.mats).flat();
  const found = await db.bout.findMany({
    where: { id: { in: allIds }, meetId },
    select: { id: true, mat: true, order: true, locked: true, originalMat: true },
  });
  const foundSet = new Set(found.map(b => b.id));
  const currentById = new Map(found.map(b => [b.id, { mat: b.mat, order: b.order }]));
  for (const id of allIds) {
    if (!foundSet.has(id)) return NextResponse.json({ error: `Invalid bout id for meet: ${id}` }, { status: 400 });
  }
  const requestedLocked = new Set(body.lockedBoutIds ?? []);
  for (const id of requestedLocked) {
    if (!foundSet.has(id)) return NextResponse.json({ error: `Invalid locked bout id for meet: ${id}` }, { status: 400 });
  }

  const requestedOriginalEntries = Object.entries(body.originalMatByBoutId ?? {});
  for (const [id, originalMat] of requestedOriginalEntries) {
    if (!foundSet.has(id)) return NextResponse.json({ error: `Invalid original mat bout id for meet: ${id}` }, { status: 400 });
    if (originalMat !== null && (originalMat < 1 || originalMat > 6)) {
      return NextResponse.json({ error: `Invalid original mat for bout ${id}: ${originalMat}` }, { status: 400 });
    }
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

  const currentlyLocked = new Set(found.filter(b => b.locked).map(b => b.id));
  const toLock = [...requestedLocked].filter(id => !currentlyLocked.has(id));
  const toUnlock = [...currentlyLocked].filter(id => !requestedLocked.has(id));
  if (toLock.length > 0) {
    await db.bout.updateMany({
      where: { meetId, id: { in: toLock } },
      data: { locked: true },
    });
  }
  if (toUnlock.length > 0) {
    await db.bout.updateMany({
      where: { meetId, id: { in: toUnlock } },
      data: { locked: false },
    });
  }

  const originalMatById = new Map(found.map(b => [b.id, b.originalMat ?? null]));
  const originalMatUpdates = requestedOriginalEntries.filter(([id, originalMat]) => originalMatById.get(id) !== originalMat);
  if (originalMatUpdates.length > 0) {
    for (const [id, originalMat] of originalMatUpdates) {
      await db.bout.update({
        where: { id },
        data: { originalMat },
      });
    }
  }

  const locksChanged = toLock.length + toUnlock.length;
  const startingMatsChanged = originalMatUpdates.length;
  if (matsChanged.size > 0 || locksChanged > 0 || startingMatsChanged > 0) {
    const mats = [...matsChanged].sort((a, b) => a - b);
    const messages: string[] = [];
    if (matsChanged.size > 0) {
      const matLabel = mats.length === 1
        ? `mat ${mats[0]}`
        : `mats ${mats.join(", ")}`;
      messages.push(`Reordered bouts on ${matLabel}.`);
    }
    if (locksChanged > 0) {
      messages.push(`Updated ${locksChanged} bout lock${locksChanged === 1 ? "" : "s"}.`);
    }
    if (messages.length > 0) {
      await logMeetChange(meetId, user.id, messages.join(" "));
    }
  }

  return NextResponse.json({ ok: true });
}
