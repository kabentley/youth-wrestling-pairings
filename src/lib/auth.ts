import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { db } from "@/lib/db";


function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

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
      },
      async authorize(credentials) {
        const username = normalizeUsername(credentials?.username ?? "");
        const password = credentials?.password ?? "";

        if (!username || !password) return null;

        const user = await db.user.findUnique({ where: { username } });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          username: user.username,
          name: user.name ?? undefined,
          role: user.role,
          teamId: user.teamId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.username = (user as any).username;
        token.role = (user as any).role ?? "COACH";
        token.teamId = (user as any).teamId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user).id = token.id as string | undefined;
        (session.user).username = token.username as string | undefined;
        (session.user).role = (token.role as "ADMIN" | "COACH" | "PARENT" | undefined) ?? "COACH";
        (session.user).teamId = token.teamId as string | null | undefined;
      }
      return session;
    },
  },
};
