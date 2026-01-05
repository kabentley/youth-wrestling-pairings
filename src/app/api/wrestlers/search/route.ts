import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { z } from "zod";

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function tokenize(q: string) {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
}

export async function GET(req: Request) {
  await requireSession();
  const url = new URL(req.url);
  const { q, limit } = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
  const tokens = tokenize(q);

  const where =
    tokens.length === 1
      ? {
          active: true,
          OR: [
            { first: { contains: tokens[0], mode: "insensitive" } },
            { last: { contains: tokens[0], mode: "insensitive" } },
          ],
        }
      : {
          active: true,
          AND: tokens.map((t) => ({
            OR: [
              { first: { contains: t, mode: "insensitive" } },
              { last: { contains: t, mode: "insensitive" } },
            ],
          })),
        };

  const wrestlers = await db.wrestler.findMany({
    where,
    take: limit,
    select: {
      id: true,
      guid: true,
      first: true,
      last: true,
      teamId: true,
      birthdate: true,
      active: true,
      team: { select: { name: true, symbol: true, color: true } },
    },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });

  return NextResponse.json(
    wrestlers.map((w) => ({
      id: w.id,
      guid: w.guid,
      first: w.first,
      last: w.last,
      teamId: w.teamId,
      teamName: w.team.name,
      teamSymbol: w.team.symbol,
      teamColor: w.team.color,
      birthdate: w.birthdate,
    })),
  );
}
