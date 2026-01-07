"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ForceResetPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [hasLogo, setHasLogo] = useState(false);
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (status === "authenticated" && session?.user?.mustResetPassword === false) {
      router.replace("/auth/post-login");
    }
  }, [status, session, router]);

  useEffect(() => {
    let active = true;
    fetch("/api/league")
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (!active || !json) return;
        const name = String(json.name ?? "").trim();
        if (name) setLeagueName(name);
        setHasLogo(Boolean(json.hasLogo));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function submit() {
    setErr("");
    setMsg("");
    if (!password.trim()) {
      setErr("Enter a new password.");
      return;
    }
    if (!isStrongPassword(password)) {
      setErr("Password must be at least 8 characters and include a symbol.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    const res = await fetch("/api/auth/force-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, currentPassword, password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = json?.error ?? "Unable to reset password. Please sign in again.";
      setErr(message);
      if (res.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/auth/force-reset";
      }
      return;
    }

    setMsg("Password updated. Please sign in again.");
    await signOut({ callbackUrl: "/auth/signin" });
  }

  return (
    <main className="auth">
      <style>{authStyles}</style>
      <div className="auth-shell">
        <div className="auth-brand">
          {hasLogo && <img className="auth-logo" src="/api/league/logo/file" alt="League logo" />}
          <h1 className="auth-title">{leagueName}</h1>
        </div>
        <div className="auth-card">
          <h2>Update Password</h2>
          <p className="auth-muted">
            You must update your password before continuing.
          </p>
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="strength">
              <span
                style={{
                  width: `${passwordStrength(password).pct}%`,
                  background: passwordStrength(password).color,
                }}
              />
            </div>
            <div className="strength-label">{passwordStrength(password).label}</div>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <label className="auth-radio">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />{" "}
              Show password
            </label>
            <button className="auth-btn" type="submit">
              Update Password
            </button>
            <div className="auth-muted">
              Enter your username and current password to continue.
            </div>
            {status === "loading" && (
              <div className="auth-muted">Signing you in...</div>
            )}
            {status === "unauthenticated" && (
              <a className="auth-link" href="/auth/signin">Back to sign in</a>
            )}
            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="auth-success">{msg}</div>}
          </form>
        </div>
      </div>
    </main>
  );
}

function isStrongPassword(password: string) {
  return password.length >= 8 && /[^A-Za-z0-9]/.test(password);
}

function passwordStrength(password: string) {
  const longEnough = password.length >= 8;
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (!password) return { pct: 0, color: "#e6e9ee", label: "Password strength" };
  if (!longEnough) return { pct: 40, color: "#e57373", label: "Too short" };
  if (!hasSymbol) return { pct: 75, color: "#f2b705", label: "Add a symbol" };
  return { pct: 100, color: "#2e7d32", label: "Strong" };
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
    --danger: #b00020;
    --success: #2e7d32;
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
    margin: 0 0 6px;
    font-family: "Oswald", Arial, sans-serif;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }
  .auth-muted {
    margin: 0 0 14px;
    color: var(--muted);
    font-size: 13px;
  }
  .auth-form {
    display: grid;
    gap: 10px;
  }
  .auth input {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 14px;
  }
  .auth-radio {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .auth-btn {
    border: 0;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    padding: 10px 12px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    cursor: pointer;
  }
  .auth-error {
    color: var(--danger);
    font-size: 12px;
  }
  .auth-success {
    color: var(--success);
    font-size: 12px;
  }
  .auth-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .strength {
    height: 8px;
    border-radius: 999px;
    background: #e6e9ee;
    overflow: hidden;
    border: 1px solid var(--line);
  }
  .strength span {
    display: block;
    height: 100%;
    transition: width 150ms ease;
  }
  .strength-label {
    font-size: 12px;
    color: var(--muted);
  }
`;
