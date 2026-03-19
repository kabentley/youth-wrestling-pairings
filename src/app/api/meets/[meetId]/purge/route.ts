import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthorizationErrorCode, requireMeetParticipant } from "@/lib/rbac";

export async function DELETE(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let access: Awaited<ReturnType<typeof requireMeetParticipant>>;
  try {
    access = await requireMeetParticipant(meetId, { allowDeleted: true });
  } catch (error) {
    const code = getAuthorizationErrorCode(error);
    if (code === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (code === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to purge this meet." }, { status: 403 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Meet not found" }, { status: 404 });
    }
    throw error;
  }

  if (!access.meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  const canPurge = access.user.role === "ADMIN" || access.isCoordinator;
  if (!canPurge) {
    return NextResponse.json({ error: "Only the Meet Coordinator or an admin can purge this meet." }, { status: 403 });
  }

  await db.meet.delete({ where: { id: meetId } });
  revalidatePath("/meets");

  return NextResponse.json({ ok: true });
}
