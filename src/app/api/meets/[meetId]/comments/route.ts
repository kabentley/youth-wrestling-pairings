import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({
  body: z.string().min(1).max(2000),
  section: z.string().trim().max(120).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  await requireRole("COACH");
  const comments = await db.meetComment.findMany({
    where: { meetId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { username: true } } },
    take: 100,
  });
  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  const body = BodySchema.parse(await req.json());

  const comment = await db.meetComment.create({
    data: {
      meetId,
      authorId: user.id,
      body: body.body.trim(),
      section: body.section?.trim() || null,
    },
    include: { author: { select: { username: true } } },
  });

  await logMeetChange(meetId, user.id, "Added a comment.");
  return NextResponse.json(comment);
}
