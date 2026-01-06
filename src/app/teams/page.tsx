"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Team = { id: string; name: string; symbol: string; color: string; hasLogo?: boolean };
type Wrestler = {
  id: string;
  first: string;
  last: string;
  weight: number;
  birthdate: string;
  experienceYears: number;
  skill: number;
  active: boolean;
};

function parseCsv(text: string) {
  // Basic CSV parser that supports commas and quoted values.
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;

  function pushCell() {
    row.push(cur);
    cur = "";
  }
  function pushRow() {
    // ignore completely empty trailing row
    if (row.length === 1 && row[0].trim() === "") { row = []; return; }
    rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') { // escaped quote
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      pushCell();
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushCell();
      pushRow();
    } else {
      cur += ch;
    }
  }
  pushCell();
  if (row.length) pushRow();

  if (rows.length === 0) return { headers: [], data: [] as Record<string, string>[] };

  const firstRow = rows[0].map(h => h.trim());
  const requiredHeaders = ["first", "last", "weight", "birthdate", "experienceYears", "skill"];
  const headerTokens = firstRow.map(h => h.toLowerCase());
  const hasHeader = headerTokens.some(h => requiredHeaders.includes(h));
  const headers = hasHeader ? firstRow : requiredHeaders;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const data = dataRows.filter(r => r.some(c => c.trim() !== "")).map(r => {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = (r[j] ?? "").trim();
    return obj;
  });

  return { headers, data };
}

export default function TeamsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const sessionTeamId = (session?.user as any)?.teamId as string | undefined;
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [roster, setRoster] = useState<Wrestler[]>([]);
  const [rosterMsg, setRosterMsg] = useState("");
  // Import state
  const [importTeamId, setImportTeamId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string,string>[] } | null>(null);
  const [importMsg, setImportMsg] = useState<string>("");
  const daysPerYear = 365;
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/teams", label: "Teams" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  async function load() {
    const [tRes, lRes] = await Promise.all([fetch("/api/teams"), fetch("/api/league")]);
    if (tRes.ok) setTeams(await tRes.json());
    if (lRes.ok) {
      const league = await lRes.json();
      setLeagueName(String(league.name ?? "").trim());
    }
  }

  function ageYears(birthdate: string) {
    const bDate = new Date(birthdate);
    if (Number.isNaN(bDate.getTime())) return null;
    const now = new Date();
    const days = Math.floor((now.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
    return days / daysPerYear;
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (role === "COACH" && sessionTeamId && !selectedTeamId) {
      setSelectedTeamId(sessionTeamId);
      setImportTeamId(sessionTeamId);
    }
  }, [role, sessionTeamId, selectedTeamId]);

  const teamOptions = useMemo(() => {
    if (role === "COACH" && sessionTeamId) {
      const own = teams.find(t => t.id === sessionTeamId);
      return own ? [own] : [];
    }
    return teams;
  }, [teams, role, sessionTeamId]);

  async function onChooseFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setImportMsg("");

    if (!f) return;
    const text = await f.text();
    const parsed = parseCsv(text);

    setPreview({ headers: parsed.headers, rows: parsed.data.slice(0, 8) });
  }

  function normalizeRow(r: Record<string, string>) {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = r[k];
        if (typeof v === "string" && v.trim() !== "") return v.trim();
      }
      return "";
    };

    const first = get("first", "First", "FIRST");
    const last = get("last", "Last", "LAST");
    const weightStr = get("weight", "Weight", "WEIGHT", "wt", "Wt");
    let birthdate = get("birthdate", "Birthdate", "DOB", "dob", "DateOfBirth", "dateOfBirth");
    const expStr = get("experienceYears", "ExperienceYears", "experience", "Experience", "expYears", "ExpYears");
    const skillStr = get("skill", "Skill", "SKILL");

    const weight = Number(weightStr);
    const experienceYears = expStr ? Number(expStr) : Number.NaN;
    const skill = skillStr ? Number(skillStr) : Number.NaN;

    if (birthdate) {
      const match = birthdate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        const mm = match[1].padStart(2, "0");
        const dd = match[2].padStart(2, "0");
        const yyyy = match[3];
        birthdate = `${yyyy}-${mm}-${dd}`;
      }
    }

    return { first, last, weight, birthdate, experienceYears, skill };
  }

  async function importCsv() {
    setImportMsg("");

    if (!file) { setImportMsg("Choose a CSV file first."); return; }
    const teamId = importTeamId || undefined;

    if (!teamId) {
      setImportMsg("Select an existing team.");
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);

    if (parsed.headers.length === 0) {
      setImportMsg("CSV looks empty.");
      return;
    }

    const normalized = parsed.data.map(normalizeRow);
    const missingRequired = normalized.some(w => !Number.isFinite(w.experienceYears) || !Number.isFinite(w.skill));
    if (missingRequired) {
      setImportMsg("ExperienceYears and Skill are required for every row.");
      return;
    }

    // Convert rows -> API payload
    const wrestlers = normalized
      .filter(w => w.first && w.last && Number.isFinite(w.weight) && w.weight > 0 && w.birthdate)
      .map(w => ({
        first: w.first,
        last: w.last,
        weight: Number(w.weight),
        birthdate: w.birthdate,
        experienceYears: Math.max(0, Math.floor(w.experienceYears)),
        skill: Math.min(5, Math.max(0, Math.floor(w.skill))),
      }));

    if (wrestlers.length === 0) {
      setImportMsg("No valid wrestler rows found. Expected columns: first,last,weight,birthdate,experienceYears,skill.");
      return;
    }

    setImportMsg("Importing...");
    const res = await fetch("/api/teams/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, wrestlers }),
    });

    if (!res.ok) {
      const txt = await res.text();
      setImportMsg(`Import failed: ${txt}`);
      return;
    }

    const json = await res.json();
    setImportMsg(`Imported ${json.created} wrestlers.`);
    setFile(null);
    setPreview(null);
    await load();
    await loadRoster(teamId);
    setTimeout(() => setImportMsg(""), 2000);
  }

  async function loadRoster(teamId: string) {
    setRosterMsg("");
    if (!teamId) {
      setRoster([]);
      return;
    }
    const res = await fetch(`/api/teams/${teamId}/wrestlers?includeInactive=1`);
    if (!res.ok) {
      setRosterMsg("Unable to load roster.");
      setRoster([]);
      return;
    }
    setRoster(await res.json());
  }

  useEffect(() => {
    void loadRoster(selectedTeamId);
  }, [selectedTeamId]);

  return (
    <main className="teams">
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
        .teams {
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
          grid-template-columns: minmax(0, 1fr);
          gap: 18px;
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
        .muted {
          color: var(--muted);
          font-size: 12px;
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
        }
        .input-sm {
          width: 120px;
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
        .btn-ghost {
          background: #f2f5f8;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        .team-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .team-card {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: #fff;
          text-align: left;
          cursor: pointer;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .team-card-active {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(30, 136, 229, 0.15);
        }
        .team-head {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .team-logo {
          width: 44px;
          height: 44px;
          object-fit: contain;
        }
        .team-meta {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: nowrap;
        }
        .team-symbol {
          font-weight: 700;
          font-size: 18px;
          text-decoration: none;
          white-space: nowrap;
        }
        .team-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .team-link a {
          color: var(--accent);
          font-size: 12px;
          text-decoration: none;
        }
        .color-dot {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid var(--line);
        }
        .divider {
          height: 1px;
          background: var(--line);
          margin: 6px 0 12px;
        }
        .two-col {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          align-items: end;
        }
        .preview-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
        }
        .preview-table th,
        .preview-table td {
          padding: 8px 6px;
          border-bottom: 1px solid var(--line);
          text-align: left;
        }
        .roster-table {
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
        }
        .roster-table table {
          width: 100%;
          border-collapse: collapse;
        }
        .roster-table th,
        .roster-table td {
          padding: 8px 6px;
          border-bottom: 1px solid var(--line);
          text-align: left;
        }
        @media (max-width: 900px) {
          .mast {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
      <AppHeader links={headerLinks} />
      <header className="mast">
        <div>
          <h1 className="title">Team Rosters</h1>
          <div className="tagline">League Directory</div>
        </div>
      </header>

      <div className="grid">
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="card-title">Teams{leagueName ? ` for ${leagueName}` : ""}</h2>
            {role !== "ADMIN" && <span className="muted">Team management is handled by league admins.</span>}
          </div>
          <div className="team-grid">
            {teams.map(t => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                className={`team-card ${selectedTeamId === t.id ? "team-card-active" : ""}`}
                onClick={() => { setSelectedTeamId(t.id); setImportTeamId(t.id); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedTeamId(t.id);
                    setImportTeamId(t.id);
                  }
                }}
              >
                <div className="team-head">
                  {t.hasLogo ? (
                    <img src={`/api/teams/${t.id}/logo/file`} alt={`${t.name} logo`} className="team-logo" />
                  ) : (
                    <div className="color-dot" style={{ backgroundColor: t.color }} />
                  )}
                  <div className="team-meta">
                    <span className="team-symbol" style={{ color: t.color }}>{t.symbol}</span>
                    <div className="team-name">{t.name}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">
            Roster
            {selectedTeamId ? (() => {
              const team = teams.find(t => t.id === selectedTeamId);
              if (!team) return "";
              return ` - ${team.name} (${team.symbol})`;
            })() : ""}
          </h2>
          {selectedTeamId ? (
            <>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <div className="team-head">
                  {(() => {
                    const team = teams.find(t => t.id === selectedTeamId);
                    if (!team) return null;
                    return team.hasLogo ? (
                      <img src={`/api/teams/${team.id}/logo/file`} alt={`${team.name} logo`} className="team-logo" />
                    ) : (
                      <div className="color-dot" style={{ backgroundColor: team.color }} />
                    );
                  })()}
                  <div className="team-meta">
                    <span className="team-symbol">
                      {teams.find(t => t.id === selectedTeamId)?.symbol ?? ""}
                    </span>
                    <div className="team-name">{teams.find(t => t.id === selectedTeamId)?.name ?? ""}</div>
                  </div>
                </div>
              </div>
              {rosterMsg && <div className="muted">{rosterMsg}</div>}
              <div className="roster-table">
                <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Weight</th>
                        <th>Birthdate</th>
                        <th>Age</th>
                        <th>Experience</th>
                        {(role === "ADMIN" || role === "COACH") && <th>Skill</th>}
                        {(role === "ADMIN" || role === "COACH") && <th>Status</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(w => (
                        <tr key={w.id}>
                          <td>{w.first} {w.last}</td>
                          <td>{w.weight}</td>
                          <td>{new Date(w.birthdate).toISOString().slice(0, 10)}</td>
                          <td>{ageYears(w.birthdate)?.toFixed(1) ?? ""}</td>
                          <td>{w.experienceYears}</td>
                          {(role === "ADMIN" || role === "COACH") && <td>{w.skill}</td>}
                          {(role === "ADMIN" || role === "COACH") && <td>{w.active ? "Active" : "Inactive"}</td>}
                        </tr>
                      ))}
                    {roster.length === 0 && (
                      <tr>
                        <td colSpan={(role === "ADMIN" || role === "COACH") ? 7 : 5}>
                          No wrestlers yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="muted">Select a team above to view its roster.</div>
          )}

          {(role === "ADMIN" || role === "COACH") && (
            <>
              <div className="divider" />
              <h3 className="card-title" style={{ fontSize: 18, marginBottom: 10 }}>Import / Update CSV</h3>
              <div>
                <label className="muted">CSV file</label>
                <input
                  className="input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={e => onChooseFile(e.target.files?.[0] ?? null)}
                />
                <div className="muted" style={{ marginTop: 6 }}>
                  Required columns: <b>first,last,weight,birthdate (YYYY-MM-DD),experienceYears,skill</b>.
                </div>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={importCsv} disabled={!file || !importTeamId}>
                Import / Update CSV
              </button>
                {importMsg && <span className="muted">{importMsg}</span>}
              </div>

              {preview && (
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Preview (first {preview.rows.length} rows). Headers: {preview.headers.join(", ")}
                  </div>
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {preview.headers.slice(0, 8).map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i}>
                          {preview.headers.slice(0, 8).map(h => (
                            <td key={h}>{r[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <details style={{ marginTop: 12 }}>
                <summary>Example CSV</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>{`first,last,weight,birthdate,experienceYears,skill
Ben,Bentley,52,2015-03-11,1,3
Sam,Smith,55,2014-11-02,0,2
`}</pre>
              </details>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
