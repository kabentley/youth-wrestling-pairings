import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { requireAnyRole } from "@/lib/rbac";

export async function POST(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  try {
    const { user } = await requireAnyRole(["COACH", "ADMIN"]);
    const { meetId } = await params;
    const meet = await db.meet.findUnique({
      where: { id: meetId },
      select: { id: true, deletedAt: true },
    });
    if (!meet || meet.deletedAt) {
      return NextResponse.json({ error: "Meet not found." }, { status: 404 });
    }
    await logMeetChange(meet.id, user.id, "Printed wall chart.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Coaches only." }, { status: 403 });
    }
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    throw error;
  }
}
