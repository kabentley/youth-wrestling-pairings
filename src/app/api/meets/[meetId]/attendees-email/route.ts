import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { countMeetAttendeeMessageRecipients, notifyMeetAttendeesMessage } from "@/lib/notifications";
import { requireRole } from "@/lib/rbac";

const SendMeetAttendeesEmailSchema = z.object({
  audience: z.enum(["attending", "roster"]).default("attending"),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

const PreviewQuerySchema = z.object({
  audience: z.enum(["attending", "roster"]).default("attending"),
});

async function requireMeetCoordinatorOrAdmin(meetId: string) {
  const { user } = await requireRole("COACH");
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      deletedAt: true,
      homeTeam: {
        select: {
          headCoachId: true,
        },
      },
    },
  });

  if (!meet || meet.deletedAt) {
    return { error: NextResponse.json({ error: "Meet not found" }, { status: 404 }) };
  }

  const isCoordinator = Boolean(meet.homeTeam?.headCoachId) && meet.homeTeam?.headCoachId === user.id;
  if (user.role !== "ADMIN" && !isCoordinator) {
    return {
      error: NextResponse.json(
        { error: "Only the Meet Coordinator or an admin can email meet attendees." },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export async function GET(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const authorization = await requireMeetCoordinatorOrAdmin(meetId);
  if ("error" in authorization) return authorization.error;

  const { searchParams } = new URL(req.url);
  const parsed = PreviewQuerySchema.parse({
    audience: searchParams.get("audience") ?? "attending",
  });
  const recipients = await countMeetAttendeeMessageRecipients(meetId, parsed.audience);
  return NextResponse.json({ recipients });
}

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const authorization = await requireMeetCoordinatorOrAdmin(meetId);
  if ("error" in authorization) return authorization.error;
  const { user } = authorization;
  const body = SendMeetAttendeesEmailSchema.parse(await req.json());

  const summary = await notifyMeetAttendeesMessage(meetId, {
    audience: body.audience,
    subject: body.subject,
    body: body.body,
  });

  const details = [
    `recipients ${summary.recipients}`,
    `attempted ${summary.attempted}`,
    `successful ${summary.successful}`,
  ];
  if (summary.failed > 0) details.push(`failed ${summary.failed}`);
  if (summary.skipped > 0) details.push(`skipped ${summary.skipped}`);
  details.push(`transport ${summary.transport}`);
  await logMeetChange(
    meetId,
    user.id,
    `Processed attendee email "${body.subject}" to ${body.audience === "roster" ? "everyone on roster" : "parents of attending wrestlers"}: ${details.join(", ")}.`,
  );

  return NextResponse.json(summary);
}
