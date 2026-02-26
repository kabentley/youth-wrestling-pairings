import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function tokenize(q: string) {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
}

export async function GET(req: Request) {
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, teamId: true },
  });
  const url = new URL(req.url);
  const { q, limit } = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
  const tokens = tokenize(q);

  if (!user?.teamId) {
    return NextResponse.json({ error: "No team assigned." }, { status: 400 });
  }

  if (tokens.length === 0) {
    return NextResponse.json([]);
  }

  const tokenClauses = tokens.map((token) => {
    const pattern = `%${token.toLowerCase()}%`;
    return Prisma.sql`(LOWER(w."first") LIKE ${pattern} OR LOWER(w."last") LIKE ${pattern})`;
  });
  const nameWhere = Prisma.join(tokenClauses, " AND ");

  const wrestlers = await db.$queryRaw<Array<{
    id: string;
    guid: string;
    first: string;
    last: string;
    teamId: string;
    birthdate: string | Date | null;
    teamName: string;
    teamSymbol: string | null;
    teamColor: string | null;
  }>>(Prisma.sql`
    SELECT
      w."id",
      w."guid",
      w."first",
      w."last",
      w."teamId",
      w."birthdate",
      t."name" AS "teamName",
      t."symbol" AS "teamSymbol",
      t."color" AS "teamColor"
    FROM "Wrestler" w
    INNER JOIN "Team" t ON t."id" = w."teamId"
    WHERE
      w."active" = ${true}
      AND w."teamId" = ${user.teamId}
      AND (${nameWhere})
    ORDER BY w."last" ASC, w."first" ASC
    LIMIT ${limit}
  `);

  return NextResponse.json(
    wrestlers.map((w) => ({
      id: w.id,
      guid: w.guid,
      first: w.first,
      last: w.last,
      teamId: w.teamId,
      teamName: w.teamName,
      teamSymbol: w.teamSymbol ?? undefined,
      teamColor: w.teamColor ?? undefined,
      birthdate: w.birthdate,
    })),
  );
}
