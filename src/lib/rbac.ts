import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export type Role = "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("UNAUTHORIZED");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, username: true, teamId: true, sessionVersion: true },
  });
  if (!user) throw new Error("UNAUTHORIZED");
  const tokenVersion = (session?.user as any)?.sessionVersion as number | undefined;
  if (tokenVersion === undefined || tokenVersion !== user.sessionVersion) {
    throw new Error("UNAUTHORIZED");
  }
  return { session, userId, user };
}

export async function requireRole(minRole: Role) {
  const { session, user } = await requireSession();

  const order: Record<Role, number> = { PARENT: 0, TABLE_WORKER: 0, COACH: 1, ADMIN: 2 };
  if (order[user.role as Role] < order[minRole]) throw new Error("FORBIDDEN");

  return { session, user };
}

export async function requireAnyRole(roles: Role[]) {
  const { session, user } = await requireSession();
  if (!roles.includes(user.role as Role)) throw new Error("FORBIDDEN");
  return { session, user };
}

export async function requireAdmin() {
  return requireRole("ADMIN");
}

export async function requireTeamCoach(teamId: string) {
  const { session, user } = await requireRole("COACH");
  if (user.role !== "ADMIN" && user.teamId !== teamId) throw new Error("FORBIDDEN");
  return { session, user };
}
