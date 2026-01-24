import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { buildMeetCheckpointPayload, buildTeamSignature } from "@/lib/meetCheckpoints";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  name: z.string().min(1).max(80),
});

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  try {
    await requireRole("COACH");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
    }
    throw error;
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { deletedAt: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  const checkpoints = await db.meetCheckpoint.findMany({
    where: { meetId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      createdBy: { select: { username: true } },
    },
  });

  return NextResponse.json(checkpoints);
}

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");

  const body = BodySchema.parse(await req.json());
  const trimmedName = body.name.trim();
  if (!trimmedName) {
    return NextResponse.json({ error: "Checkpoint name required." }, { status: 400 });
  }

  const payload = await buildMeetCheckpointPayload(meetId, trimmedName);
  if (!payload) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  const checkpoint = await db.meetCheckpoint.create({
    data: {
      meetId,
      name: trimmedName,
      payload,
      teamSignature: buildTeamSignature(payload.teamIds),
      createdById: user.id,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      createdBy: { select: { username: true } },
    },
  });

  await logMeetChange(meetId, user.id, `Saved checkpoint: ${trimmedName}.`);

  return NextResponse.json(checkpoint);
}
