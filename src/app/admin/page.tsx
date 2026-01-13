import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import AdminTabs, { AdminTabKey } from "./AdminTabs";
import { adminStyles } from "./adminStyles";

type Props = {
  searchParams?: { tab?: string };
};

export default async function AdminHome({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;

  if (!session) {
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

  if (role !== "ADMIN") {
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

  const requestedTab = (searchParams?.tab === "league" ? "league" : "users") as AdminTabKey;

  return (
    <main className="admin">
      <style>{adminStyles}</style>
      <div className="admin-shell">
        <AdminTabs initialTab={requestedTab} />
      </div>
    </main>
  );
}
