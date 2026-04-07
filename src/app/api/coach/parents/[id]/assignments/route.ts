import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getUserFullName } from "@/lib/userName";

const AssignmentSchema = z.object({
  matNumber: z.number().int().nullable(),
  wrestlerIds: z.array(z.string().min(1)).max(400).default([]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("teamId");
  const body = await req.json().catch(() => null);
  const parsed = AssignmentSchema.safeParse({
    matNumber: body?.matNumber ?? null,
    wrestlerIds: Array.isArray(body?.wrestlerIds) ? body.wrestlerIds : [],
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assignment payload." }, { status: 400 });
  }

  const { user } = await requireRole("COACH");
  const teamId = user.role === "ADMIN" && requestedTeamId
    ? requestedTeamId
    : user.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "You must be assigned a team." }, { status: 403 });
  }
  if (requestedTeamId && user.role !== "ADMIN" && requestedTeamId !== user.teamId) {
    return NextResponse.json({ error: "That team is not assigned to you." }, { status: 403 });
  }

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, teamId: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.teamId !== teamId) {
    return NextResponse.json({ error: "That person is not on your team." }, { status: 403 });
  }
  if (target.role !== "COACH" && target.role !== "TABLE_WORKER" && target.role !== "PARENT") {
    return NextResponse.json(
      { error: "Only coaches, table workers, and parents can receive assignments." },
      { status: 400 },
    );
  }

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, numMats: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const matNumber = target.role === "PARENT" ? null : parsed.data.matNumber;
  if (matNumber !== null && (matNumber < 1 || matNumber > team.numMats)) {
    return NextResponse.json(
      { error: `Mat number must be between 1 and ${team.numMats}.` },
      { status: 400 },
    );
  }

  const wrestlerIds = Array.from(new Set(parsed.data.wrestlerIds));
  if (wrestlerIds.length > 0) {
    const validWrestlers = await db.wrestler.findMany({
      where: { teamId, id: { in: wrestlerIds } },
      select: { id: true },
    });
    if (validWrestlers.length !== wrestlerIds.length) {
      return NextResponse.json(
        { error: "One or more wrestlers are not on this team." },
        { status: 400 },
      );
    }
  }

  const updated = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { staffMatNumber: matNumber },
    });

    if (wrestlerIds.length === 0) {
      await tx.userChild.deleteMany({ where: { userId: id } });
    } else {
      await tx.userChild.deleteMany({
        where: {
          userId: id,
          wrestlerId: { notIn: wrestlerIds },
        },
      });
      await Promise.all(
        wrestlerIds.map((wrestlerId) =>
          tx.userChild.upsert({
            where: { userId_wrestlerId: { userId: id, wrestlerId } },
            create: { userId: id, wrestlerId },
            update: {},
          }),
        ),
      );
    }

    return tx.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        staffMatNumber: true,
        children: {
          select: {
            wrestler: {
              select: {
                id: true,
                first: true,
                last: true,
                teamId: true,
              },
            },
          },
          orderBy: [{ wrestler: { last: "asc" } }, { wrestler: { first: "asc" } }],
        },
      },
    });
  });

  if (!updated) {
    return NextResponse.json({ error: "Unable to load updated assignment." }, { status: 500 });
  }

  const assignedWrestlerIds = updated.children
    .map((link) => link.wrestler)
    .filter((wrestler) => wrestler.teamId === teamId)
    .map((wrestler) => wrestler.id);

  return NextResponse.json({
    updated: {
      id: updated.id,
      username: updated.username,
      name: getUserFullName(updated),
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      matNumber: updated.staffMatNumber ?? null,
      wrestlerIds: assignedWrestlerIds,
    },
  });
}
