import Link from "next/link";

import { adminStyles } from "./adminStyles";
import type { AdminTabKey } from "./AdminTabs";
import AdminTabs from "./AdminTabs";

import { requireAdmin } from "@/lib/rbac";


type Props = {
  searchParams?: Promise<{ tab?: string } | undefined>;
};

export default async function AdminHome({ searchParams }: Props) {
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
  const requestedTab = (resolvedSearchParams?.tab === "league" ? "league" : "users") as AdminTabKey;

  return (
    <main className="admin">
      <style>{adminStyles}</style>
      <div className="admin-shell">
        <AdminTabs initialTab={requestedTab} />
      </div>
    </main>
  );
}
