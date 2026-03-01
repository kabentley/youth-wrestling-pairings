"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { formatTeamName } from "@/lib/formatTeamName";

export default function SignUpPage() {
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [teams, setTeams] = useState<Array<{
    id: string;
    name: string;
    symbol: string;
    hasLogo?: boolean;
    headCoach?: { username: string; name?: string | null } | null;
  }>>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [teamTypeahead, setTeamTypeahead] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"error" | "success" | "">("");
  const [usernameInputError, setUsernameInputError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameStatusMsg, setUsernameStatusMsg] = useState("Pick a public username. May not be an email address.");
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [createdTeam, setCreatedTeam] = useState<{
    id: string;
    name: string;
    symbol: string;
    hasLogo?: boolean;
    headCoach?: { username: string; name?: string | null } | null;
  } | null>(null);
  const teamPickerRef = useRef<HTMLDivElement | null>(null);
  const teamOptionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const teamTypeaheadResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    fetch("/api/public/teams")
      .then(res => res.ok ? res.json() : [])
      .then(json => {
        if (!active) return;
        const list = Array.isArray(json) ? json : [];
        list.sort((a, b) => {
          const aSymbol = (a.symbol ?? "").trim();
          const bSymbol = (b.symbol ?? "").trim();
          const symbolCmp = aSymbol.localeCompare(bSymbol, undefined, { sensitivity: "base" });
          if (symbolCmp !== 0) return symbolCmp;
          return (a.name ?? "").trim().localeCompare((b.name ?? "").trim(), undefined, { sensitivity: "base" });
        });
        setTeams(list);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const next = username.trim();
    if (!next) {
      setUsernameStatus("idle");
      setUsernameStatusMsg("Pick a public username. May not be an email address.");
      return;
    }
    if (next.includes("@")) {
      setUsernameStatus("invalid");
      setUsernameStatusMsg("Username cannot include @.");
      return;
    }
    if (next.length < 6 || next.length > 32) {
      setUsernameStatus("invalid");
      setUsernameStatusMsg("Username must be 6-32 characters.");
      return;
    }

    const controller = new AbortController();
    setUsernameStatus("checking");
    setUsernameStatusMsg("Checking availability...");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/signup?username=${encodeURIComponent(next)}`, {
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (json?.available === true) {
          setUsernameStatus("available");
          setUsernameStatusMsg("Username is available.");
          return;
        }
        setUsernameStatus("taken");
        setUsernameStatusMsg(typeof json?.reason === "string" ? json.reason : "Username is already taken.");
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setUsernameStatus("invalid");
        setUsernameStatusMsg("Unable to check username right now.");
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [username]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!teamPickerRef.current) return;
      if (teamPickerRef.current.contains(event.target as Node)) return;
      setTeamMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (teamTypeaheadResetRef.current) {
        clearTimeout(teamTypeaheadResetRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!teamMenuOpen || !teamId) return;
    const node = teamOptionRefs.current[teamId];
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
  }, [teamId, teamMenuOpen]);

  async function submit() {
    setMsg("");
    setMsgTone("");
    if (username.includes("@")) {
      setMsg("Username cannot include @.");
      setMsgTone("error");
      return;
    }
    if (usernameStatus === "checking") {
      setMsg("Checking username availability. Please try again.");
      setMsgTone("error");
      return;
    }
    if (usernameStatus === "taken" || usernameStatus === "invalid") {
      setMsg(usernameStatusMsg || "Choose a different username.");
      setMsgTone("error");
      return;
    }
    if (!email.trim()) {
      setMsg("Email is required.");
      setMsgTone("error");
      return;
    }
    if (!name.trim()) {
      setMsg("Name is required.");
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

    const teamForWelcome = teams.find((team) => team.id === teamId) ?? null;
    setCreatedTeam(teamForWelcome);
    setWelcomeOpen(true);
    setMsg("");
    setMsgTone("");
  }

  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const selectedTeamInitial = (selectedTeam?.symbol ?? selectedTeam?.name ?? "T").slice(0, 1).toUpperCase();

  function openTeamMenu() {
    setTeamMenuOpen(true);
  }

  function commitTeamSelection() {
    if (!teamId) return;
    setTeamMenuOpen(false);
  }

  function pickTeamBySymbolPrefix(prefix: string, cycle = false) {
    const normalized = prefix.trim().toLowerCase();
    if (!normalized) return false;
    const matches = teams.filter((team) => team.symbol.trim().toLowerCase().startsWith(normalized));
    if (matches.length === 0) return false;
    if (cycle && matches.length > 1) {
      const currentIndex = matches.findIndex((team) => team.id === teamId);
      const next = matches[(currentIndex + 1) % matches.length];
      setTeamId(next.id);
      return true;
    }
    setTeamId(matches[0].id);
    return true;
  }

  function handleTeamTypeaheadKey(rawKey: string) {
    if (rawKey.length !== 1) return;
    const key = rawKey.toLowerCase();
    const nextBuffer = `${teamTypeahead}${key}`;
    const cycleSingleChar = teamTypeahead === key && key.length === 1;
    let matched = pickTeamBySymbolPrefix(nextBuffer, cycleSingleChar && nextBuffer.length === 1);
    if (!matched) {
      matched = pickTeamBySymbolPrefix(key, true);
      if (!matched) return;
      setTeamTypeahead(key);
    } else {
      setTeamTypeahead(nextBuffer);
    }
    if (teamTypeaheadResetRef.current) clearTimeout(teamTypeaheadResetRef.current);
    teamTypeaheadResetRef.current = setTimeout(() => setTeamTypeahead(""), 800);
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
        .signup-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .top-signin {
          margin-left: auto;
          border: 1px solid var(--line);
          background: #ffffff;
          color: var(--ink);
          text-decoration: none;
          padding: 8px 12px;
          border-radius: 4px;
          font-weight: 600;
        }
        .signup-title {
          font-family: "Oswald", Arial, sans-serif;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin: 0;
        }
        .signup-logo {
          width: 48px;
          height: 48px;
          object-fit: contain;
        }
        .signup-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: var(--card);
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
        .username-status {
          font-size: 12px;
        }
        .username-status.idle,
        .username-status.checking {
          color: var(--muted);
        }
        .username-status.available {
          color: #2e7d32;
        }
        .username-status.taken,
        .username-status.invalid {
          color: #b00020;
        }
        .team-picker {
          position: relative;
        }
        .team-picker-trigger {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 8px 10px;
          font-size: 14px;
          background: #fff;
          color: #1d232b;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          cursor: pointer;
        }
        .team-picker-trigger-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .team-picker-caret {
          color: #5a6673;
          font-size: 12px;
        }
        .team-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          max-height: 260px;
          overflow: auto;
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 6px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
          z-index: 20;
        }
        .team-menu-item {
          width: 100%;
          border: 0;
          border-bottom: 1px solid #edf1f5;
          background: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
          text-align: left;
          padding: 8px 10px;
          font-size: 14px;
          cursor: pointer;
        }
        .team-menu-item:last-child {
          border-bottom: 0;
        }
        .team-menu-item:hover {
          background: #f7f9fb;
        }
        .team-menu-item.active {
          background: #eef6ff;
        }
        .team-option-logo {
          width: 22px;
          height: 22px;
          object-fit: contain;
          border-radius: 999px;
          flex: 0 0 22px;
          background: #fff;
        }
        .team-option-fallback {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--line);
          color: #5a6673;
          font-weight: 700;
          font-size: 11px;
          background: #f7f9fb;
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
        .btn-full:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .msg-error { color: #b00020; font-size: 12px; margin-top: 6px; }
        .msg-success { color: #2e7d32; font-size: 12px; margin-top: 6px; }
        .welcome-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(16, 24, 32, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 200;
        }
        .welcome-modal {
          width: min(580px, 100%);
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 12px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
          padding: 18px 18px 16px;
        }
        .welcome-team {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #f7f9fb;
          margin-bottom: 12px;
        }
        .welcome-team-meta {
          min-width: 0;
        }
        .welcome-team-logo {
          width: 42px;
          height: 42px;
          object-fit: contain;
          border-radius: 999px;
          background: #fff;
          border: 1px solid var(--line);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #5a6673;
        }
        .welcome-team-name {
          margin: 0;
          font-size: 16px;
        }
        .welcome-team-coach {
          margin-top: 6px;
          font-size: 15px;
          color: #1d232b;
          line-height: 1.35;
        }
        .welcome-copy {
          margin: 0 0 10px;
          color: var(--ink);
          line-height: 1.35;
        }
        .welcome-title {
          margin: 0 0 12px;
          font-size: 34px;
          font-weight: 800;
          letter-spacing: 0.6px;
          line-height: 1.1;
          color: #0d3b66;
          text-transform: uppercase;
        }
        .welcome-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .welcome-btn-primary {
          border: 0;
          background: var(--accent);
          color: #fff;
          border-radius: 6px;
          padding: 8px 12px;
          font-weight: 700;
        }
        @media (max-width: 900px) {
          .signup-card { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="signup-shell">
        <div className="signup-brand">
          <img className="signup-logo" src="/api/league/logo/file" alt="League logo" />
          <h1 className="signup-title">{leagueName}</h1>
          <Link className="top-signin" href="/auth/signin">Sign in</Link>
        </div>
        <div className="signup-card">
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw.includes("@")) {
                      setUsernameInputError("may not contain @");
                    } else {
                      setUsernameInputError("");
                    }
                    setUsername(raw.replaceAll("@", ""));
                  }}
                />
                {usernameInputError ? (
                  <div className="username-status invalid">{usernameInputError}</div>
                ) : (
                  <div className={`username-status ${usernameStatus}`}>{usernameStatusMsg}</div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone">Phone (optional)</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="team">Team</label>
                <div className="team-picker" ref={teamPickerRef}>
                  <button
                    id="team"
                    type="button"
                    className="team-picker-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={teamMenuOpen}
                    onClick={() => {
                      if (teamMenuOpen) {
                        setTeamMenuOpen(false);
                      } else {
                        openTeamMenu();
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (teamMenuOpen) {
                          commitTeamSelection();
                        } else {
                          openTeamMenu();
                        }
                        return;
                      }
                      if (event.key === "ArrowDown" || event.key === " ") {
                        event.preventDefault();
                        openTeamMenu();
                        return;
                      }
                      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                        event.preventDefault();
                        openTeamMenu();
                        handleTeamTypeaheadKey(event.key);
                      }
                    }}
                  >
                    <span className="team-picker-trigger-label">
                      {selectedTeam ? (
                        <>
                          {selectedTeam.hasLogo ? (
                            <img
                              src={`/api/teams/${selectedTeam.id}/logo/file`}
                              alt={`${selectedTeam.name} logo`}
                              className="team-option-logo"
                            />
                          ) : (
                            <span className="team-option-logo team-option-fallback" aria-hidden>
                              {selectedTeamInitial}
                            </span>
                          )}
                          <span>{formatTeamName(selectedTeam)}</span>
                        </>
                      ) : (
                        <span>Select a team</span>
                      )}
                    </span>
                    <span className="team-picker-caret" aria-hidden>{teamMenuOpen ? "^" : "v"}</span>
                  </button>
                  {teamMenuOpen && (
                    <div
                      className="team-menu"
                      role="listbox"
                      aria-labelledby="team"
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setTeamMenuOpen(false);
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitTeamSelection();
                          return;
                        }
                        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                          event.preventDefault();
                          handleTeamTypeaheadKey(event.key);
                        }
                      }}
                    >
                      {teams.map((team) => {
                        const initial = (team.symbol || team.name || "T").slice(0, 1).toUpperCase();
                        return (
                          <button
                            key={team.id}
                            type="button"
                            className={`team-menu-item ${team.id === teamId ? "active" : ""}`}
                            role="option"
                            aria-selected={team.id === teamId}
                            ref={(node) => {
                              teamOptionRefs.current[team.id] = node;
                            }}
                            onClick={() => {
                              setTeamId(team.id);
                              setTeamMenuOpen(false);
                            }}
                          >
                            {team.hasLogo ? (
                              <img
                                src={`/api/teams/${team.id}/logo/file`}
                                alt={`${team.name} logo`}
                                className="team-option-logo"
                              />
                            ) : (
                              <span className="team-option-logo team-option-fallback" aria-hidden>{initial}</span>
                            )}
                            <span>{formatTeamName(team)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
              <button className="btn-full" type="submit" disabled={usernameStatus === "checking"}>Create account</button>
              {msg && msgTone === "error" && <div className="msg-error">{msg}</div>}
              {msg && msgTone === "success" && <div className="msg-success">{msg}</div>}
            </form>
          </div>
        </div>
      </div>
      {welcomeOpen && (
        <div className="welcome-modal-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to your new account">
          <div className="welcome-modal">
            <p className="welcome-title">
              <strong>Welcome</strong>
            </p>
            {createdTeam && (
              <div className="welcome-team">
                {createdTeam.hasLogo ? (
                  <img
                    src={`/api/teams/${createdTeam.id}/logo/file`}
                    alt={`${createdTeam.name} logo`}
                    className="welcome-team-logo"
                  />
                ) : (
                  <span className="welcome-team-logo" aria-hidden>
                    {(createdTeam.symbol.trim() || createdTeam.name.trim() || "T").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="welcome-team-meta">
                  <h3 className="welcome-team-name">{formatTeamName(createdTeam)}</h3>
                  <div className="welcome-team-coach">
                    <div>
                      <strong>Head coach:</strong>{" "}
                      {createdTeam.headCoach?.username
                        ? `${createdTeam.headCoach.username} (${(createdTeam.headCoach.name ?? "").trim() || "Not provided"})`
                        : "Not assigned"}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className="welcome-copy">
              If you are a coach, ask your head coach to promote your account to a coach account.
            </p>
            <div className="welcome-actions">
              <button
                type="button"
                className="welcome-btn-primary"
                onClick={() => {
                  window.location.href = "/auth/signin";
                }}
              >
                Continue to Sign in
              </button>
            </div>
          </div>
        </div>
      )}
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
