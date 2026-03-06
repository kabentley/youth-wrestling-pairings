import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { buildMeetCheckpointPayload, buildTeamSignature } from "@/lib/meetCheckpoints";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  date: z.string().optional(),
  location: z.string().optional().nullable(),
  homeTeamId: z.string().nullable().optional(),
  numMats: z.number().int().min(1).max(6).optional(),
  allowSameTeamMatches: z.boolean().optional(),
  girlsWrestleGirls: z.boolean().optional(),
  matchesPerWrestler: z.number().int().min(1).max(5).optional(),
  maxMatchesPerWrestler: z.number().int().min(1).max(5).optional(),
  restGap: z.number().int().min(0).max(20).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

function normalizeNullableString(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function buildAutoPublishCheckpointName(now: Date) {
  const stamp = now.toISOString().replace("T", " ").slice(0, 16);
  return `Published ${stamp} UTC`;
}

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
      girlsWrestleGirls: true,
      matchesPerWrestler: true,
      maxMatchesPerWrestler: true,
      restGap: true,
      status: true,
      updatedAt: true,
      deletedAt: true,
      updatedBy: { select: { username: true } },
    },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  const lastChange = await db.meetChange.findFirst({
    where: { meetId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, actor: { select: { username: true } } },
  });
  const lastChangeAt = lastChange ? lastChange.createdAt : null;
  const lastChangeBy = lastChange?.actor ? lastChange.actor.username : null;
  return NextResponse.json({
    ...meet,
    lastChangeAt,
    lastChangeBy,
  });
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
  if (body.homeTeamId !== undefined && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can change the home team." }, { status: 403 });
  }
  if (body.homeTeamId === null) {
    return NextResponse.json({ error: "Meet must have a home team." }, { status: 400 });
  }
  const current = await db.meet.findUnique({
    where: { id: meetId },
    select: { name: true, status: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  const data: {
    name?: string;
    date?: Date;
    location?: string | null;
    homeTeamId?: string | null;
    numMats?: number;
    allowSameTeamMatches?: boolean;
    girlsWrestleGirls?: boolean;
    matchesPerWrestler?: number;
    maxMatchesPerWrestler?: number;
    restGap?: number;
    status?: string;
    updatedById?: string;
  } = { updatedById: user.id };

  if (body.name) data.name = body.name.trim();
  if (body.date) data.date = new Date(body.date);
  if (body.location !== undefined) data.location = normalizeNullableString(body.location);
  if (body.homeTeamId !== undefined) data.homeTeamId = body.homeTeamId;
  if (body.numMats !== undefined) data.numMats = body.numMats;
  if (body.allowSameTeamMatches !== undefined) data.allowSameTeamMatches = body.allowSameTeamMatches;
  if (body.girlsWrestleGirls !== undefined) data.girlsWrestleGirls = body.girlsWrestleGirls;
  if (body.matchesPerWrestler !== undefined) data.matchesPerWrestler = body.matchesPerWrestler;
  if (body.maxMatchesPerWrestler !== undefined) data.maxMatchesPerWrestler = body.maxMatchesPerWrestler;
  if (body.restGap !== undefined) data.restGap = body.restGap;
  if (body.status) data.status = body.status;

  const now = new Date();
  const autoPublishCheckpointName = buildAutoPublishCheckpointName(now);
  const updated = await db.$transaction(async (tx) => {
    const updatedMeet = await tx.meet.update({
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
        girlsWrestleGirls: true,
        matchesPerWrestler: true,
        maxMatchesPerWrestler: true,
        restGap: true,
        status: true,
        updatedAt: true,
        updatedBy: { select: { username: true } },
      },
    });

    const transitionedToPublished =
      body.status === "PUBLISHED" && current.status !== "PUBLISHED" && updatedMeet.status === "PUBLISHED";

    if (transitionedToPublished) {
      const payload = await buildMeetCheckpointPayload(meetId, autoPublishCheckpointName, tx);
      if (!payload) {
        throw new Error("Meet not found");
      }
      await tx.meetCheckpoint.create({
        data: {
          meetId,
          name: autoPublishCheckpointName,
          payload,
          teamSignature: buildTeamSignature(payload.teamIds),
          createdById: user.id,
        },
      });
    }

    return updatedMeet;
  });

  const otherChanges: string[] = [];
  let nameChangeMessage = "";
  if (body.name) {
    const oldName = current.name;
    const newName = body.name.trim();
    nameChangeMessage = `Update meet name from [${oldName}] to [${newName}].`;
  }
  if (body.date) otherChanges.push("date");
  if (body.location !== undefined) otherChanges.push("location");
  if (body.homeTeamId !== undefined) otherChanges.push("home team");
  if (body.numMats !== undefined) otherChanges.push("mats");
  if (body.allowSameTeamMatches !== undefined) otherChanges.push("same-team matches");
  if (body.girlsWrestleGirls !== undefined) otherChanges.push("girls wrestle girls");
  if (body.matchesPerWrestler !== undefined) otherChanges.push("matches per wrestler");
  if (body.maxMatchesPerWrestler !== undefined) otherChanges.push("max matches per wrestler");
  if (body.restGap !== undefined) otherChanges.push("rest gap");
  if (body.status) otherChanges.push(`status set to ${body.status.toLowerCase()}`);
  if (nameChangeMessage || otherChanges.length > 0) {
    const otherMessage = otherChanges.length > 0 ? `Updated ${otherChanges.join(", ")}.` : "";
    const message = nameChangeMessage && otherMessage
      ? `${nameChangeMessage} ${otherMessage}`
      : (nameChangeMessage || otherMessage);
    await logMeetChange(meetId, user.id, message);
  }
  if (body.status === "PUBLISHED" && current.status !== "PUBLISHED" && updated.status === "PUBLISHED") {
    await logMeetChange(
      meetId,
      user.id,
      `Saved checkpoint automatically on publish: ${autoPublishCheckpointName}.`,
    );
  }

  revalidatePath(`/meets/${meetId}`);

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const now = new Date();
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      lockedById: true,
      lockExpiresAt: true,
      lockedBy: { select: { username: true } },
      deletedAt: true,
    },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  if (meet.lockExpiresAt && meet.lockExpiresAt < now) {
    await db.meet.update({
      where: { id: meetId },
      data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
    });
  } else if (meet.lockedById && !meet.lockExpiresAt) {
    await db.meet.update({
      where: { id: meetId },
      data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
    });
  } else if (meet.lockedById && meet.lockedById !== user.id) {
    return NextResponse.json(
      {
        error: "Meet is locked",
        lockedByUsername: meet.lockedBy ? meet.lockedBy.username : "another user",
        lockExpiresAt: meet.lockExpiresAt ?? null,
      },
      { status: 409 },
    );
  }

  await db.meet.update({
    where: { id: meetId },
    data: {
      deletedAt: now,
      deletedById: user.id,
      lockedById: null,
      lockedAt: null,
      lockExpiresAt: null,
      updatedById: user.id,
    },
  });

  revalidatePath("/meets");
  revalidatePath(`/meets/${meetId}`);

  return NextResponse.json({ ok: true });
}
