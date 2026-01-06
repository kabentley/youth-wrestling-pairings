"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SignUpPage() {
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [teams, setTeams] = useState<Array<{ id: string; name: string; symbol: string }>>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"error" | "success" | "">("");

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
    fetch("/api/teams")
      .then(res => res.ok ? res.json() : [])
      .then(json => {
        if (!active) return;
        setTeams(Array.isArray(json) ? json : []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function submit() {
    setMsg("");
    setMsgTone("");
    if (!email.trim()) {
      setMsg("Email is required.");
      setMsgTone("error");
      return;
    }
    if (!teamId) {
      setMsg("Select a team.");
      setMsgTone("error");
      return;
    }
    if (!isStrongPassword(password)) {
      setMsg("Password must be at least 8 characters and include a symbol.");
      setMsgTone("error");
      return;
    }
    if (password !== confirm) {
      setMsg("Passwords do not match.");
      setMsgTone("error");
      return;
    }

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone, name, teamId, password }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = json?.error;
      if (typeof error === "string") {
        setMsg(error);
        setMsgTone("error");
      } else if (error && typeof error === "object") {
        const flat = Object.values(error).flat().filter(Boolean);
        setMsg(flat.length > 0 ? flat.join(" ") : "Sign-up failed.");
        setMsgTone("error");
      } else {
        setMsg("Sign-up failed.");
        setMsgTone("error");
      }
      return;
    }

    setMsg("Account created. Check your email to verify before signing in.");
    setMsgTone("success");
    alert("Account created. Check your email to verify before signing in.");
    window.location.href = "/auth/signin";
  }

  return (
    <main className="signup">
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
        .signup {
          min-height: 100vh;
          background: var(--bg);
          color: var(--ink);
          font-family: "Source Sans 3", Arial, sans-serif;
          padding: 28px 18px 40px;
        }
        .signup-shell {
          max-width: 980px;
          margin: 0 auto;
        }
        .signup-title {
          font-family: "Oswald", Arial, sans-serif;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin: 0 0 16px;
        }
        .signup-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: var(--card);
        }
        .signup-left {
          padding: 26px 24px;
          background: #f7f9fb;
          border-right: 1px solid var(--line);
        }
        .signup-left h2 { margin: 0 0 8px; }
        .signup-left p { margin: 0 0 12px; color: var(--muted); }
        .signup-left ul { margin: 0 0 16px 18px; color: var(--muted); }
        .signup-left li { margin-bottom: 4px; }
        .ghost-btn {
          display: inline-block;
          border: 1px solid var(--line);
          color: var(--ink);
          text-decoration: none;
          padding: 8px 12px;
          border-radius: 4px;
          font-weight: 600;
        }
        .signup-right { padding: 26px 24px; }
        .logo {
          width: 120px;
          height: 120px;
          object-fit: contain;
          margin: 0 auto 8px;
          display: block;
        }
        .form-group { display: grid; gap: 6px; margin-bottom: 12px; }
        label { font-size: 12px; color: var(--muted); }
        input[type="text"], input[type="password"], input[type="email"], input[type="tel"], select {
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 9px 10px;
          font-size: 14px;
        }
        .strength {
          height: 8px;
          border-radius: 999px;
          background: #e6e9ee;
          overflow: hidden;
          border: 1px solid var(--line);
        }
        .strength > span {
          display: block;
          height: 100%;
          transition: width 150ms ease;
        }
        .strength-label { font-size: 12px; color: var(--muted); }
        .remember { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
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
        .msg-error { color: #b00020; font-size: 12px; margin-top: 6px; }
        .msg-success { color: #2e7d32; font-size: 12px; margin-top: 6px; }
        @media (max-width: 900px) {
          .signup-card { grid-template-columns: 1fr; }
          .signup-left { border-right: none; border-bottom: 1px solid var(--line); }
        }
      `}</style>
      <div className="signup-shell">
        <h1 className="signup-title">{leagueName}</h1>
        <div className="signup-card">
          <div className="signup-left">
            <h2>Welcome</h2>
            <p>Create your account and begin using the wrestling scheduler.</p>
            <ul>
              <li>Claim/Create your profiles</li>
              <li>Manage teams and rosters</li>
              <li>Generate pairings and mats</li>
              <li>Share match info with parents</li>
              <li>Print and wall charts ready</li>
              <li>Track meet progress</li>
            </ul>
            <Link className="ghost-btn" href="/auth/signin">Sign in</Link>
          </div>

          <div className="signup-right">
            <img className="logo" src="/api/league/logo/file" alt="League logo" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email (required)</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone">Phone (optional, E.164)</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="name">Name (optional)</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="team">Team (required)</label>
                <select id="team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">Select a team</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.symbol})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="strength" aria-hidden>
                  <span style={{ width: `${passwordStrength(password).pct}%`, background: passwordStrength(password).color }} />
                </div>
                <div className="strength-label">{passwordStrength(password).label}</div>
              </div>
              <div className="form-group">
                <label htmlFor="confirm">Confirm password</label>
                <input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
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
              <button className="btn-full" type="submit">Create account</button>
              {msg && msgTone === "error" && <div className="msg-error">{msg}</div>}
              {msg && msgTone === "success" && <div className="msg-success">{msg}</div>}
            </form>
          </div>
        </div>
      </div>
    </main>
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
