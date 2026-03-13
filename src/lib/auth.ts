import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { db } from "@/lib/db";

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

type CallbacksType = NonNullable<NextAuthOptions["callbacks"]>;
type SignInCallback = NonNullable<CallbacksType["signIn"]>;
type JwtCallback = NonNullable<CallbacksType["jwt"]>;
type SignInCallbackArgs = Parameters<SignInCallback>[0];
type JwtCallbackArgs = Parameters<JwtCallback>[0];

/**
 * NextAuth configuration for the app.
 *
 * Highlights:
 * - Uses PrismaAdapter with a customized `createUser` to assign a placeholder
 *   username and default role (`PARENT`).
 * - Sessions use JWTs and include `sessionVersion` to allow server-side
 *   invalidation.
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    CredentialsProvider({
      name: "Username + Password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        bypassEmailVerification: { label: "Bypass Email Verification", type: "text" },
      },
      async authorize(credentials) {
        const username = normalizeUsername(credentials?.username ?? "");
        const password = credentials?.password ?? "";
        const bypassEmailVerification = credentials?.bypassEmailVerification === "true";
        const skipEmailVerification = process.env.SKIP_EMAIL_VERIFICATION === "true";

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
            emailVerified: true,
            mustResetPassword: true,
          },
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        const requireEmailVerified = skipEmailVerification ? false : true;
        if (requireEmailVerified && !user.emailVerified && !(process.env.NODE_ENV !== "production" && bypassEmailVerification)) {
          throw new Error("EMAIL_NOT_VERIFIED");
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
    async signIn({ user, account }: SignInCallbackArgs) {
      const needsReset = (user as { mustResetPassword?: boolean }).mustResetPassword ?? false;
      const isCredentials = account?.provider === "credentials";
      if (isCredentials && needsReset) {
        const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const username = (user as { username?: string }).username ?? "";
        const suffix = username ? `?username=${encodeURIComponent(username)}` : "";
        return `${baseUrl}/auth/force-reset${suffix}`;
      }
      const userId = user.id;
      await db.user.updateMany({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
      return true;
    },
    async jwt({ token, user }: JwtCallbackArgs) {
      const hasUser = Boolean(user);
      if (hasUser) {
        const tokenUser = user as {
          id?: string;
          username?: string;
          role?: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
          teamId?: string | null;
          sessionVersion?: number;
          mustResetPassword?: boolean;
        };
        token.id = tokenUser.id;
        token.username = tokenUser.username;
        token.role = tokenUser.role ?? "COACH";
        token.teamId = tokenUser.teamId ?? null;
        token.sessionVersion = tokenUser.sessionVersion ?? 1;
        token.mustResetPassword = tokenUser.mustResetPassword ?? false;
        return token;
      }
      if (token.sessionVersion === undefined && token.id) {
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
