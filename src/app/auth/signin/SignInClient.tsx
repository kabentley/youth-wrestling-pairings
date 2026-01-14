"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export default function SignInClient() {
  const sp = useSearchParams();
  const rawCallbackUrl = sp.get("callbackUrl") ?? "/rosters";
  const postLoginUrl = rawCallbackUrl.startsWith("/auth/post-login")
    ? rawCallbackUrl
    : `/auth/post-login?callbackUrl=${encodeURIComponent(rawCallbackUrl)}`;
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<"email" | "sms">("email");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [bypassEmailVerification, setBypassEmailVerification] = useState(process.env.NODE_ENV !== "production");
  const [oauthProviders, setOauthProviders] = useState<Record<string, { id: string }>>({});

  useEffect(() => {
    let active = true;
    fetch("/api/league")
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (!active || !json) return;
        const name = String(json.name ?? "").trim();
        if (name) setLeagueName(name);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/providers")
      .then(res => res.ok ? res.json() : {})
      .then(json => {
        if (!active) return;
        setOauthProviders(json ?? {});
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function submit() {
    setErr("");
    setInfo("");
    const base = window.location.origin;
    const callbackUrl = postLoginUrl.startsWith("http") ? postLoginUrl : `${base}${postLoginUrl}`;
    const res = await signIn("credentials", {
      redirect: false,
      username,
      password,
      twoFactorMethod,
      twoFactorCode: twoFactorRequired ? twoFactorCode : "",
      bypassEmailVerification: bypassEmailVerification ? "true" : "false",
      callbackUrl,
    });

    if (res?.error) {
      if (res.error === "EMAIL_NOT_VERIFIED") {
        setErr("Please verify your email before signing in.");
        return;
      }
      if (res.error === "2FA_REQUIRED") {
        setTwoFactorRequired(true);
        setErr("Enter the code that was sent to you.");
        return;
      }
      if (res.error === "2FA_INVALID") {
        setErr("Invalid code. Try again.");
        return;
      }
      if (res.error === "PHONE_REQUIRED") {
        setErr("A phone number is required for SMS codes.");
        return;
      }
      if (res.error === "2FA_DELIVERY_FAILED") {
        setErr("Unable to send a verification code. Try again later.");
        return;
      }
      if (res.error === "2FA_RATE_LIMITED") {
        setErr("Too many verification codes requested. Please wait a bit.");
        return;
      }
      setErr("Sign-in failed. Check username/password.");
      return;
    }
    window.location.href = res?.url ?? postLoginUrl;
  }

  async function resendVerification() {
    setErr("");
    setInfo("");
    if (!resendEmail.trim()) {
      setErr("Enter your email to resend the verification link.");
      return;
    }
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resendEmail }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setErr(json?.error ?? "Unable to resend verification email.");
      return;
    }
    setInfo("Verification email sent.");
  }

  return (
    <main className="signin">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --brand: #0d3b66;
          --accent: #1e88e5;
          --line: #d5dbe2;
        }
        .signin {
          min-height: 100vh;
          background: var(--bg);
          color: var(--ink);
          font-family: "Source Sans 3", Arial, sans-serif;
          padding: 28px 18px 40px;
        }
        .signin-shell {
          max-width: 980px;
          margin: 0 auto;
        }
        .signin-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .signin-title {
          font-family: "Oswald", Arial, sans-serif;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin: 0;
        }
        .signin-logo {
          width: 48px;
          height: 48px;
          object-fit: contain;
        }
        .signin-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: var(--card);
        }
        .signin-left {
          padding: 26px 24px;
          background: #f7f9fb;
          border-right: 1px solid var(--line);
        }
        .signin-left h2 {
          margin: 0 0 8px;
        }
        .signin-left p {
          margin: 0 0 12px;
          color: var(--muted);
        }
        .signin-left ul {
          margin: 0 0 16px 18px;
          color: var(--muted);
        }
        .signin-left li { margin-bottom: 4px; }
        .ghost-btn {
          display: inline-block;
          border: 1px solid var(--line);
          color: var(--ink);
          text-decoration: none;
          padding: 8px 12px;
          border-radius: 4px;
          font-weight: 600;
        }
        .signin-right {
          padding: 26px 24px;
        }
        .logo {
          width: 120px;
          height: 120px;
          object-fit: contain;
          margin: 0 auto 8px;
          display: block;
        }
        .form-group { display: grid; gap: 6px; margin-bottom: 12px; }
        label { font-size: 12px; color: var(--muted); }
        input[type="text"], input[type="password"] {
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 9px 10px;
          font-size: 14px;
        }
        .remember { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
        .center-links { text-align: center; font-size: 12px; margin: 12px 0 14px; }
        .center-links a { color: var(--brand); text-decoration: none; }
        .btn-full {
          width: 100%;
          border: 0;
          background: var(--accent);
          color: #fff;
          font-weight: 700;
          padding: 10px 12px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .error { color: #b00020; font-size: 12px; margin-top: 6px; }
        @media (max-width: 900px) {
          .signin-card { grid-template-columns: 1fr; }
          .signin-left { border-right: none; border-bottom: 1px solid var(--line); }
        }
      `}</style>
      <div className="signin-shell">
        <div className="signin-brand">
          <img className="signin-logo" src="/api/league/logo/file" alt="League logo" />
          <h1 className="signin-title">{leagueName}</h1>
        </div>
        <div className="signin-card">
          <div className="signin-left">
            <h2>Welcome</h2>
            <Link className="ghost-btn" href="/auth/signup">Create New Account</Link>
          </div>

          <div className="signin-right">
            <img className="logo" src="/api/league/logo/file" alt="League logo" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="form-group">
                <label>Two-factor delivery</label>
                <label className="remember">
                  <input
                    type="radio"
                    name="twoFactorMethod"
                    value="email"
                    checked={twoFactorMethod === "email"}
                    onChange={() => setTwoFactorMethod("email")}
                  />
                  Email
                </label>
                <label className="remember">
                  <input
                    type="radio"
                    name="twoFactorMethod"
                    value="sms"
                    checked={twoFactorMethod === "sms"}
                    onChange={() => setTwoFactorMethod("sms")}
                  />
                  SMS
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {twoFactorRequired && (
                <div className="form-group">
                  <label htmlFor="twoFactorCode">Verification code</label>
                  <input
                    id="twoFactorCode"
                    type="text"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                  />
                </div>
              )}
              <div className="form-group">
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                  />
                  Show password
                </label>
              </div>
              <div className="center-links">
                <div><Link href="/auth/forgot-password">Forgot your password?</Link></div>
                <div><Link href="/auth/forgot-password">Need Help/FAQ?</Link></div>
              </div>
              {process.env.NODE_ENV !== "production" && (
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={bypassEmailVerification}
                    onChange={(e) => setBypassEmailVerification(e.target.checked)}
                  />
                  Bypass email verification (dev only)
                </label>
              )}
              <button className="btn-full" onClick={submit}>
                {twoFactorRequired ? "Verify" : "Login"}
              </button>
              {err && <div className="error">{err}</div>}
              {info && <div style={{ color: "#2e7d32", fontSize: 12, marginTop: 6 }}>{info}</div>}
              {(oauthProviders.google || oauthProviders.apple || oauthProviders.facebook) && (
                <div className="center-links" style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 8 }}>Or sign in with</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {oauthProviders.google && (
                      <button
                        className="btn-full"
                        type="button"
                        style={{ background: "#ffffff", color: "#1d232b", border: "1px solid #d5dbe2" }}
                        onClick={() => void signIn("google", { callbackUrl: postLoginUrl })}
                      >
                        Google
                      </button>
                    )}
                    {oauthProviders.apple && (
                      <button
                        className="btn-full"
                        type="button"
                        style={{ background: "#000000" }}
                        onClick={() => void signIn("apple", { callbackUrl: postLoginUrl })}
                      >
                        Apple
                      </button>
                    )}
                    {oauthProviders.facebook && (
                      <button
                        className="btn-full"
                        type="button"
                        style={{ background: "#1877f2" }}
                        onClick={() => void signIn("facebook", { callbackUrl: postLoginUrl })}
                      >
                        Facebook
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="center-links" style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 6 }}>Resend verification email</div>
                <input
                  type="email"
                  placeholder="Email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                />
                <button className="btn-full" style={{ marginTop: 8 }} onClick={resendVerification}>
                  Resend
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
