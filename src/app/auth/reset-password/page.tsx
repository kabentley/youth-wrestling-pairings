"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ResetPasswordContent() {
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [hasLogo, setHasLogo] = useState(false);
  const [username, setUsername] = useState("");
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"email" | "sms">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

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

  useEffect(() => {
    const preset = searchParams.get("username") ?? "";
    if (preset && !username) {
      setUsername(preset);
    }
  }, [searchParams, username]);

  async function submit() {
    setErr("");
    setMsg("");
    if (!username.trim()) {
      setErr("Enter your username.");
      return;
    }
    if (method === "email" && !email.trim()) {
      setErr("Enter your email.");
      return;
    }
    if (method === "sms" && !phone.trim()) {
      setErr("Enter your phone.");
      return;
    }
    if (!code.trim()) {
      setErr("Enter the reset code.");
      return;
    }
    if (password.length < 8) {
      setErr("Password must be at least 8 characters and include a symbol.");
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

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone, code, password }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setErr(json?.error ?? "Unable to reset password.");
      return;
    }

    setMsg("Password updated. You can sign in now.");
    setEmail("");
    setCode("");
    setPassword("");
    setConfirm("");
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
          <h2>Reset Password</h2>

          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="auth-radio">
              <input
                type="radio"
                name="method"
                value="email"
                checked={method === "email"}
                onChange={() => setMethod("email")}
              />{" "}
              Email
            </label>
            <label className="auth-radio">
              <input
                type="radio"
                name="method"
                value="sms"
                checked={method === "sms"}
                onChange={() => setMethod("sms")}
              />{" "}
              SMS
            </label>

            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            {method === "email" ? (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            ) : (
              <input
                type="tel"
                placeholder="Phone (E.164)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
            <input
              type="text"
              placeholder="Reset code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
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

            <button className="auth-btn" type="submit">Reset Password</button>

            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="auth-success">{msg}</div>}

            <div className="auth-links">
              <Link href="/auth/forgot-password">Send a new code</Link> ·{" "}
              <Link href="/auth/signin">Back to sign in</Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function passwordStrength(password: string) {
  const longEnough = password.length >= 8;
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (!password) return { pct: 0, color: "#e6e9ee", label: "Password strength" };
  if (!longEnough) return { pct: 40, color: "#e57373", label: "Too short" };
  if (!hasSymbol) return { pct: 75, color: "#f2b705", label: "Add a symbol" };
  return { pct: 100, color: "#2e7d32", label: "Strong" };
}

function isStrongPassword(password: string) {
  return password.length >= 8 && /[^A-Za-z0-9]/.test(password);
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
    margin: 0 0 10px;
    font-family: "Oswald", Arial, sans-serif;
    letter-spacing: 0.6px;
    text-transform: uppercase;
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
  .auth-links {
    font-size: 12px;
    color: var(--muted);
  }
  .auth-links a {
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
