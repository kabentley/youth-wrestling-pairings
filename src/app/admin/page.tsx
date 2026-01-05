import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

export default async function AdminHome() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;

  if (!session) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2>Admin</h2>
        <p>You must sign in.</p>
        <Link href="/auth/signin">Sign in</Link>
      </main>
    );
  }

  if (role !== "ADMIN") {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2>Admin</h2>
        <p>Access denied.</p>
        <Link href="/teams">Back</Link>
      </main>
    );
  }

  redirect("/admin/league");
}
