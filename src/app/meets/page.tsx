"use client";
import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Team = { id: string; name: string; symbol: string; color: string; address?: string | null; hasLogo?: boolean };
type Meet = { id: string; name: string; date: string; location?: string | null; meetTeams: { team: Team }[]; homeTeamId?: string | null };

export default function MeetsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [meets, setMeets] = useState<Meet[]>([]);
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [leagueHasLogo, setLeagueHasLogo] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("2026-01-15");
  const [location, setLocation] = useState("");
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [numMats, setNumMats] = useState(4);
  const [allowSameTeamMatches, setAllowSameTeamMatches] = useState(false);
  const [matchesPerWrestler, setMatchesPerWrestler] = useState(1);
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/teams", label: "Teams" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  async function load() {
    const [t, m, l, me] = await Promise.all([
      fetch("/api/teams"),
      fetch("/api/meets"),
      fetch("/api/league"),
      fetch("/api/me"),
    ]);
    if (t.ok) {
      const tJson = await t.json().catch(() => []);
      setTeams(Array.isArray(tJson) ? tJson : []);
    } else {
      setTeams([]);
    }
    if (m.ok) {
      const mJson = await m.json().catch(() => []);
      const list = Array.isArray(mJson) ? mJson : [];
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMeets(list);
    } else {
      setMeets([]);
    }
    if (l.ok) {
      const lJson = await l.json().catch(() => ({}));
      const name = String(lJson?.name ?? "").trim();
      setLeagueName(name || "Wrestling Scheduler");
      setLeagueHasLogo(Boolean(lJson?.hasLogo));
    }
    if (me.ok) {
      const meJson = await me.json().catch(() => ({}));
      setCurrentTeamId(meJson?.teamId ?? null);
    }
  }

  function toggleTeam(id: string) {
    setTeamIds(prev => {
      if (currentTeamId && id === currentTeamId) return prev;
      const has = prev.includes(id);
      if (has) return prev.filter(x => x !== id);
      const otherCount = prev.filter(x => x !== currentTeamId).length;
      if (otherCount >= 3) return prev;
      return [...prev, id];
    });
  }

  async function addMeet() {
    await fetch("/api/meets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        date,
        location,
        teamIds,
        homeTeamId: homeTeamId || null,
        numMats,
        allowSameTeamMatches,
        matchesPerWrestler,
      }),
    });
    setName("");
    setLocation("");
    setTeamIds([]);
    setHomeTeamId("");
    setNumMats(4);
    setAllowSameTeamMatches(false);
    setMatchesPerWrestler(1);
    await load();
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setHomeTeamId((prev) => {
      if (currentTeamId) return currentTeamId;
      if (prev && teamIds.includes(prev)) return prev;
      return teamIds[0] ?? "";
    });
  }, [teamIds, currentTeamId]);
  useEffect(() => {
    if (!currentTeamId) return;
    setTeamIds(prev => (prev.includes(currentTeamId) ? prev : [currentTeamId, ...prev]));
    setHomeTeamId(currentTeamId);
    const team = teams.find(t => t.id === currentTeamId);
    if (team?.address) setLocation(team.address);
  }, [currentTeamId]);

  const otherTeams = currentTeamId
    ? teams.filter(t => t.id !== currentTeamId)
    : teams;
  const otherTeamIds = currentTeamId
    ? teamIds.filter(id => id !== currentTeamId)
    : teamIds;
  useEffect(() => {
    if (!homeTeamId || location.trim()) return;
    const home = teams.find(t => t.id === homeTeamId);
    if (home?.address) setLocation(home.address);
  }, [homeTeamId, teams, location]);

  return (
    <main className="meets">
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
        .meets {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .mast {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid var(--line);
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
        }
        .title {
          font-family: "Oswald", Arial, sans-serif;
          font-size: clamp(26px, 3vw, 38px);
          letter-spacing: 0.5px;
          margin: 0;
          text-transform: uppercase;
        }
        .tagline {
          color: var(--muted);
          font-size: 13px;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
        }
        .nav {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .nav a {
          color: var(--ink);
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.5px;
          padding: 8px 10px;
          border: 1px solid transparent;
          border-radius: 6px;
        }
        .nav-btn {
          color: var(--ink);
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px 10px;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.5px;
          cursor: pointer;
        }
        .nav a:hover,
        .nav-btn:hover {
          border-color: var(--line);
          background: #f7f9fb;
        }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
          gap: 18px;
          align-items: start;
        }
        .card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 18px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.08);
        }
        .card-title {
          font-family: "Oswald", Arial, sans-serif;
          margin: 0 0 10px;
          text-transform: uppercase;
        }
        .row {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .input,
        .select {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 14px;
          background: #fff;
          width: 100%;
        }
        .input-sm {
          width: 80px;
        }
        .btn {
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
        .btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .muted {
          color: var(--muted);
          font-size: 12px;
        }
        .team-box {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 12px;
          background: #fff;
        }
        .meet-list {
          display: grid;
          gap: 10px;
        }
        .meet-item {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 10px 12px;
          background: #fff;
        }
        .meet-item a {
          color: var(--accent);
          text-decoration: none;
          font-weight: 700;
        }
        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <AppHeader links={headerLinks} />
      <header className="mast">
        <div className="brand">
          {leagueHasLogo ? (
            <img className="logo" src="/api/league/logo/file" alt="League logo" />
          ) : null}
          <div>
            <h1 className="title">{leagueName}</h1>
            <div className="tagline">Meets</div>
          </div>
        </div>
      </header>

      <div className="grid">
        <section className="card">
          <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>
              Create New Meet for: {teams.find(t => t.id === currentTeamId)?.name ?? "Your Team"}
              {teams.find(t => t.id === currentTeamId)?.symbol ? ` (${teams.find(t => t.id === currentTeamId)?.symbol})` : ""}
            </span>
            {(() => {
              const t = teams.find(team => team.id === currentTeamId);
              if (!t?.hasLogo) return null;
              return <img src={`/api/teams/${t.id}/logo/file`} alt={`${t.name} logo`} style={{ width: 20, height: 20, objectFit: "contain" }} />;
            })()}
          </h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <input className="input" placeholder="Meet name" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="row">
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            <input className="input" placeholder="Location (optional)" value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="row">
              <span className="muted">Number of mats</span>
              <input
                className="input input-sm"
                type="number"
                min={1}
                max={10}
                value={numMats}
                onChange={e => setNumMats(Number(e.target.value))}
              />
            </label>
            <label className="row">
              <span className="muted">Matches per wrestler</span>
              <input
                className="input input-sm"
                type="number"
                min={1}
                max={5}
                value={matchesPerWrestler}
                onChange={e => setMatchesPerWrestler(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="row" style={{ marginTop: 6 }}>
            <input
              type="checkbox"
              checked={allowSameTeamMatches}
              onChange={e => setAllowSameTeamMatches(e.target.checked)}
            />
            <span className="muted">Attempt same-team matches</span>
          </label>

          <div className="team-box" style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6 }}><b>Select other teams</b></div>
            {otherTeams.map(t => (
              <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                <span style={{ flex: 1 }}>{t.name}</span>
                {t.hasLogo ? (
                  <img src={`/api/teams/${t.id}/logo/file`} alt={`${t.name} logo`} style={{ width: 20, height: 20, objectFit: "contain" }} />
                ) : (
                  <span style={{ color: t.color }}>{t.symbol}</span>
                )}
              </label>
            ))}
            <div className="muted" style={{ marginTop: 6 }}>
              Selected other teams: {otherTeamIds.length} (max 3)
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <label className="row">
              <span className="muted">Home team</span>
              <select
                className="select"
                value={homeTeamId}
                onChange={e => {
                  const next = e.target.value;
                  setHomeTeamId(next);
                  const t = teams.find(team => team.id === next);
                  if (t?.address) setLocation(t.address);
                }}
              >
                {teamIds.length === 0 && <option value="">Select teams first</option>}
                {teamIds.map(id => {
                  const t = teams.find(team => team.id === id);
                  return (
                    <option key={id} value={id}>{t?.symbol ?? id}</option>
                  );
                })}
              </select>
            </label>
            <button
              className="btn"
              onClick={addMeet}
              disabled={otherTeamIds.length < 1 || otherTeamIds.length > 3 || name.trim().length < 2}
            >
              Create Meet
            </button>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Existing Meets</h2>
          <div className="meet-list">
            {meets.map(m => (
              <div key={m.id} className="meet-item">
                <a href={`/meets/${m.id}`}>{m.name}</a>{" "}
                <span className="muted">
                  — {new Date(m.date).toISOString().slice(0,10)}
                  {m.location ? ` — ${m.location}` : ""} —{" "}
                  {m.meetTeams.map(mt => mt.team.symbol).join(", ")}
                </span>
              </div>
            ))}
            {meets.length === 0 && <div className="muted">No meets yet.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
