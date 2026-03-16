import { db } from "./db";
import { shouldDeliverEmailTo } from "./emailDelivery";

export type WelcomeEmailResult =
  | { status: "sent"; reason: null }
  | { status: "skipped"; reason: string }
  | { status: "logged"; reason: string };

type SendWelcomeEmailOptions = {
  request: Request;
  email: string;
  username: string;
  tempPassword: string;
  teamLabel?: string | null;
  leagueName?: string | null;
  mustResetPassword?: boolean;
};

type WelcomeEmailContentOptions = {
  username: string;
  tempPassword: string;
  signInUrl: string;
  teamLabel?: string | null;
  mustResetPassword?: boolean;
};

function resolveBaseUrl(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return request.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  }
}

async function resolveLeagueName(explicitLeagueName?: string | null) {
  const trimmedExplicit = explicitLeagueName?.trim();
  if (trimmedExplicit) {
    return trimmedExplicit;
  }
  const league = await db.league.findFirst({
    select: { name: true },
  });
  const leagueName = league?.name?.trim();
  return leagueName && leagueName.length > 0 ? leagueName : "the league";
}

export function buildWelcomeEmailText({
  username,
  tempPassword,
  signInUrl,
  teamLabel,
  mustResetPassword = true,
}: WelcomeEmailContentOptions) {
  const teamLine = teamLabel ? `Team: ${teamLabel}\n` : "";
  const resetLine = mustResetPassword
    ? "You will be prompted to reset your password after signing in."
    : "You can change your password from the Account page after signing in.";
  return `Welcome! Your account has been created.\n\nUsername: ${username}\nTemporary password: ${tempPassword}\n${teamLine}\nSign in here: ${signInUrl}\n${resetLine}`;
}

export function describeWelcomeEmailResult(result: WelcomeEmailResult) {
  if (result.status === "sent") {
    return "Welcome email sent.";
  }
  if (result.status === "logged") {
    return result.reason;
  }
  return `Welcome email skipped: ${result.reason}`;
}

export async function sendWelcomeEmail({
  request,
  email,
  username,
  tempPassword,
  teamLabel = null,
  leagueName,
  mustResetPassword = true,
}: SendWelcomeEmailOptions): Promise<WelcomeEmailResult> {
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  const signInUrl = `${resolveBaseUrl(request)}/auth/signin`;
  const resolvedLeagueName = await resolveLeagueName(leagueName);

  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Temp password for ${email} (${username}): ${tempPassword}`);
      return {
        status: "logged",
        reason: "Welcome email not configured; temporary password logged locally.",
      };
    }
    throw new Error("WELCOME_DELIVERY_FAILED");
  }

  const deliveryDecision = await shouldDeliverEmailTo(email);
  if (!deliveryDecision.allowed) {
    return {
      status: "skipped",
      reason: deliveryDecision.reason ?? "Recipient email is not allowed by the current delivery settings.",
    };
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(key);
  await sgMail.default.send({
    to: email,
    from,
    subject: `Welcome to ${resolvedLeagueName}`,
    text: buildWelcomeEmailText({
      username,
      tempPassword,
      signInUrl,
      teamLabel,
      mustResetPassword,
    }),
  });

  return {
    status: "sent",
    reason: null,
  };
}
