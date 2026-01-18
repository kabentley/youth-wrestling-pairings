import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Application roles used by RBAC helpers.
 *
 * Notes:
 * - `TABLE_WORKER` is treated as a "parent-level" role for authorization ordering.
 * - Authorization checks in API routes should rely on these helpers rather than
 *   re-implementing role logic.
 */
export type Role = "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";

/**
 * Loads the NextAuth session and verifies the user exists and token is current.
 *
 * Throws:
 * - `UNAUTHORIZED` if no session, user missing, or sessionVersion mismatch.
 */
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

/**
 * Requires the current user to have at least `minRole`.
 *
 * Throws:
 * - `UNAUTHORIZED` if no valid session.
 * - `FORBIDDEN` if role is insufficient.
 */
export async function requireRole(minRole: Role) {
  const { session, user } = await requireSession();

  const order: Record<Role, number> = { PARENT: 0, TABLE_WORKER: 0, COACH: 1, ADMIN: 2 };
  if (order[user.role as Role] < order[minRole]) throw new Error("FORBIDDEN");

  return { session, user };
}

/**
 * Requires the current user to be one of the allowed roles.
 *
 * Throws:
 * - `UNAUTHORIZED` if no valid session.
 * - `FORBIDDEN` if role is not in the allowed set.
 */
export async function requireAnyRole(roles: Role[]) {
  const { session, user } = await requireSession();
  if (!roles.includes(user.role as Role)) throw new Error("FORBIDDEN");
  return { session, user };
}

/** Convenience helper for admin-only routes. */
export async function requireAdmin() {
  return requireRole("ADMIN");
}

/**
 * Requires a coach (or admin) for a specific team.
 *
 * Coaches are scoped to their own team; admins can act on any team.
 */
export async function requireTeamCoach(teamId: string) {
  const { session, user } = await requireRole("COACH");
  if (user.role !== "ADMIN" && user.teamId !== teamId) throw new Error("FORBIDDEN");
  return { session, user };
}
