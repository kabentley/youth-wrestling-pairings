import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

const BodySchema = z.object({
  username: z.string().trim().min(6).max(32),
  teamId: z.string().trim().optional(),
});

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function PATCH(req: Request) {
  const { userId } = await requireSession();
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }
  const username = normalizeUsername(parsed.data.username);
  const teamId = parsed.data.teamId?.trim();
  if (username.startsWith("oauth-")) {
    return NextResponse.json({ error: "Choose a different username." }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, teamId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (user.role === "ADMIN" && teamId) {
    return NextResponse.json({ error: "Admins cannot be assigned a team." }, { status: 400 });
  }
  if ((user.role === "PARENT" || user.role === "COACH" || user.role === "TABLE_WORKER") && !user.teamId && !teamId) {
    return NextResponse.json({ error: "Select a team." }, { status: 400 });
  }
  if (teamId) {
    const team = await db.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
  }

  const existing = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existing && existing.id !== userId) {
    return NextResponse.json({ error: "Username already taken." }, { status: 409 });
  }

  await db.user.update({
    where: { id: userId },
    data: { username, ...(teamId ? { teamId } : {}) },
  });

  return NextResponse.json({ ok: true });
}
