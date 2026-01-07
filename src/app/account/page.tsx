"use client";

import AppHeader from "@/components/AppHeader";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type TeamRow = { id: string; name: string; symbol: string };

export default function AccountPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [teamMsg, setTeamMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordErr, setPasswordErr] = useState("");
  const [accountErr, setAccountErr] = useState("");
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/teams", label: "Teams" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/account", label: "Account" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  useEffect(() => {
    let active = true;
    fetch("/api/account")
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((json) => {
        if (!active) return;
        setUsername(String(json.username ?? ""));
        setEmail(String(json.email ?? ""));
        setTeamId(String(json.teamId ?? ""));
      })
      .catch(() => {
        if (!active) return;
        setAccountErr("Please sign in to manage your account.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/teams")
      .then((res) => res.ok ? res.json() : [])
      .then((json) => {
        if (!active) return;
        setTeams(Array.isArray(json) ? json : []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function saveEmail() {
    setEmailMsg("");
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setEmailMsg(json?.error ?? "Unable to update email.");
      return;
    }
    setEmailMsg("Email updated.");
  }

  async function saveTeam() {
    setTeamMsg("");
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setTeamMsg(json?.error ?? "Unable to update team.");
      return;
    }
    setTeamMsg("Team updated.");
    window.dispatchEvent(new Event("user:refresh"));
  }

  async function updatePassword() {
    setPasswordMsg("");
    setPasswordErr("");
    if (!currentPassword.trim()) {
      setPasswordErr("Enter your current password.");
      return;
    }
    if (!isStrongPassword(newPassword)) {
      setPasswordErr("Password must be at least 8 characters and include a symbol.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr("Passwords do not match.");
      return;
    }
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setPasswordErr(json?.error ?? "Unable to update password.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMsg("Password updated.");
  }

  if (status === "unauthenticated") {
    return (
      <main className="account">
        <style>{accountStyles}</style>
        <div className="account-shell">
          <AppHeader links={headerLinks} />
          <div className="account-card">
            <h1>Account</h1>
            <p>Please sign in to manage your account.</p>
            <a className="account-link" href="/auth/signin">Sign in</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="account">
      <style>{accountStyles}</style>
      <div className="account-shell">
        <AppHeader links={headerLinks} />
        <div className="account-header">
          <h1>Account{username ? `: ${username}` : ""}</h1>
          {accountErr && <div className="account-error">{accountErr}</div>}
        </div>

        <div className="account-card">
          <h3>Email</h3>
          <div className="account-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
            />
            <button className="account-btn" onClick={saveEmail}>Save Email</button>
          </div>
          {emailMsg && <div className="account-muted">{emailMsg}</div>}
        </div>

        <div className="account-card">
          <h3>Team</h3>
          <div className="account-row">
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              disabled={role === "ADMIN"}
            >
              <option value="">Select a team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.symbol})</option>
              ))}
            </select>
            <button className="account-btn" onClick={saveTeam} disabled={role === "ADMIN"}>
              Save Team
            </button>
          </div>
          {role === "ADMIN" && (
            <div className="account-muted">Admins cannot be assigned a team.</div>
          )}
          {teamMsg && <div className="account-muted">{teamMsg}</div>}
        </div>

        <div className="account-card">
          <h3>Password</h3>
          <div className="account-grid">
            <input
              type={showPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
            />
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
            />
            <div className="strength">
              <span
                style={{
                  width: `${passwordStrength(newPassword).pct}%`,
                  background: passwordStrength(newPassword).color,
                }}
              />
            </div>
            <div className="strength-label">{passwordStrength(newPassword).label}</div>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
            <label className="account-check">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show passwords
            </label>
          </div>
          <button className="account-btn" onClick={updatePassword}>Update Password</button>
          {passwordErr && <div className="account-error">{passwordErr}</div>}
          {passwordMsg && <div className="account-muted">{passwordMsg}</div>}
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

const accountStyles = `
  @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
  :root {
    --bg: #eef1f4;
    --card: #ffffff;
    --ink: #1d232b;
    --muted: #5a6673;
    --accent: #1e88e5;
    --line: #d5dbe2;
    --danger: #b00020;
  }
  .account {
    min-height: 100vh;
    background: var(--bg);
    color: var(--ink);
    font-family: "Source Sans 3", Arial, sans-serif;
    padding: 28px 18px 40px;
  }
  .account-shell {
    max-width: 960px;
    margin: 0 auto;
  }
  .account-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin: 12px 0 16px;
  }
  .account-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 18px;
    margin-bottom: 16px;
  }
  .account-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .account-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(200px, 1fr);
  }
  .account input,
  .account select {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 14px;
  }
  .account-btn {
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
  .account-muted {
    font-size: 12px;
    color: var(--muted);
    margin-top: 8px;
  }
  .account-error {
    font-size: 12px;
    color: var(--danger);
    margin-top: 8px;
  }
  .account-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .account-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
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
