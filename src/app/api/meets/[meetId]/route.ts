import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  date: z.string().optional(),
  location: z.string().optional().nullable(),
  homeTeamId: z.string().nullable().optional(),
  numMats: z.number().int().min(1).max(10).optional(),
  allowSameTeamMatches: z.boolean().optional(),
  matchesPerWrestler: z.number().int().min(1).max(5).optional(),
  maxMatchesPerWrestler: z.number().int().min(1).max(5).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  try {
    await requireRole("COACH");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to view this meet." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      homeTeamId: true,
      numMats: true,
      allowSameTeamMatches: true,
      matchesPerWrestler: true,
      maxMatchesPerWrestler: true,
      status: true,
      updatedAt: true,
      updatedBy: { select: { username: true } },
    },
  });
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  return NextResponse.json(meet);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  const body = PatchSchema.parse(await req.json());
  const current = body.name
    ? await db.meet.findUnique({ where: { id: meetId }, select: { name: true } })
    : null;
  const data: {
    name?: string;
    date?: Date;
    location?: string | null;
    homeTeamId?: string | null;
    numMats?: number;
    allowSameTeamMatches?: boolean;
    matchesPerWrestler?: number;
    maxMatchesPerWrestler?: number;
    status?: string;
    updatedById?: string;
  } = { updatedById: user.id };

  if (body.name) data.name = body.name.trim();
  if (body.date) data.date = new Date(body.date);
  if (body.location !== undefined) data.location = body.location?.trim() || null;
  if (body.homeTeamId !== undefined) data.homeTeamId = body.homeTeamId;
  if (body.numMats !== undefined) data.numMats = body.numMats;
  if (body.allowSameTeamMatches !== undefined) data.allowSameTeamMatches = body.allowSameTeamMatches;
  if (body.matchesPerWrestler !== undefined) data.matchesPerWrestler = body.matchesPerWrestler;
  if (body.maxMatchesPerWrestler !== undefined) data.maxMatchesPerWrestler = body.maxMatchesPerWrestler;
  if (body.status) data.status = body.status;

  const updated = await db.meet.update({
    where: { id: meetId },
    data,
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      homeTeamId: true,
      numMats: true,
      allowSameTeamMatches: true,
      matchesPerWrestler: true,
      maxMatchesPerWrestler: true,
      status: true,
      updatedAt: true,
      updatedBy: { select: { username: true } },
    },
  });

  const otherChanges: string[] = [];
  let nameChangeMessage = "";
  if (body.name) {
    const oldName = current?.name ?? "Unnamed";
    const newName = body.name.trim();
    nameChangeMessage = `Update meet name from [${oldName}] to [${newName}].`;
  }
  if (body.date) otherChanges.push("date");
  if (body.location !== undefined) otherChanges.push("location");
  if (body.homeTeamId !== undefined) otherChanges.push("home team");
  if (body.numMats !== undefined) otherChanges.push("mats");
  if (body.allowSameTeamMatches !== undefined) otherChanges.push("same-team matches");
  if (body.matchesPerWrestler !== undefined) otherChanges.push("matches per wrestler");
  if (body.maxMatchesPerWrestler !== undefined) otherChanges.push("max matches per wrestler");
  if (body.status) otherChanges.push(`status set to ${body.status.toLowerCase()}`);
  if (nameChangeMessage || otherChanges.length > 0) {
    const otherMessage = otherChanges.length > 0 ? `Updated ${otherChanges.join(", ")}.` : "";
    const message = nameChangeMessage && otherMessage
      ? `${nameChangeMessage} ${otherMessage}`
      : (nameChangeMessage || otherMessage);
    await logMeetChange(meetId, user.id, message);
  }

  revalidatePath(`/meets/${meetId}`);

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  try {
    await db.meet.delete({ where: { id: meetId } });
  } catch {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  revalidatePath("/meets");

  return NextResponse.json({ ok: true });
}
