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

  const league = await db.league.findFirst({ select: { name: true, logoData: true } });
  const leagueName = league?.name?.trim() ?? "Wrestling Scheduler";
  const hasLogo = Boolean(league?.logoData);

  return (
    <main className="auth">
      <style>{authStyles}</style>
      <div className="auth-shell">
        <div className="auth-brand">
          {hasLogo && <img className="auth-logo" src="/api/league/logo/file" alt="League logo" />}
          <h1 className="auth-title">{leagueName}</h1>
        </div>
        <div className="auth-card">
          <h2>Verify Email</h2>
          <p className="auth-muted">{message}</p>
          <Link className="auth-link" href="/auth/signin">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}

const authStyles = `
  @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
  :root {
    --bg: #eef1f4;
    --card: #ffffff;
    --ink: #1d232b;
    --muted: #5a6673;
    --accent: #1e88e5;
    --line: #d5dbe2;
  }
  .auth {
    min-height: 100vh;
    background: var(--bg);
    color: var(--ink);
    font-family: "Source Sans 3", Arial, sans-serif;
    padding: 28px 18px 40px;
  }
  .auth-shell {
    max-width: 520px;
    margin: 0 auto;
  }
  .auth-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }
  .auth-logo {
    width: 44px;
    height: 44px;
    object-fit: contain;
  }
  .auth-title {
    margin: 0;
    font-family: "Oswald", Arial, sans-serif;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    font-size: clamp(22px, 3vw, 30px);
  }
  .auth-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 22px;
    box-shadow: 0 12px 24px rgba(29, 35, 43, 0.08);
  }
  .auth-card h2 {
    margin: 0 0 10px;
    font-family: "Oswald", Arial, sans-serif;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }
  .auth-muted {
    margin: 0 0 14px;
    color: var(--muted);
    font-size: 13px;
  }
  .auth-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
`;
