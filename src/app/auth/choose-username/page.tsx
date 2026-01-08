"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function ChooseUsernamePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const rawCallbackUrl = sp.get("callbackUrl") ?? "/teams";
  const postLoginUrl = rawCallbackUrl.startsWith("/auth/post-login")
    ? rawCallbackUrl
    : `/auth/post-login?callbackUrl=${encodeURIComponent(rawCallbackUrl)}`;
  const { status, data: session } = useSession();
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [teams, setTeams] = useState<Array<{ id: string; name: string; symbol: string }>>([]);
  const [username, setUsername] = useState("");
  const [teamId, setTeamId] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (status === "unauthenticated") {
      router.replace("/auth/signin");
      return;
    }
    const current = session?.user?.username ?? "";
    const role = session?.user?.role;
    const hasTeam = Boolean(session?.user?.teamId);
    if (status === "authenticated" && current && !current.startsWith("oauth-") && (role === "ADMIN" || hasTeam)) {
      router.replace(postLoginUrl);
    }
  }, [status, session, router, postLoginUrl]);

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
    setErr("");
    if (!username.trim()) {
      setErr("Enter a username.");
      return;
    }
    const role = session?.user?.role;
    if ((role === "PARENT" || role === "COACH" || role === "TABLE_WORKER") && !teamId) {
      setErr("Select a team.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, teamId: teamId || undefined }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(json?.error ?? "Unable to save username.");
        return;
      }
      router.replace(postLoginUrl);
    } finally {
      setSaving(false);
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
          max-width: 780px;
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
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: var(--card);
          padding: 26px 24px;
        }
        .logo {
          width: 110px;
          height: 110px;
          object-fit: contain;
          margin: 0 auto 10px;
          display: block;
        }
        .form-group { display: grid; gap: 6px; margin-bottom: 14px; }
        label { font-size: 12px; color: var(--muted); }
        input[type="text"], select {
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 9px 10px;
          font-size: 14px;
        }
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
        .error { color: #b00020; font-size: 12px; margin-top: 8px; }
        .muted { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
      `}</style>
      <div className="signin-shell">
        <div className="signin-brand">
          <img className="signin-logo" src="/api/league/logo/file" alt="League logo" />
          <h1 className="signin-title">{leagueName}</h1>
        </div>
        <div className="signin-card">
          <img className="logo" src="/api/league/logo/file" alt="League logo" />
          <h2>Choose your username</h2>
          <p className="muted">Pick the username you want to use when signing in.</p>
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
                autoFocus
              />
            </div>
            {(session?.user?.role === "PARENT" || session?.user?.role === "COACH" || session?.user?.role === "TABLE_WORKER") && (
              <div className="form-group">
                <label htmlFor="team">Team</label>
                <select
                  id="team"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="">Select a team</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.symbol})</option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn-full" disabled={saving} onClick={submit}>
              {saving ? "Saving..." : "Save Username"}
            </button>
            {err && <div className="error">{err}</div>}
          </form>
        </div>
      </div>
    </main>
  );
}
