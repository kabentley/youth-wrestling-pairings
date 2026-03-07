import { NextResponse } from "next/server";

import { buildReadyForCheckinChecklist } from "@/lib/meetReadyForCheckin";
import { requireRole } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const url = new URL(_req.url);
  const targetParam = url.searchParams.get("target");
  const targetStatus = targetParam === "PUBLISHED" ? "PUBLISHED" : "READY_FOR_CHECKIN";
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

  const checklist = await buildReadyForCheckinChecklist(meetId, undefined, targetStatus);
  if (!checklist) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  return NextResponse.json(checklist);
}
