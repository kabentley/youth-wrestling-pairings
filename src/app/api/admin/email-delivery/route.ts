import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { parseEmailWhitelist, serializeEmailWhitelist } from "@/lib/emailDelivery";
import { requireAdmin } from "@/lib/rbac";

const BodySchema = z.object({
  emailDeliveryMode: z.enum(["off", "all", "whitelist"]),
  emailWhitelist: z.string().optional().default(""),
});

export async function GET() {
  await requireAdmin();
  const league = await db.league.findFirst({
    select: {
      emailDeliveryMode: true,
      emailWhitelist: true,
    },
  });
  return NextResponse.json({
    emailDeliveryMode: league?.emailDeliveryMode === "all"
      ? "all"
      : league?.emailDeliveryMode === "whitelist"
        ? "whitelist"
        : "off",
    emailWhitelist: parseEmailWhitelist(league?.emailWhitelist ?? "").join("\n"),
  });
}

export async function PUT(req: Request) {
  await requireAdmin();
  const body = BodySchema.parse(await req.json());
  const existing = await db.league.findFirst({ select: { id: true } });
  const data = {
    emailDeliveryMode: body.emailDeliveryMode,
    emailWhitelist: serializeEmailWhitelist(parseEmailWhitelist(body.emailWhitelist)),
  };
  if (!existing) {
    await db.league.create({ data });
  } else {
    await db.league.update({
      where: { id: existing.id },
      data,
    });
  }
  return NextResponse.json({ ok: true });
}
