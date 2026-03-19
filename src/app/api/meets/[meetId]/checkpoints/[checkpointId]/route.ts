import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthorizationErrorCode, requireMeetParticipant } from "@/lib/rbac";

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || "checkpoint";
}

export async function GET(req: Request, { params }: { params: Promise<{ meetId: string; checkpointId: string }> }) {
  const { meetId, checkpointId } = await params;
  try {
    await requireMeetParticipant(meetId);
  } catch (error) {
    const code = getAuthorizationErrorCode(error);
    if (code === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (code === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Meet not found" }, { status: 404 });
    }
    throw error;
  }

  const checkpoint = await db.meetCheckpoint.findFirst({
    where: { id: checkpointId, meetId },
    select: { id: true, name: true, createdAt: true, payload: true },
  });
  if (!checkpoint) {
    return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  if (download) {
    const payload = checkpoint.payload as Record<string, unknown> | null;
    const meetName = typeof payload?.meetName === "string" ? payload.meetName : "meet";
    const meetDate = typeof payload?.meetDate === "string" ? payload.meetDate.slice(0, 10) : "checkpoint";
    const safeMeet = sanitizeFilePart(meetName);
    const safeName = sanitizeFilePart(checkpoint.name);
    const filename = `${safeMeet}_${safeName}_${meetDate}.json`;
    return new NextResponse(JSON.stringify(checkpoint.payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json(checkpoint.payload ?? {});
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ meetId: string; checkpointId: string }> }) {
  const { meetId, checkpointId } = await params;
  try {
    await requireMeetParticipant(meetId);
  } catch (error) {
    const code = getAuthorizationErrorCode(error);
    if (code === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (code === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Meet not found" }, { status: 404 });
    }
    throw error;
  }

  const checkpoint = await db.meetCheckpoint.findFirst({
    where: { id: checkpointId, meetId },
    select: { id: true },
  });
  if (!checkpoint) {
    return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
  }

  await db.meetCheckpoint.delete({ where: { id: checkpointId } });

  return NextResponse.json({ ok: true });
}
