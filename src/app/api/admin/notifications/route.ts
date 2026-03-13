import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const NotificationEventSchema = z.enum([
  "meet_ready_for_attendance",
]);
const NotificationStatusSchema = z.enum(["SKIPPED", "LOGGED", "SENT", "FAILED"]);

type SearchNotificationRow = {
  id: string;
  event: string;
  channel: string;
  status: z.infer<typeof NotificationStatusSchema>;
  recipient: string;
  subject: string | null;
  message: string;
  provider: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  dedupeKey: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  meet: {
    id: string;
    name: string;
    date: Date;
  } | null;
  user: {
    id: string;
    username: string;
    name: string | null;
  } | null;
};

function normalizeSearchText(value: string) {
  return value.toLowerCase();
}

function formatMeetSearchText(row: SearchNotificationRow) {
  const meetName = row.meet?.name ?? "";
  const username = row.user?.username ?? "";
  const userName = row.user?.name ?? "";
  return normalizeSearchText([
    row.recipient,
    row.subject ?? "",
    row.message,
    row.provider ?? "",
    row.errorMessage ?? "",
    row.dedupeKey ?? "",
    meetName,
    username,
    userName,
  ].join(" "));
}

export async function GET(req: Request) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const querySchema = z.object({
    q: z.string().trim().optional().default(""),
    meetId: z.string().trim().optional().default(""),
    event: z.union([z.literal(""), NotificationEventSchema]).optional().default(""),
    status: z.union([z.literal(""), NotificationStatusSchema]).optional().default(""),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(10).max(200).default(25),
  });
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    meetId: searchParams.get("meetId") ?? "",
    event: searchParams.get("event") ?? "",
    status: searchParams.get("status") ?? "",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "25",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }

  const { q, meetId, event, status, page, pageSize } = parsed.data;
  const where = {
    ...(meetId ? { meetId } : {}),
    ...(event ? { event } : {}),
    ...(status ? { status } : {}),
  };

  const [allLogs, meetOptions] = await Promise.all([
    db.notificationLog.findMany({
      where,
      select: {
        id: true,
        event: true,
        channel: true,
        status: true,
        recipient: true,
        subject: true,
        message: true,
        provider: true,
        providerMessageId: true,
        errorMessage: true,
        dedupeKey: true,
        createdAt: true,
        deliveredAt: true,
        meet: {
          select: {
            id: true,
            name: true,
            date: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 1000,
    }) as Promise<SearchNotificationRow[]>,
    db.meet.findMany({
      where: {
        deletedAt: null,
        notificationLogs: {
          some: {},
        },
      },
      select: {
        id: true,
        name: true,
        date: true,
      },
      orderBy: [{ date: "desc" }, { name: "asc" }],
      take: 200,
    }),
  ]);

  const normalizedQuery = normalizeSearchText(q);
  const filtered = normalizedQuery
    ? allLogs.filter((row) => formatMeetSearchText(row).includes(normalizedQuery))
    : allLogs;

  const total = filtered.length;
  const pageStart = (page - 1) * pageSize;
  const items = filtered.slice(pageStart, pageStart + pageSize);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    meetOptions: meetOptions.map((meet) => ({
      id: meet.id,
      name: meet.name,
      date: meet.date.toISOString(),
    })),
  });
}
