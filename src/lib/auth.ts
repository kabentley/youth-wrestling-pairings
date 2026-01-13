import crypto from "crypto";

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import FacebookProvider from "next-auth/providers/facebook";
import GoogleProvider from "next-auth/providers/google";

import { db } from "@/lib/db";

const TWO_FACTOR_WINDOW_MS = 10 * 60 * 1000;
const MAX_TWO_FACTOR_SENDS = 5;
const MAX_TWO_FACTOR_ATTEMPTS = 5;


function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

async function generatePlaceholderUsername() {
  for (let i = 0; i < 50; i += 1) {
    const candidate = `oauth-${crypto.randomBytes(4).toString("hex")}`;
    const exists = await db.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `oauth-${crypto.randomBytes(8).toString("hex")}`;
}

const adapter = PrismaAdapter(db);
const authAdapter: Adapter = {
  ...adapter,
  async createUser(data) {
    const username = await generatePlaceholderUsername();
    return db.user.create({
      data: {
        ...data,
        username,
        phone: "",
        role: "PARENT",
      },
    });
  },
};

export const authOptions: NextAuthOptions = {
  adapter: authAdapter,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })]
      : []),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? [AppleProvider({
          clientId: process.env.APPLE_CLIENT_ID,
          clientSecret: process.env.APPLE_CLIENT_SECRET,
        })]
      : []),
    ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
      ? [FacebookProvider({
          clientId: process.env.FACEBOOK_CLIENT_ID,
          clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        })]
      : []),
    CredentialsProvider({
      name: "Username + Password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        twoFactorMethod: { label: "Two Factor Method", type: "text" },
        twoFactorCode: { label: "Two Factor Code", type: "text" },
      },
      async authorize(credentials) {
        const username = normalizeUsername(credentials?.username ?? "");
        const password = credentials?.password ?? "";
        const twoFactorMethod = credentials?.twoFactorMethod ?? "email";
        const twoFactorCode = credentials?.twoFactorCode ?? "";
        const bypassEmailVerification = credentials?.bypassEmailVerification === "true";

        if (!username || !password) return null;

        const user = await db.user.findUnique({
          where: { username },
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            teamId: true,
            sessionVersion: true,
            passwordHash: true,
            email: true,
            phone: true,
            emailVerified: true,
            mustResetPassword: true,
          },
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        if (!user.emailVerified && !(process.env.NODE_ENV !== "production" && bypassEmailVerification)) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        if (user.role === "ADMIN" || user.role === "COACH") {
          if (process.env.NODE_ENV !== "production" && bypassEmailVerification) {
            return {
              id: user.id,
              username: user.username,
              name: user.name ?? undefined,
              role: user.role,
              teamId: user.teamId,
              sessionVersion: user.sessionVersion,
              mustResetPassword: user.mustResetPassword,
            };
          }
          const method = twoFactorMethod === "sms" ? "sms" : "email";
          if (!twoFactorCode) {
            await sendTwoFactorCode(user, method);
            throw new Error("2FA_REQUIRED");
          }
          const verified = await verifyTwoFactorCode(user.id, method, twoFactorCode);
          if (!verified) {
            throw new Error("2FA_INVALID");
          }
        }

        return {
          id: user.id,
          username: user.username,
          name: user.name ?? undefined,
          role: user.role,
          teamId: user.teamId,
          sessionVersion: user.sessionVersion,
          mustResetPassword: user.mustResetPassword,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials" && (user)?.mustResetPassword) {
      return "/auth/force-reset";
      }
      if (user?.id) {
        await db.user.updateMany({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      }
      if (account?.provider && account.provider !== "credentials") {
        if (user?.email) {
          await db.user.updateMany({
            where: { email: user.email.toLowerCase().trim(), emailVerified: null },
            data: { emailVerified: new Date() },
          });
        }
        if (user?.id) {
          const dbUser = await db.user.findUnique({
            where: { id: user.id },
            select: { username: true, role: true, teamId: true },
          });
          if (dbUser?.username.startsWith("oauth-") || ((dbUser?.role === "PARENT" || dbUser?.role === "COACH" || dbUser?.role === "TABLE_WORKER") && !dbUser.teamId)) {
            return "/auth/choose-username";
          }
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user).id;
        token.username = (user).username;
        token.role = (user).role ?? "COACH";
        token.teamId = (user).teamId ?? null;
        token.sessionVersion = (user).sessionVersion ?? 1;
        token.mustResetPassword = (user).mustResetPassword ?? false;
      } else if (token.sessionVersion === undefined && token.id) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: { sessionVersion: true, mustResetPassword: true },
        });
        token.sessionVersion = dbUser?.sessionVersion ?? 1;
        token.mustResetPassword = dbUser?.mustResetPassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user).id = token.id as string | undefined;
        (session.user).username = token.username as string | undefined;
        (session.user).role = (token.role as "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER" | undefined) ?? "COACH";
        (session.user).teamId = token.teamId as string | null | undefined;
        (session.user).sessionVersion = token.sessionVersion as number | undefined;
        (session.user).mustResetPassword = token.mustResetPassword as boolean | undefined;
      }
      return session;
    },
  },
};

async function sendTwoFactorCode(user: { id: string; email: string; phone: string | null }, method: "email" | "sms") {
  if (method === "sms" && !user.phone) {
    throw new Error("PHONE_REQUIRED");
  }
  if (method === "email" && !user.email) {
    throw new Error("EMAIL_REQUIRED");
  }

  const windowStart = new Date(Date.now() - TWO_FACTOR_WINDOW_MS);
  const sentCount = await db.twoFactorCode.count({
    where: { userId: user.id, createdAt: { gt: windowStart } },
  });
  if (sentCount >= MAX_TWO_FACTOR_SENDS) {
    throw new Error("2FA_RATE_LIMITED");
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.twoFactorCode.updateMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });
  await db.twoFactorCode.create({
    data: { userId: user.id, method, codeHash: hash, expiresAt, attempts: 0 },
  });

  if (method === "sms") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`2FA code for ${user.phone}: ${code}`);
        return;
      }
      throw new Error("2FA_DELIVERY_FAILED");
    }
    const twilio = await import("twilio");
    const client = twilio.default(sid, token);
    await client.messages.create({
      to: user.phone!,
      from,
      body: `Your login code is ${code}. It expires in 10 minutes.`,
    });
    return;
  }

  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`2FA code for ${user.email}: ${code}`);
      return;
    }
    throw new Error("2FA_DELIVERY_FAILED");
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(key);
  await sgMail.default.send({
    to: user.email,
    from,
    subject: "Your login code",
    text: `Your login code is ${code}. It expires in 10 minutes.`,
  });
}

async function verifyTwoFactorCode(userId: string, method: "email" | "sms", code: string) {
  const entry = await db.twoFactorCode.findFirst({
    where: { userId, method },
    orderBy: { createdAt: "desc" },
  });
  if (!entry || entry.expiresAt.getTime() < Date.now()) return false;
  if (entry.attempts >= MAX_TWO_FACTOR_ATTEMPTS) return false;

  const hash = crypto.createHash("sha256").update(code).digest("hex");
  if (hash !== entry.codeHash) {
    await db.twoFactorCode.update({
      where: { id: entry.id },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }

  await db.twoFactorCode.deleteMany({ where: { userId } });
  return true;
}
