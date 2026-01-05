"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string; symbol: string; color: string; hasLogo?: boolean };

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

  const headers = rows[0].map(h => h.trim());
  const data = rows.slice(1).filter(r => r.some(c => c.trim() !== "")).map(r => {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = (r[j] ?? "").trim();
    return obj;
  });

  return { headers, data };
}

export default function TeamsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");

  // Import state
  const [importTeamId, setImportTeamId] = useState<string>("");
  const [importNewTeamName, setImportNewTeamName] = useState<string>("");
  const [importNewTeamSymbol, setImportNewTeamSymbol] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string,string>[] } | null>(null);
  const [importMsg, setImportMsg] = useState<string>("");

  async function load() {
    const res = await fetch("/api/teams");
    setTeams(await res.json());
  }

  async function addTeam() {
    if (!name.trim() || !symbol.trim()) return;
    await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, symbol }),
    });
    setName("");
    setSymbol("");
    await load();
  }

  useEffect(() => { void load(); }, []);

  const teamOptions = useMemo(() => [{ id: "", name: "Select existing team", symbol: "" }, ...teams], [teams]);

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
    const birthdate = get("birthdate", "Birthdate", "DOB", "dob", "DateOfBirth", "dateOfBirth");
    const expStr = get("experienceYears", "ExperienceYears", "experience", "Experience", "expYears", "ExpYears");
    const skillStr = get("skill", "Skill", "SKILL");

    const weight = Number(weightStr);
    const experienceYears = expStr ? Number(expStr) : 0;
    const skill = skillStr ? Number(skillStr) : 3;

    return { first, last, weight, birthdate, experienceYears, skill };
  }

  async function importCsv() {
    setImportMsg("");

    if (!file) { setImportMsg("Choose a CSV file first."); return; }
    const teamId = importTeamId || undefined;
    const teamName = (!teamId && importNewTeamName.trim()) ? importNewTeamName.trim() : undefined;
    const teamSymbol = (!teamId && importNewTeamSymbol.trim())
      ? importNewTeamSymbol.trim()
      : undefined;

    if (!teamId && !teamName) {
      setImportMsg("Select an existing team OR enter a new team name.");
      return;
    }
    if (!teamId && !teamSymbol) {
      setImportMsg("Team symbol is required when creating a new team.");
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);

    if (parsed.headers.length === 0) {
      setImportMsg("CSV looks empty.");
      return;
    }

    // Convert rows -> API payload
    const wrestlers = parsed.data
      .map(normalizeRow)
      .filter(w => w.first && w.last && Number.isFinite(w.weight) && w.weight > 0 && w.birthdate)
      .map(w => ({
        first: w.first,
        last: w.last,
        weight: Number(w.weight),
        birthdate: w.birthdate,
        experienceYears: Number.isFinite(w.experienceYears) ? Math.max(0, Math.floor(w.experienceYears)) : 0,
        skill: Number.isFinite(w.skill) ? Math.min(5, Math.max(0, Math.floor(w.skill))) : 3,
      }));

    if (wrestlers.length === 0) {
      setImportMsg("No valid wrestler rows found. Expected columns: first,last,weight,birthdate (YYYY-MM-DD). Optional: experienceYears,skill.");
      return;
    }

    setImportMsg("Importing...");
    const res = await fetch("/api/teams/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, teamName, teamSymbol, wrestlers }),
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
    setImportNewTeamName("");
    setImportTeamId("");
    setImportNewTeamSymbol("");
    await load();
    setTimeout(() => setImportMsg(""), 2000);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <a href="/">Home</a>
        <button onClick={async () => { await signOut({ redirect: false }); window.location.href = "/auth/signin"; }}>Sign out</button>
      </div>
      <h2>Teams</h2>

      {role === "ADMIN" ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Team name" />
          <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="Symbol (2-4)" style={{ width: 120 }} />
          <button onClick={addTeam}>Add</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 16 }}>
          Team management is handled by league admins.
        </div>
      )}

      <ul>
        {teams.map(t => (
          <li key={t.id}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {t.hasLogo ? (
                <img src={`/api/teams/${t.id}/logo/file`} alt={`${t.name} logo`} style={{ width: 28, height: 28, objectFit: "contain" }} />
              ) : null}
              <a href={`/teams/${t.id}`} style={{ color: t.color }}>{t.symbol}</a>
            </div>
          </li>
        ))}
      </ul>

      <hr style={{ margin: "18px 0" }} />

      {role === "ADMIN" && (
        <>
          <h3>Import roster from CSV</h3>
          <div style={{ maxWidth: 900 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Existing team</label>
            <select value={importTeamId} onChange={e => setImportTeamId(e.target.value)} style={{ width: "100%" }}>
              {teamOptions.map(t => (
                <option key={t.id || "none"} value={t.id}>{t.id ? t.symbol : t.name}</option>
              ))}
            </select>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              If you choose an existing team, the new team name below is ignored.
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Or create new team</label>
            <input
              value={importNewTeamName}
              onChange={e => setImportNewTeamName(e.target.value)}
              placeholder="New team name (optional)"
              style={{ width: "100%" }}
              disabled={!!importTeamId}
            />
            <input
              value={importNewTeamSymbol}
              onChange={e => setImportNewTeamSymbol(e.target.value)}
              placeholder="Team symbol (2-4)"
              style={{ width: "100%", marginTop: 6 }}
              disabled={!!importTeamId}
            />
          </div>

          <div style={{ gridColumn: "1 / span 2" }}>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => onChooseFile(e.target.files?.[0] ?? null)}
            />
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
              Required columns: <b>first,last,weight,birthdate</b> (YYYY-MM-DD). Optional: <b>experienceYears,skill</b>.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <button onClick={importCsv} disabled={!file}>
            Import CSV
          </button>
          {importMsg && <span style={{ marginLeft: 10 }}>{importMsg}</span>}
        </div>

        {preview && (
          <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
              Preview (first {preview.rows.length} rows). Headers: {preview.headers.join(", ")}
            </div>
            <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {preview.headers.slice(0, 8).map(h => (
                    <th key={h} align="left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #eee" }}>
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
          </div>
        </>
      )}

      <p style={{ marginTop: 16 }}>
        <a href="/">Back</a>
      </p>
    </main>
  );
}
