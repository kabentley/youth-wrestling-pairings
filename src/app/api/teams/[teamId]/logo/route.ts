import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_BYTES, normalizeLogoUpload } from "@/lib/logoUpload";
import { requireSession } from "@/lib/rbac";

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, teamId: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, headCoachId: true },
  });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const canEdit = user.role === "ADMIN" || (user.role === "COACH" && user.teamId === teamId && team.headCoachId === user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await normalizeLogoUpload(file);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_IMAGE") {
      return NextResponse.json({ error: "Unable to process image." }, { status: 400 });
    }
    throw error;
  }
  await db.team.update({
    where: { id: teamId },
    data: { logoData: bytes, logoType: "image/jpeg" },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, teamId: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, headCoachId: true },
  });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const canEdit = user.role === "ADMIN" || (user.role === "COACH" && user.teamId === teamId && team.headCoachId === user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.team.update({ where: { id: teamId }, data: { logoData: null, logoType: null } });
  return NextResponse.json({ ok: true });
}
