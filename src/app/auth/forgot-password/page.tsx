"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ForgotPasswordPage() {
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [hasLogo, setHasLogo] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"email" | "sms">("email");
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

    const res = await fetch("/api/auth/send-reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone, method }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setErr(json?.error ?? "Unable to send reset code.");
      return;
    }

    setMsg("If that email exists, a reset code was sent.");
    setEmail("");
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
          <h2>Send Password Reset Code</h2>
          <p className="auth-muted">
            Enter your email address and we will send a reset code.
          </p>

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

            <button className="auth-btn" type="submit">Send Code</button>

            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="auth-success">{msg}</div>}

            <div className="auth-links">
              <Link href="/auth/reset-password">I have a code</Link> ·{" "}
              <Link href="/auth/signin">Back to sign in</Link>
            </div>
          </form>
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
  .auth-links {
    font-size: 12px;
    color: var(--muted);
  }
  .auth-links a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
`;
