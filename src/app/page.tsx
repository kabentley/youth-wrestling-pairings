import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Wrestling Scheduler</h1>
      <p>Schedule dual/quad meets, generate pairings, and organize mats.</p>

      {session ? (
        <>
          <p>Signed in as <b>{session.user?.username}</b></p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/teams">Teams</Link>
            <Link href="/meets">Meets</Link>
            <Link href="/auth/mfa">MFA Settings</Link>
            {(session.user as any)?.role === "ADMIN" ? <Link href="/admin">Admin</Link> : null}
          </div>
        </>
      ) : (
        <Link href="/auth/signin">Sign in</Link>
      )}
    </main>
  );
}
