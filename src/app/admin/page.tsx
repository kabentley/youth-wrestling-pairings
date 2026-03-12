import Link from "next/link";

import { adminStyles } from "./adminStyles";
import type { AdminTabKey } from "./AdminTabs";
import AdminTabs from "./AdminTabs";

import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  searchParams?: Promise<{ tab?: string } | undefined>;
};

export default async function AdminHome({ searchParams }: Props) {
  const showNotifications = process.env.NODE_ENV !== "production";
  try {
    await requireAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UNAUTHORIZED") {
      return (
        <main className="admin">
          <style>{adminStyles}</style>
          <div className="admin-shell">
            <h1 className="admin-title">Admin</h1>
            <div className="admin-card">
              <p>You must sign in.</p>
              <Link href="/auth/signin">Sign in</Link>
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="admin">
        <style>{adminStyles}</style>
        <div className="admin-shell">
          <h1 className="admin-title">Admin</h1>
          <div className="admin-card">
            <p>Access denied.</p>
            <Link href="/rosters">Back</Link>
          </div>
        </div>
      </main>
    );
  }

  const resolvedSearchParams = await searchParams;
  const requestedTab = ((): AdminTabKey => {
    switch (resolvedSearchParams?.tab) {
      case "teams":
      case "league":
      case "pairings":
      case "users":
        return resolvedSearchParams.tab;
      case "notifications":
        return showNotifications ? "notifications" : "users";
      default:
        return "users";
    }
  })();

  return (
    <main className="admin">
      <style>{adminStyles}</style>
      <div className="admin-shell">
        <AdminTabs initialTab={requestedTab} showNotifications={showNotifications} />
      </div>
    </main>
  );
}
