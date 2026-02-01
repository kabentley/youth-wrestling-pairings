import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";


import { db } from "@/lib/db";
import { requireTeamCoach } from "@/lib/rbac";

const BodySchema = z.object({
  first: z.string().trim().min(1).optional(),
  last: z.string().trim().min(1).optional(),
  birthdate: z.string().min(1).regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weight: z.number().positive().optional(),
  experienceYears: z.number().int().min(0).optional(),
  skill: z.number().int().min(0).max(5).optional(),
  isGirl: z.boolean().optional(),
  active: z.boolean().optional(),
});

const formatZodIssues = (issues: z.ZodIssue[]) =>
  issues
    .map(issue => {
      const path = issue.path.map(segment => String(segment)).filter(Boolean).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join(" ");

export async function PATCH(req: Request, { params }: { params: Promise<{ teamId: string; wrestlerId: string }> }) {
  const { teamId, wrestlerId } = await params;
  await requireTeamCoach(teamId);
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodIssues(parsed.error.issues) || "Invalid wrestler updates." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const wrestler = await db.wrestler.findUnique({
    where: { id: wrestlerId },
    select: { id: true, teamId: true },
  });
  if (wrestler?.teamId !== teamId) {
    return NextResponse.json({ error: "Wrestler not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.first) updates.first = body.first;
  if (body.last) updates.last = body.last;
  if (body.birthdate) updates.birthdate = new Date(body.birthdate);
  if (body.weight !== undefined) updates.weight = body.weight;
  if (body.experienceYears !== undefined) updates.experienceYears = body.experienceYears;
  if (body.skill !== undefined) updates.skill = body.skill;
  if (body.isGirl !== undefined) updates.isGirl = body.isGirl;
  if (body.active !== undefined) updates.active = body.active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  try {
    await db.wrestler.update({
      where: { id: wrestlerId },
      data: updates,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Another wrestler on this team already uses that name and birthday." },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ teamId: string; wrestlerId: string }> }) {
  const { teamId, wrestlerId } = await params;
  await requireTeamCoach(teamId);
  const wrestler = await db.wrestler.findUnique({
    where: { id: wrestlerId },
    select: { id: true, teamId: true },
  });
  if (wrestler?.teamId !== teamId) {
    return NextResponse.json({ error: "Wrestler not found" }, { status: 404 });
  }
  await db.$transaction([
    db.bout.deleteMany({
      where: {
        OR: [{ redId: wrestlerId }, { greenId: wrestlerId }],
      },
    }),
    db.wrestler.delete({ where: { id: wrestlerId } }),
  ]);
  return NextResponse.json({ ok: true });
}
