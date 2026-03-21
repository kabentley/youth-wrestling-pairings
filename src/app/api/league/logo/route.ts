import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_BYTES, normalizeLogoUpload } from "@/lib/logoUpload";
import { requireAdmin } from "@/lib/rbac";

export async function POST(req: Request) {
  await requireAdmin();
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
  const existing = await db.league.findFirst({ select: { id: true } });

  if (!existing) {
    await db.league.create({
      data: { logoData: bytes, logoType: "image/jpeg" },
    });
  } else {
    await db.league.update({
      where: { id: existing.id },
      data: { logoData: bytes, logoType: "image/jpeg" },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await requireAdmin();
  const existing = await db.league.findFirst({ select: { id: true } });
  if (!existing) return NextResponse.json({ ok: true });

  await db.league.update({
    where: { id: existing.id },
    data: { logoData: null, logoType: null },
  });

  return NextResponse.json({ ok: true });
}
