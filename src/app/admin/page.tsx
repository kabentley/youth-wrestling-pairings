import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

export default async function AdminHome() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;

  if (!session) {
    return (
      <main className="admin">
        <style>{`
          @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
          :root {
            --bg: #eef1f4;
            --card: #ffffff;
            --ink: #1d232b;
            --muted: #5a6673;
            --accent: #1e88e5;
            --line: #d5dbe2;
          }
          .admin {
            min-height: 100vh;
            background: var(--bg);
            color: var(--ink);
            font-family: "Source Sans 3", Arial, sans-serif;
            padding: 28px 18px 40px;
          }
          .admin-shell {
            max-width: 720px;
            margin: 0 auto;
          }
          .admin-title {
            font-family: "Oswald", Arial, sans-serif;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            margin: 0 0 16px;
          }
          .admin-card {
            background: var(--card);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 20px;
          }
          .admin-card a {
            color: var(--accent);
            text-decoration: none;
            font-weight: 600;
          }
        `}</style>
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
        <style>{`
          @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
          :root {
            --bg: #eef1f4;
            --card: #ffffff;
            --ink: #1d232b;
            --muted: #5a6673;
            --accent: #1e88e5;
            --line: #d5dbe2;
          }
          .admin {
            min-height: 100vh;
            background: var(--bg);
            color: var(--ink);
            font-family: "Source Sans 3", Arial, sans-serif;
            padding: 28px 18px 40px;
          }
          .admin-shell {
            max-width: 720px;
            margin: 0 auto;
          }
          .admin-title {
            font-family: "Oswald", Arial, sans-serif;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            margin: 0 0 16px;
          }
          .admin-card {
            background: var(--card);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 20px;
          }
          .admin-card a {
            color: var(--accent);
            text-decoration: none;
            font-weight: 600;
          }
        `}</style>
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

  redirect("/admin/users");
}
