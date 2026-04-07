"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";

import CreateUserModal from "@/app/admin/components/CreateUserModal";
import { adjustTeamTextColor } from "@/lib/contrastText";

type TeamRow = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  hasLogo: boolean;
  headCoachId: string | null;
  headCoach: { id: string; username: string; name?: string | null } | null;
};

type CoachRow = {
  id: string;
  username: string;
  name?: string | null;
  teamId: string | null;
  teamSymbol: string | null;
  headCoachTeamId: string | null;
  headCoachTeamSymbol: string | null;
};

type ImportRow = {
  rowNumber: number;
  team: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
};

type ImportResultRow = {
  rowNumber: number;
  team: string;
  coachName: string;
  email: string | null;
  username: string | null;
  temporaryPassword: string | null;
  status: "created" | "existing" | "error";
  note: string;
};

type MessageTone = "error" | "success";

function formatDisplayName(person?: { username?: string | null; name?: string | null } | null) {
  if (!person) return "None";
  const name = person.name?.trim();
  return name ? `${name} (@${person.username})` : `@${person.username}`;
}

function formatCoachLabel(coach: CoachRow) {
  return formatDisplayName(coach);
}

function formatCurrentHeadCoach(team: TeamRow) {
  return formatDisplayName(team.headCoach);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  const pushCell = () => { row.push(cur); cur = ""; };
  const pushRow = () => {
    if (row.length === 1 && row[0].trim() === "") { row = []; return; }
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\"") {
      const next = text[i + 1];
      if (inQuotes && next === "\"") { cur += "\""; i += 1; } else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      pushCell();
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushCell();
      pushRow();
    } else {
      cur += ch;
    }
  }
  pushCell();
  if (row.length) pushRow();
  if (rows.length === 0) return { headers: [] as string[], data: [] as Record<string, string>[] };
  const headers = rows[0].map((value) => value.trim());
  const data = rows.slice(1).filter((values) => values.some((value) => value.trim() !== "")).map((values) => {
    const obj: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) obj[headers[index]] = (values[index] ?? "").trim();
    return obj;
  });
  return { headers, data };
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeCellValue(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

async function parseImportFile(file: File) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return { headers: [] as string[], data: [] as Record<string, string>[] };
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: "" });
    const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const data = rawRows.map((rawRow) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(rawRow)) normalized[key] = normalizeCellValue(value);
      return normalized;
    });
    return { headers, data };
  }
  return parseCsv(await file.text());
}

function normalizeImportRow(raw: Record<string, string>, rowNumber: number): ImportRow {
  const normalizedMap = Object.entries(raw).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[normalizeKey(key)] = value.trim();
    return acc;
  }, {});
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const direct = raw[key];
      if (typeof direct === "string" && direct.trim() !== "") return direct.trim();
      const normalized = normalizedMap[normalizeKey(key)];
      if (typeof normalized === "string" && normalized.trim() !== "") return normalized.trim();
    }
    return "";
  };
  return {
    rowNumber,
    team: get("team", "Team", "team symbol", "Team Symbol", "symbol", "Symbol", "team name", "Team Name", "school"),
    firstName: get("first", "First", "first name", "First Name", "firstname"),
    lastName: get("last", "Last", "last name", "Last Name", "lastname"),
    username: get("username", "Username", "user name", "User Name", "login"),
    email: get("email", "Email", "e-mail", "E-mail"),
    phone: get("phone", "Phone", "mobile", "Mobile", "cell", "Cell"),
    password: get("password", "Password", "temporary password", "Temporary Password", "temp password", "Temp Password"),
  };
}

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

function downloadImportResults(rows: ImportResultRow[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const csvRows = [["Team", "Coach", "Email", "Username", "Temporary Password", "Note"], ...rows.map((row) => [
    row.team,
    row.coachName,
    row.email ?? "",
    row.username ?? "",
    row.temporaryPassword ?? "",
    row.note,
  ])];
  const csvContent = csvRows.map((row) => row.map((value) => csvEscape(value)).join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `head_coach_import_${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function HeadCoachesSection() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [selectedCoachByTeam, setSelectedCoachByTeam] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [createUserTeam, setCreateUserTeam] = useState<TeamRow | null>(null);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<MessageTone>("error");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<ImportRow[]>([]);
  const [importRowErrors, setImportRowErrors] = useState<string[]>([]);
  const [sharedPassword, setSharedPassword] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importMessageTone, setImportMessageTone] = useState<MessageTone>("error");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResultRow[]>([]);

  function setStatusMessage(nextMessage: string, tone: MessageTone) {
    setMsg(nextMessage);
    setMsgTone(tone);
  }

  function resetImportState() {
    setImportFile(null);
    setImportRows([]);
    setImportPreviewRows([]);
    setImportRowErrors([]);
    setSharedPassword("");
    setImportMessage("");
    setImportMessageTone("error");
    setImportResults([]);
  }

  function applyHeadCoachUpdate(teamId: string, coachId: string | null, headCoach: TeamRow["headCoach"]) {
    setTeams((prev) => prev.map((team) => {
      if (coachId && team.id !== teamId && team.headCoachId === coachId) return { ...team, headCoachId: null, headCoach: null };
      if (team.id !== teamId) return team;
      return { ...team, headCoachId: coachId, headCoach };
    }));
    setSelectedCoachByTeam((prev) => {
      const next = { ...prev };
      if (coachId) {
        for (const team of teams) {
          if (team.id !== teamId && team.headCoachId === coachId) next[team.id] = "";
        }
      }
      next[teamId] = coachId ?? "";
      return next;
    });
  }

  async function load(options?: { silent?: boolean }) {
    if (!options?.silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/head-coaches");
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMessage(typeof payload?.error === "string" ? payload.error : "Unable to load head coaches.", "error");
        return;
      }
      const nextTeams = Array.isArray(payload?.teams) ? payload.teams as TeamRow[] : [];
      const nextCoaches = Array.isArray(payload?.coaches) ? payload.coaches as CoachRow[] : [];
      setTeams(nextTeams);
      setCoaches(nextCoaches);
      setSelectedCoachByTeam(Object.fromEntries(nextTeams.map((team) => [team.id, team.headCoachId ?? ""])));
    } catch {
      setStatusMessage("Unable to load head coaches.", "error");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!showImportModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !importing) setShowImportModal(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [importing, showImportModal]);

  async function saveHeadCoach(teamId: string, coachId: string, previousCoachId: string) {
    setMsg("");
    setSavingTeamId(teamId);
    try {
      const res = await fetch("/api/admin/head-coaches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, coachId: coachId || null }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMessage(typeof payload?.error === "string" ? payload.error : "Unable to update head coach.", "error");
        setSelectedCoachByTeam((prev) => ({ ...prev, [teamId]: previousCoachId }));
        return;
      }
      applyHeadCoachUpdate(teamId, payload?.headCoachId ?? null, payload?.headCoach ?? null);
      setStatusMessage("Head coach updated.", "success");
    } catch {
      setStatusMessage("Unable to update head coach.", "error");
      setSelectedCoachByTeam((prev) => ({ ...prev, [teamId]: previousCoachId }));
    } finally {
      setSavingTeamId(null);
    }
  }

  async function chooseImportFile(file: File | null) {
    setImportFile(file);
    setImportRows([]);
    setImportPreviewRows([]);
    setImportRowErrors([]);
    setImportMessage("");
    setImportResults([]);
    if (!file) return;
    try {
      const parsed = await parseImportFile(file);
      if (parsed.headers.length === 0) {
        setImportMessage("File looks empty.");
        setImportMessageTone("error");
        return;
      }
      const normalizedRows = parsed.data.map((row, index) => normalizeImportRow(row, index + 2));
      const nextRowErrors = normalizedRows.flatMap((row) => {
        const issues: string[] = [];
        if (!row.team) issues.push(`Row ${row.rowNumber}: missing team.`);
        if (!row.firstName) issues.push(`Row ${row.rowNumber}: missing first name.`);
        if (!row.lastName) issues.push(`Row ${row.rowNumber}: missing last name.`);
        return issues;
      });
      setImportRows(normalizedRows);
      setImportPreviewRows(normalizedRows.slice(0, 8));
      setImportRowErrors(nextRowErrors);
      if (nextRowErrors.length > 0) {
        setImportMessage("Fix the listed rows before importing.");
        setImportMessageTone("error");
        return;
      }
      setImportMessage(`Ready to import ${normalizedRows.length} head coach row${normalizedRows.length === 1 ? "" : "s"}.`);
      setImportMessageTone("success");
    } catch {
      setImportMessage("Unable to read that file.");
      setImportMessageTone("error");
    }
  }

  async function importHeadCoaches() {
    if (importRows.length === 0 || importRowErrors.length > 0) return;
    setImporting(true);
    setImportMessage("");
    try {
      const res = await fetch("/api/admin/head-coaches/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows, sharedPassword }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setImportMessage(typeof payload?.error === "string" ? payload.error : "Unable to import head coaches.");
        setImportMessageTone("error");
        return;
      }
      const results = Array.isArray(payload?.results) ? payload.results as ImportResultRow[] : [];
      const created = Number(payload?.summary?.created ?? 0);
      const assignedExisting = Number(payload?.summary?.assignedExisting ?? 0);
      const errors = Number(payload?.summary?.errors ?? 0);
      setImportResults(results);
      downloadImportResults(results);
      setImportMessage(`Import complete. Created ${created}, assigned existing ${assignedExisting}, errors ${errors}.`);
      setImportMessageTone(errors > 0 ? "error" : "success");
      setStatusMessage(
        errors > 0
          ? `Head coach import finished with ${errors} error${errors === 1 ? "" : "s"}.`
          : `Imported ${created + assignedExisting} head coach${created + assignedExisting === 1 ? "" : "es"}.`,
        errors > 0 ? "error" : "success",
      );
      await load({ silent: true });
    } catch {
      setImportMessage("Unable to import head coaches.");
      setImportMessageTone("error");
    } finally {
      setImporting(false);
    }
  }

  const canImport = importRows.length > 0 && importRowErrors.length === 0 && !importing;

  return (
    <div className="admin-card" style={{ width: "fit-content", maxWidth: "100%" }}>
      <div className="admin-header" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 24 }}>
          <h3 style={{ margin: 0 }}>Head Coaches</h3>
          <span style={{ minWidth: 220, color: msgTone === "error" ? "#c62828" : "#256029", fontSize: 16, fontWeight: 700 }}>
            {msg}
          </span>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          onClick={() => {
            resetImportState();
            setShowImportModal(true);
          }}
        >
          Import Head Coaches
        </button>
      </div>
      <div className="admin-table" style={{ width: "fit-content", maxWidth: "100%" }}>
        <table className="head-coaches-table" cellPadding={0} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 72 }}>Symbol</th>
              <th style={{ width: 72 }}>Logo</th>
              <th>Team</th>
              <th>Current Head Coach</th>
              <th>Assign Head Coach</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Loading...</td></tr>
            ) : (
              <>
                {teams.map((team) => {
                  const selectedCoachId = selectedCoachByTeam[team.id] ?? "";
                  const availableCoaches = coaches.filter((coach) => coach.teamId === team.id);
                  return (
                    <tr key={team.id}>
                      <td style={{ width: 72, whiteSpace: "nowrap", textAlign: "center", color: adjustTeamTextColor(team.color), fontWeight: 700 }}>
                        {team.symbol}
                      </td>
                      <td style={{ width: 72 }}>
                        <div className="logo-cell">
                          {team.hasLogo ? (
                            <img src={`/api/teams/${team.id}/logo/file`} alt={`${team.name} logo`} className="admin-team-logo" style={{ width: 32, height: 32 }} />
                          ) : (
                            <span className="admin-muted">No logo</span>
                          )}
                        </div>
                      </td>
                      <td style={{ width: 320, minWidth: 320, maxWidth: 320 }}>
                        <div
                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: adjustTeamTextColor(team.color), fontWeight: 700 }}
                          title={team.name}
                        >
                          {team.name}
                        </div>
                      </td>
                      <td style={{ width: 300, minWidth: 300, maxWidth: 300 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={formatCurrentHeadCoach(team)}>
                          {formatCurrentHeadCoach(team)}
                        </div>
                      </td>
                      <td style={{ width: 320, minWidth: 320 }}>
                        <select
                          value={selectedCoachId}
                          onChange={(event) => {
                            const nextCoachId = event.target.value;
                            const previousCoachId = selectedCoachId;
                            setSelectedCoachByTeam((prev) => ({ ...prev, [team.id]: nextCoachId }));
                            void saveHeadCoach(team.id, nextCoachId, previousCoachId);
                          }}
                          disabled={savingTeamId === team.id}
                        >
                          <option value="">None</option>
                          {availableCoaches.map((coach) => (
                            <option key={coach.id} value={coach.id}>{formatCoachLabel(coach)}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ verticalAlign: "middle" }}>
                        <div className="admin-actions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            className="admin-btn admin-btn-ghost teams-action-btn"
                            onClick={() => setCreateUserTeam(team)}
                            disabled={savingTeamId === team.id}
                          >
                            Create New Account
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {teams.length === 0 && <tr><td colSpan={6}>No teams yet.</td></tr>}
              </>
            )}
          </tbody>
        </table>
      </div>
      <CreateUserModal
        isOpen={Boolean(createUserTeam)}
        teams={teams.map((team) => ({ id: team.id, name: team.name, symbol: team.symbol }))}
        defaultTeamId={createUserTeam?.id ?? ""}
        defaultRole="COACH"
        title={createUserTeam ? `Create new account for head coach of ${createUserTeam.name}` : "Create New User"}
        lockTeamSelection
        lockRoleSelection
        onClose={() => setCreateUserTeam(null)}
        onCreated={async (user) => {
          if (!createUserTeam?.id || !user.id) return;
          const res = await fetch("/api/admin/head-coaches", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId: createUserTeam.id, coachId: user.id }),
          });
          const payload = await res.json().catch(() => null);
          if (!res.ok) {
            setStatusMessage(typeof payload?.error === "string" ? payload.error : "Account created, but head coach assignment failed.", "error");
            setCoaches((prev) => prev.some((coach) => coach.id === user.id) ? prev : [
              ...prev,
              { id: user.id, username: user.username ?? "", name: user.name ?? null, teamId: createUserTeam.id, teamSymbol: createUserTeam.symbol, headCoachTeamId: null, headCoachTeamSymbol: null },
            ]);
            return;
          }
          setCoaches((prev) => prev.some((coach) => coach.id === user.id) ? prev : [
            ...prev,
            { id: user.id, username: user.username ?? "", name: user.name ?? null, teamId: createUserTeam.id, teamSymbol: createUserTeam.symbol, headCoachTeamId: createUserTeam.id, headCoachTeamSymbol: createUserTeam.symbol },
          ]);
          applyHeadCoachUpdate(createUserTeam.id, payload?.headCoachId ?? user.id, payload?.headCoach ?? null);
          setStatusMessage("Account created and assigned as head coach.", "success");
        }}
      />
      {showImportModal && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="head-coach-import-title"
          onClick={() => { if (!importing) setShowImportModal(false); }}
        >
          <div className="admin-modal" style={{ width: "min(980px, 100%)" }} onClick={(event) => event.stopPropagation()}>
            <h4 id="head-coach-import-title">Import head coaches from CSV, XLS, or XLSX</h4>
            <div style={{ padding: 14, display: "grid", gap: 12, overflow: "auto" }}>
              <p className="admin-muted" style={{ fontSize: 14, margin: 0 }}>
                Required columns: <b>Team symbol</b>, <b>first name</b>, <b>last name</b>. Optional columns: <b>username</b>, <b>email</b>, <b>phone</b>, <b>password</b>.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <span>Head coach file</span>
                  <input
                    type="file"
                    accept=".csv,text/csv,.xls,application/vnd.ms-excel,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => { void chooseImportFile(event.currentTarget.files?.[0] ?? null); }}
                  />
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <span>Shared temporary password (optional)</span>
                  <input
                    placeholder="Used only when a row does not include its own password"
                    value={sharedPassword}
                    onChange={(event) => setSharedPassword(event.target.value)}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
              </div>
              {importFile ? <div className="admin-muted" style={{ fontSize: 13 }}>File: {importFile.name}</div> : null}
              <p style={{ margin: 0, fontWeight: 700, color: importMessageTone === "error" ? "#b00020" : "#256029", minHeight: 20 }}>
                {importMessage || "\u00A0"}
              </p>
              {importPreviewRows.length > 0 && (
                <div style={{ border: "1px solid #d5dbe2", borderRadius: 8, padding: 10, background: "#f7f9fb" }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview ({importRows.length} row{importRows.length === 1 ? "" : "s"})</div>
                  <div style={{ overflow: "auto", maxHeight: 260 }}>
                    <table>
                      <thead>
                        <tr><th>Row</th><th>Team</th><th>First</th><th>Last</th><th>Username</th><th>Email</th></tr>
                      </thead>
                      <tbody>
                        {importPreviewRows.map((row) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td>{row.team || <span className="admin-muted">-</span>}</td>
                            <td>{row.firstName || <span className="admin-muted">-</span>}</td>
                            <td>{row.lastName || <span className="admin-muted">-</span>}</td>
                            <td>{row.username || <span className="admin-muted">auto</span>}</td>
                            <td>{row.email || <span className="admin-muted">-</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {importRowErrors.length > 0 && (
                <div style={{ border: "1px solid #d5dbe2", borderRadius: 8, padding: 10, background: "#f7f9fb" }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Fix these rows</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: "#b00020" }}>
                    {importRowErrors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                </div>
              )}
              {importResults.length > 0 && (
                <div style={{ border: "1px solid #d5dbe2", borderRadius: 8, padding: 10, background: "#f7f9fb" }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Import results</div>
                  <div style={{ overflow: "auto", maxHeight: 280 }}>
                    <table>
                      <thead>
                        <tr><th>Row</th><th>Team</th><th>Coach</th><th>Username</th><th>Password</th><th>Note</th></tr>
                      </thead>
                      <tbody>
                        {importResults.map((row) => (
                          <tr key={`${row.rowNumber}-${row.team}-${row.username ?? "none"}`}>
                            <td>{row.rowNumber}</td>
                            <td>{row.team}</td>
                            <td>{row.coachName}</td>
                            <td>{row.username ?? <span className="admin-muted">-</span>}</td>
                            <td>{row.temporaryPassword ?? <span className="admin-muted">existing</span>}</td>
                            <td style={{ color: row.status === "error" ? "#b00020" : undefined }}>{row.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <details>
                <summary>Example CSV</summary>
                <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{`Team symbol,First Name,Last Name,Username,Email
WC,Glenn,Fernandes,glennfernandes3,glenn@example.com
NOR,Jase,Frack,,jase@example.com
PB,Bradley,McClister,,,`}</pre>
              </details>
            </div>
            <div className="admin-modal-actions">
              <button className="admin-btn admin-btn-ghost" type="button" onClick={() => setShowImportModal(false)} disabled={importing}>
                Close
              </button>
              <button className="admin-btn" type="button" onClick={() => void importHeadCoaches()} disabled={!canImport}>
                {importing ? "Importing..." : "Import Head Coaches"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .head-coaches-table th,
        .head-coaches-table td {
          padding: 4px 6px;
          vertical-align: middle;
          line-height: 1.15;
        }
      `}</style>
    </div>
  );
}
