import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export type Role = "ADMIN" | "COACH" | "VIEWER";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("UNAUTHORIZED");
  return { session, userId };
}

export async function requireRole(minRole: Role) {
  const { session, userId } = await requireSession();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } });
  if (!user) throw new Error("UNAUTHORIZED");

  const order: Record<Role, number> = { VIEWER: 0, COACH: 1, ADMIN: 2 };
  if (order[user.role as Role] < order[minRole]) throw new Error("FORBIDDEN");

  return { session, user };
}

export async function requireAdmin() {
  return requireRole("ADMIN");
}
