import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { findInvalidEmailAddresses } from "@/lib/emailAddress";
import { parseEmailWhitelist, serializeEmailWhitelist } from "@/lib/emailDelivery";
import { requireAdmin } from "@/lib/rbac";

const BodySchema = z.object({
  emailDeliveryMode: z.enum(["off", "log", "all", "whitelist"]),
  emailWhitelist: z.string().optional().default(""),
});

export async function GET() {
  await requireAdmin();
  const league = await db.league.findFirst({
    select: {
      emailDeliveryMode: true,
      emailWhitelist: true,
      welcomeEmailTransport: true,
    },
  });
  return NextResponse.json({
    emailDeliveryMode: league?.emailDeliveryMode === "all"
      ? "all"
      : league?.emailDeliveryMode === "log"
        ? "log"
        : league?.emailDeliveryMode === "whitelist"
        ? "whitelist"
        : "off",
    emailWhitelist: parseEmailWhitelist(league?.emailWhitelist ?? "").join("\n"),
  });
}

export async function PUT(req: Request) {
  await requireAdmin();
  const body = BodySchema.parse(await req.json());
  const invalidEmails = findInvalidEmailAddresses(body.emailWhitelist);
  if (invalidEmails.length > 0) {
    return NextResponse.json({
      error: `Invalid email address${invalidEmails.length === 1 ? "" : "es"}: ${invalidEmails.join(", ")}`,
    }, { status: 400 });
  }
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
