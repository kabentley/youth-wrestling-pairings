"use client";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type Team = { id: string; name: string; symbol: string; color: string; address?: string | null };
type Meet = { id: string; name: string; date: string; location?: string | null; meetTeams: { team: Team }[]; homeTeamId?: string | null };

export default function MeetsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [meets, setMeets] = useState<Meet[]>([]);
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [leagueHasLogo, setLeagueHasLogo] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("2026-01-15");
  const [location, setLocation] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [numMats, setNumMats] = useState(4);
  const [allowSameTeamMatches, setAllowSameTeamMatches] = useState(false);
  const [matchesPerWrestler, setMatchesPerWrestler] = useState(1);

  async function load() {
    const [t, m, l] = await Promise.all([fetch("/api/teams"), fetch("/api/meets"), fetch("/api/league")]);
    if (t.ok) {
      const tJson = await t.json().catch(() => []);
      setTeams(Array.isArray(tJson) ? tJson : []);
    } else {
      setTeams([]);
    }
    if (m.ok) {
      const mJson = await m.json().catch(() => []);
      setMeets(Array.isArray(mJson) ? mJson : []);
    } else {
      setMeets([]);
    }
    if (l.ok) {
      const lJson = await l.json().catch(() => ({}));
      const name = String(lJson?.name ?? "").trim();
      setLeagueName(name || "Wrestling Scheduler");
      setLeagueHasLogo(Boolean(lJson?.hasLogo));
    }
  }

  function toggleTeam(id: string) {
    setTeamIds(prev => {
      const has = prev.includes(id);
      if (has) return prev.filter(x => x !== id);
      if (prev.length >= 4) return prev;
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
      if (prev && teamIds.includes(prev)) return prev;
      return teamIds[0] ?? "";
    });
  }, [teamIds]);
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
        <nav className="nav">
          <a href="/">Home</a>
          <a href="/teams">Teams</a>
          <button className="nav-btn" onClick={async () => { await signOut({ redirect: false }); window.location.href = "/auth/signin"; }}>Sign out</button>
        </nav>
      </header>

      <div className="grid">
        <section className="card">
          <h2 className="card-title">Create Meet</h2>
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
            <div style={{ marginBottom: 6 }}><b>Select teams (2-4)</b></div>
            {teams.map(t => (
              <label key={t.id} style={{ display: "block" }}>
                <input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />{" "}
                <span style={{ color: t.color }}>{t.symbol}</span>
              </label>
            ))}
            <div className="muted" style={{ marginTop: 6 }}>
              Selected: {teamIds.length} (max 4)
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <label className="row">
              <span className="muted">Home team</span>
              <select className="select" value={homeTeamId} onChange={e => setHomeTeamId(e.target.value)}>
                {teamIds.length === 0 && <option value="">Select teams first</option>}
                {teamIds.map(id => {
                  const t = teams.find(team => team.id === id);
                  return (
                    <option key={id} value={id}>{t?.symbol ?? id}</option>
                  );
                })}
              </select>
            </label>
            <button className="btn" onClick={addMeet} disabled={teamIds.length < 2 || teamIds.length > 4 || name.trim().length < 2}>
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
