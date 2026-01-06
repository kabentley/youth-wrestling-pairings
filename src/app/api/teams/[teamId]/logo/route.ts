import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, teamId: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(user.role === "ADMIN" || (user.role === "COACH" && user.teamId === teamId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await db.team.update({
    where: { id: teamId },
    data: { logoData: bytes, logoType: file.type },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, teamId: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(user.role === "ADMIN" || (user.role === "COACH" && user.teamId === teamId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const team = await db.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  await db.team.update({ where: { id: teamId }, data: { logoData: null, logoType: null } });
  return NextResponse.json({ ok: true });
}
