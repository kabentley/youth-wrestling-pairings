import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isValidEmailAddress, normalizeEmailAddress } from "@/lib/emailAddress";
import { sendAdminTestEmail } from "@/lib/notifications";
import { requireAdmin } from "@/lib/rbac";

export async function POST(request: Request) {
  if (request.headers.get("content-type") !== "application/json") {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
  }

  const { user } = await requireAdmin();
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  const recipient = normalizeEmailAddress(account?.email);
  if (!recipient || !isValidEmailAddress(recipient)) {
    return NextResponse.json({ error: "Add a valid email address to your admin account first." }, { status: 400 });
  }

  const result = await sendAdminTestEmail(user.id, recipient);
  if (result.status === "SENT") {
    return NextResponse.json({ message: `SendGrid accepted the test email to ${recipient}. Check your inbox to confirm delivery.` });
  }
  if (result.status === "LOGGED") {
    return NextResponse.json({ message: "App email delivery is set to Log. No test email was sent." });
  }
  return NextResponse.json(
    { error: result.errorMessage ?? "The test email could not be sent." },
    { status: result.status === "SKIPPED" ? 409 : 502 },
  );
}
