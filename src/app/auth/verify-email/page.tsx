import Link from "next/link";

import { db } from "@/lib/db";

export default async function VerifyEmailPage({ searchParams }: { searchParams: { token?: string; email?: string } }) {
  const token = searchParams.token ?? "";
  const email = searchParams.email ?? "";

  let message = "Verification link is invalid or expired.";
  if (token && email) {
    const record = await db.verificationToken.findUnique({
      where: { identifier_token: { identifier: email, token } },
    });
    if (record && record.expires > new Date()) {
      await db.user.updateMany({
        where: { email: email.toLowerCase().trim() },
        data: { emailVerified: new Date() },
      });
      await db.verificationToken.deleteMany({ where: { identifier: email } });
      message = "Email verified. You can sign in now.";
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 640 }}>
      <h2>Verify Email</h2>
      <p>{message}</p>
      <Link href="/auth/signin">Back to sign in</Link>
    </main>
  );
}
