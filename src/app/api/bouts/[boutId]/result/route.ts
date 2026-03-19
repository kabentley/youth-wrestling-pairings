import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAnyRole } from "@/lib/rbac";
import { normalizeSavedResult, validateBoutResult } from "@/lib/resultEntry";

const BodySchema = z.object({
  winnerId: z.string().nullable().optional(), // null to clear
  type: z.string().trim().min(1).max(20).nullable().optional(),
  score: z.string().trim().min(1).max(20).nullable().optional(),
  period: z.number().int().min(1).max(6).nullable().optional(),
  time: z.string().trim().min(1).max(10).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ boutId: string }> }) {
  const { boutId } = await params;
  let user: Awaited<ReturnType<typeof requireAnyRole>>["user"];
  try {
    ({ user } = await requireAnyRole(["COACH", "TABLE_WORKER", "ADMIN"]));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to enter results." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const editorTeam = user.teamId
    ? await db.team.findUnique({
      where: { id: user.teamId },
      select: { color: true },
    })
    : null;

  const body = BodySchema.parse(await req.json());

  const bout = await db.bout.findUnique({
    where: { id: boutId },
    select: {
      id: true,
      meetId: true,
      redId: true,
      greenId: true,
      meet: {
        select: {
          resultsCompletedAt: true,
        },
      },
    },
  });
  if (!bout) return NextResponse.json({ error: "Bout not found" }, { status: 404 });
  if (bout.meet.resultsCompletedAt) {
    return NextResponse.json({ error: "Results have been marked complete and are now read-only." }, { status: 409 });
  }
  if (user.role === "COACH" || user.role === "TABLE_WORKER") {
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned." }, { status: 403 });
    }
    const teamRows = await db.meetTeam.findMany({
      where: { meetId: bout.meetId },
      select: { teamId: true },
    });
    const teamIds = new Set(teamRows.map(t => t.teamId));
    if (!teamIds.has(user.teamId)) {
      return NextResponse.json({ error: "You are not authorized to enter results for this meet." }, { status: 403 });
    }
  }

  const absent = await db.meetWrestlerStatus.findMany({
    where: { meetId: bout.meetId, status: { in: ["NOT_COMING"] } },
    select: { wrestlerId: true },
  });
  const absentIds = new Set(absent.map(a => a.wrestlerId));
  if (absentIds.has(bout.redId) || absentIds.has(bout.greenId)) {
    return NextResponse.json({ error: "Cannot record results for a bout with a not-attending wrestler" }, { status: 400 });
  }

  // Validate winnerId (must be red or green if provided)
  const winnerId = body.winnerId;
  if (winnerId != null) {
    if (winnerId !== bout.redId && winnerId !== bout.greenId) {
      return NextResponse.json({ error: "winnerId must be one of the bout wrestlers" }, { status: 400 });
    }
  }

  const validated = validateBoutResult({
    winnerId: body.winnerId,
    type: body.type,
    score: body.score,
    period: body.period,
    time: body.time,
    notes: body.notes,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const normalized = normalizeSavedResult(validated.value);

  const data: {
    resultWinnerId?: string | null;
    resultType?: string | null;
    resultScore?: string | null;
    resultPeriod?: number | null;
    resultTime?: string | null;
    resultNotes?: string | null;
    resultUpdatedBy?: string | null;
    resultAt: Date | null;
  } = {
    resultUpdatedBy: normalized.winnerId ? user.username : null,
    resultAt: normalized.winnerId ? new Date() : null,
  };

  data.resultWinnerId = normalized.winnerId;
  data.resultType = normalized.type;
  data.resultScore = normalized.score;
  data.resultPeriod = normalized.period;
  data.resultTime = normalized.time;
  data.resultNotes = normalized.notes;

  const updated = await db.bout.update({
    where: { id: boutId },
    data,
    select: {
      id: true,
      resultWinnerId: true,
      resultType: true,
      resultScore: true,
      resultPeriod: true,
      resultTime: true,
      resultNotes: true,
      resultUpdatedBy: true,
      resultAt: true,
    },
  });

  return NextResponse.json({
    ...updated,
    resultUpdatedByColor: editorTeam?.color.trim() ?? null,
  });
}
