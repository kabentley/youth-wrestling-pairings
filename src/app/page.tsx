import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const league = await db.league.findFirst({ select: { name: true, logoData: true } });
  const trimmedLeagueName = league?.name?.trim();
  const leagueName = trimmedLeagueName ?? "Wrestling Scheduler";
  const hasLeagueLogo = Boolean(league?.logoData);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {hasLeagueLogo ? (
          <img src="/api/league/logo/file" alt="League logo" style={{ width: 64, height: 64, objectFit: "contain" }} />
        ) : null}
        <h1 style={{ margin: 0 }}>{leagueName}</h1>
      </div>
      <p>Schedule dual/quad meets, generate pairings, and organize mats.</p>

      {session ? (
        <>
          <p>Signed in as <b>{session.user?.username}</b></p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/teams">Teams</Link>
            <Link href="/meets">Meets</Link>
            <Link href="/parent">My Children</Link>
            {(session.user as any)?.role === "ADMIN" ? <Link href="/admin">Admin</Link> : null}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/auth/signin">Sign in</Link>
          <Link href="/auth/signup">Create account</Link>
        </div>
      )}
    </main>
  );
}
