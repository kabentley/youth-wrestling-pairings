"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export default function SignInClient() {
  const sp = useSearchParams();
  const rawCallbackUrl = sp.get("callbackUrl") ?? "/";
  const resolvedCallbackUrl = (() => {
    if (rawCallbackUrl.startsWith("/auth/post-login")) {
      const [, query = ""] = rawCallbackUrl.split("?");
      const params = new URLSearchParams(query);
      const nestedCallbackUrl = params.get("callbackUrl") ?? "/";
      return nestedCallbackUrl.startsWith("/") ? nestedCallbackUrl : "/";
    }
    return rawCallbackUrl.startsWith("/") ? rawCallbackUrl : "/";
  })();
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  async function submit() {
    setErr("");
    setSubmitting(true);
    const base = window.location.origin;
    const callbackUrl = resolvedCallbackUrl.startsWith("http") ? resolvedCallbackUrl : `${base}${resolvedCallbackUrl}`;
    try {
      const res = await signIn("credentials", {
        redirect: false,
        username,
        password,
        callbackUrl,
      });

      if (res?.error) {
        setErr("Sign-in failed. Check username/password.");
        return;
      }
      window.location.href = res?.url ?? resolvedCallbackUrl;
    } finally {
      setSubmitting(false);
    }
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
          cursor: pointer;
        }
        .btn-full:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .error { color: #b00020; font-size: 12px; margin-top: 6px; }
        .status-note { color: var(--muted); font-size: 12px; margin-top: 6px; }
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
                <label htmlFor="username">Username (not email address)</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  autoFocus
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    disabled={submitting}
                  />
                  Show password
                </label>
              </div>
              <button className="btn-full" type="submit" disabled={submitting}>
                {submitting ? "Logging in..." : "Login"}
              </button>
              {submitting && <div className="status-note">Please wait...</div>}
              {err && <div className="error">{err}</div>}
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
