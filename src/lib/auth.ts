import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    CredentialsProvider({
      name: "Username + Password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        totp: { label: "MFA Code", type: "text" },
      },
      async authorize(credentials) {
        const username = normalizeUsername(credentials?.username ?? "");
        const password = credentials?.password ?? "";
        const totp = (credentials?.totp ?? "").replace(/\s+/g, "");

        if (!username || !password) return null;

        const user = await db.user.findUnique({ where: { username } });
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        if (user.mfaEnabled) {
          if (!user.mfaSecret) return null;
          const verified = speakeasy.totp.verify({
            secret: user.mfaSecret,
            encoding: "base32",
            token: totp,
            window: 1,
          });
          if (!verified) return null;
        }

        return { id: user.id, username: user.username, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
        (session.user as any).username = (user as any).username;
        (session.user as any).mfaEnabled = (user as any).mfaEnabled ?? false;
        (session.user as any).role = (user as any).role ?? "COACH";
        (session.user as any).teamId = (user as any).teamId ?? null;
      }
      return session;
    },
  },
};
