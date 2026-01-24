import { NextResponse } from "next/server";

import { buildMeetCheckpointPayload } from "@/lib/meetCheckpoints";
import { requireRole } from "@/lib/rbac";

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || "checkpoint";
}

export async function GET(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
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

  const url = new URL(req.url);
  const nameParam = url.searchParams.get("name")?.trim();
  const name = nameParam || `Checkpoint ${new Date().toLocaleString()}`;
  const payload = await buildMeetCheckpointPayload(meetId, name);
  if (!payload) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  const safeMeet = sanitizeFilePart(payload.meetName || "meet");
  const safeName = sanitizeFilePart(name);
  const dateStamp = payload.meetDate.slice(0, 10);
  const filename = `${safeMeet}_${safeName}_${dateStamp}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
