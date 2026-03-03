"use client";

import { useEffect, useMemo, useState } from "react";

import AppHeader from "@/components/AppHeader";

type Child = {
  id: string;
  guid: string;
  first: string;
  last: string;
  teamId: string;
  teamName: string;
  teamSymbol?: string;
  teamColor?: string;
  active?: boolean;
  birthdate?: string;
  weight?: number;
  experienceYears?: number;
};

type Match = {
  boutId: string;
  childId: string;
  corner: "red" | "green";
  opponentId: string;
  opponentName: string;
  opponentTeam: string;
  opponentTeamColor?: string;
  mat: number | null;
  order: number | null;
  result: {
    winnerId: string | null;
    type: string | null;
    score: string | null;
    period: number | null;
    time: string | null;
  };
};
type MatchWithMeet = Match & { meetName: string; meetDate: string };

type MeetGroup = {
  meet: { id: string; name: string; date: string; location?: string | null; status?: string | null };
  matches: Match[];
};

type TeamWrestler = {
  id: string;
  guid: string;
  first: string;
  last: string;
  teamId: string;
  teamName: string;
  teamSymbol?: string;
  teamColor?: string;
  weight?: number;
  experienceYears?: number;
};

type Profile = {
  username: string;
  name: string | null;
  role: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
  team: string | null;
};

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const LAST_NAME_MATCH_THRESHOLD = 0.82;

const normalizeNameToken = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
const formatLastFirstName = (first?: string | null, last?: string | null) => {
  const firstName = (first ?? "").trim();
  const lastName = (last ?? "").trim();
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  return lastName || firstName;
};

const extractLastNameCandidates = (fullName?: string | null) => {
  if (!fullName) return [] as string[];
  const rawTokens = fullName
    .trim()
    .split(/\s+/)
    .map(normalizeNameToken)
    .filter(Boolean);
  if (rawTokens.length === 0) return [] as string[];
  const tokens = [...rawTokens];
  if (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  if (tokens.length === 0) return [] as string[];
  const last = tokens[tokens.length - 1];
  const candidates = [last];
  if (tokens.length >= 2) {
    candidates.push(`${tokens[tokens.length - 2]}${last}`);
  }
  return Array.from(new Set(candidates));
};

const levenshteinDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
};

const lastNameSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
    return 0.92;
  }
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const ratio = 1 - dist / maxLen;
  if (dist <= 1 && maxLen >= 5) return Math.max(ratio, 0.88);
  if (dist === 2 && maxLen >= 7) return Math.max(ratio, 0.8);
  return ratio;
};

export default function ParentPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [meetGroups, setMeetGroups] = useState<MeetGroup[]>([]);
  const [teamWrestlers, setTeamWrestlers] = useState<TeamWrestler[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const [profileRes, matchesRes, teamWrestlersRes] = await Promise.all([
      fetch("/api/parent/profile"),
      fetch("/api/parent/matches"),
      fetch("/api/parent/children/candidates"),
    ]);
    const profileJson = await profileRes.json().catch(() => null);
    const matchesJson = await matchesRes.json().catch(() => null);
    const teamWrestlersJson = await teamWrestlersRes.json().catch(() => []);
    setProfile(profileRes.ok ? profileJson : null);
    setChildren(matchesJson?.children ?? []);
    setMeetGroups(matchesJson?.meets ?? []);
    setTeamWrestlers(teamWrestlersRes.ok && Array.isArray(teamWrestlersJson) ? teamWrestlersJson : []);
  }

  function getLikelyWrestlerIds() {
    const candidates = extractLastNameCandidates(profile?.name ?? null);
    if (candidates.length === 0) return [] as string[];
    return teamWrestlers
      .filter((wrestler) => {
        const wrestlerLast = normalizeNameToken(wrestler.last);
        if (!wrestlerLast) return false;
        const score = candidates.reduce((best, candidate) => {
          const next = lastNameSimilarity(candidate, wrestlerLast);
          return next > best ? next : best;
        }, 0);
        return score >= LAST_NAME_MATCH_THRESHOLD;
      })
      .map((wrestler) => wrestler.id);
  }

  function openPicker() {
    const existing = children.map((child) => child.id);
    const suggested = existing.length > 0 ? existing : getLikelyWrestlerIds();
    setPickerSelection(Array.from(new Set(suggested)));
    setPickerOpen(true);
    setMsg("");
  }

  function togglePickerWrestler(wrestlerId: string) {
    setPickerSelection((prev) => (
      prev.includes(wrestlerId)
        ? prev.filter((id) => id !== wrestlerId)
        : [...prev, wrestlerId]
    ));
  }

  async function savePickerSelection(nextIdsInput?: string[]) {
    const nextIds = Array.from(new Set(nextIdsInput ?? pickerSelection));
    const currentIds = children.map((child) => child.id);
    const currentSet = new Set(currentIds);
    const nextSet = new Set(nextIds);
    const toAdd = nextIds.filter((id) => !currentSet.has(id));
    const toRemove = currentIds.filter((id) => !nextSet.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) {
      setPickerOpen(false);
      return;
    }

    setPickerSaving(true);
    setMsg("");
    try {
      for (const wrestlerId of toAdd) {
        const res = await fetch("/api/parent/children", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wrestlerId }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error ?? "Unable to add wrestler.");
        }
      }
      for (const wrestlerId of toRemove) {
        const res = await fetch("/api/parent/children", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wrestlerId }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error ?? "Unable to remove wrestler.");
        }
      }
      setPickerOpen(false);
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to update wrestlers.");
    } finally {
      setPickerSaving(false);
    }
  }

  function applySuggestedSelection() {
    if (pickerSuggestedWrestlerIds.length === 0 || pickerSaving) return;
    void savePickerSelection(pickerSuggestedWrestlerIds);
  }

  useEffect(() => { void load(); }, []);

  const childMap = useMemo(() => new Map(children.map(c => [c.id, c])), [children]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const upcomingMeets = meetGroups.filter(g => g.meet.status === "PUBLISHED" && new Date(g.meet.date) >= today);
  const daysPerYear = 365;
  const sortedChildren = useMemo(() => {
    return [...children].sort((a, b) => {
      const aName = `${a.first} ${a.last}`.trim().toLowerCase();
      const bName = `${b.first} ${b.last}`.trim().toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [children]);
  const pastMatchesByChild = useMemo(() => {
    const map = new Map<string, MatchWithMeet[]>();
    const childSet = new Set(children.map(c => c.id));
    for (const group of meetGroups) {
      const meetDate = new Date(group.meet.date);
      if (meetDate >= today) continue;
      for (const match of group.matches) {
        if (!childSet.has(match.childId)) continue;
        const entry: MatchWithMeet = {
          ...match,
          meetName: group.meet.name || "Meet",
          meetDate: group.meet.date,
        };
        const list = map.get(match.childId) ?? [];
        list.push(entry);
        map.set(match.childId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.meetDate).getTime() - new Date(b.meetDate).getTime());
    }
    return map;
  }, [children, meetGroups, today]);

  const dashboardTitle = profile?.name ? `${profile.name}'s Wrestlers` : "My Wrestlers";
  const pickerSuggestedWrestlerIds = useMemo(() => getLikelyWrestlerIds(), [teamWrestlers, profile?.name]);
  const pickerSuggestedNames = useMemo(() => {
    const byId = new Map(teamWrestlers.map((w) => [w.id, `${w.first} ${w.last}`.trim()]));
    return pickerSuggestedWrestlerIds.map((id) => byId.get(id)).filter((value): value is string => Boolean(value));
  }, [pickerSuggestedWrestlerIds, teamWrestlers]);
  const pickerOwnerLabel = (profile?.name ?? profile?.username ?? "my account").trim();


  function nameChip(label: string, team: string | undefined, color?: string) {
    const teamLabel = team ? ` (${team})` : "";
    return (
      <span style={{ color: "#111111", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15 }}>
        <span>{label}{teamLabel}</span>
        <span style={{ width: 12, height: 12, background: color ?? "#000000", display: "inline-block" }} />
      </span>
    );
  }

  function ageYears(birthdate?: string) {
    if (!birthdate) return null;
    const bDate = new Date(birthdate);
    if (Number.isNaN(bDate.getTime())) return null;
    const days = Math.floor((today.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
    return days / daysPerYear;
  }

  function boutNumber(mat?: number | null, order?: number | null) {
    if (!mat || !order) return "";
    const suffix = String(order).padStart(2, "0");
    return `${mat}${suffix}`;
  }
  function formatMatchResult(match: Match) {
    const result = match.result;
    const outcome = result.winnerId
      ? (result.winnerId === match.childId ? "W" : "L")
      : "";
    const score = result.score?.trim() ?? "";
    const time = result.time?.trim() ?? "";
    const rawType = result.type?.trim().toUpperCase() ?? "";
    const type =
      rawType === "PIN" ? "FALL"
      : rawType === "MAJOR" ? "MAJ"
      : rawType;

    const coreParts: string[] = [];
    if (outcome) coreParts.push(outcome);

    if (type === "FALL") {
      if (time) coreParts.push(time);
      else if (score) coreParts.push(score);
      const core = coreParts.join(" ").trim();
      return core ? `${core} (pin)` : "pin";
    }

    if (score) coreParts.push(score);
    if (time) coreParts.push(time);
    const core = coreParts.join(" ").trim();

    if (type === "MAJ") return core ? `${core} (major)` : "major";
    if (type === "TF") return core ? `${core} (TF)` : "TF";
    if (type === "FOR") return core ? `${core} (forfeit)` : "forfeit";
    if (type === "DQ") return core ? `${core} (DQ)` : "DQ";
    if (type === "DEC" || !type) return core;
    return core ? `${core} (${type})` : type;
  }
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    // Current page
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  return (
    <main className="parent">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --accent: #1e88e5;
          --line: #d5dbe2;
        }
        .parent {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .parent a {
          color: var(--ink);
          text-decoration: none;
          font-weight: 600;
        }
        .parent a:hover {
          color: var(--accent);
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          border-bottom: 1px solid var(--line);
          padding-bottom: 12px;
          margin-bottom: 12px;
        }
        .topbar .nav {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
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
        .nav-btn:hover {
          background: #f7f9fb;
        }
        h2, h3 {
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .panel {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px;
          background: var(--card);
          box-shadow: 0 6px 16px rgba(0,0,0,0.06);
        }
        .match-history {
          margin: 16px 0 0;
          max-width: 1120px;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #dfe4ea;
          padding: 20px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.08);
        }
        .match-history .panel {
          margin-bottom: 14px;
          box-shadow: none;
          border-color: rgba(29, 35, 43, 0.1);
        }
        .muted {
          color: var(--muted);
        }
        input, select, textarea, button {
          font-family: inherit;
        }
        input, select, textarea {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px 8px;
        }
        .coach-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          z-index: 1200;
        }
        .coach-modal {
          width: min(560px, 100%);
          max-height: calc(100vh - 32px);
          overflow: hidden;
          border-radius: 10px;
          border: 1px solid var(--line);
          background: #fff;
          display: flex;
          flex-direction: column;
        }
        .coach-modal h4 {
          margin: 0;
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
          font-size: 18px;
        }
        .coach-modal-roster {
          padding: 10px 16px;
          overflow: auto;
          display: grid;
          gap: 4px;
          max-height: 50vh;
        }
        .coach-modal-option {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          font-size: 14px;
          line-height: 1.15;
        }
        .coach-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          border-top: 1px solid var(--line);
          padding: 12px 16px;
        }
        .picker-btn {
          border: 1px solid #cfd8e3;
          border-radius: 6px;
          background: #fff;
          padding: 7px 12px;
          font-weight: 700;
        }
        .picker-btn.primary {
          background: #1e88e5;
          border-color: #1e88e5;
          color: #fff;
        }
        .coach-btn,
        .coach-btn-secondary {
          border: 0;
          border-radius: 6px;
          font-weight: 600;
          padding: 10px 14px;
          cursor: pointer;
        }
        .coach-btn {
          background: var(--accent);
          color: #fff;
        }
        .coach-btn-secondary {
          background: #f2f5f8;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        .coach-btn:disabled,
        .coach-btn-secondary:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .suggestion-line {
          font-size: 16px;
          color: var(--ink);
        }
        .suggestion-label {
          font-weight: 600;
        }
        .suggestion-names {
          font-weight: 800;
        }
      `}</style>
      <AppHeader links={headerLinks} />

      <h2>{dashboardTitle}</h2>

      {children.length === 0 && <div>No wrestlers linked yet.</div>}
      {children.length > 0 && (
        <table cellPadding={10} style={{ borderCollapse: "collapse"}}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="right">Age</th>
              <th align="right">Wt</th>
              <th align="right">Exp</th>
            </tr>
          </thead>
          <tbody>
            {children.map(c => (
              <tr key={c.id} style={{ borderTop: "1px solid #ddd" }}>
                <td>{nameChip(`${c.first} ${c.last}`, c.teamSymbol ?? c.teamName, c.teamColor ?? "#000000")}</td>
                <td align="right">{ageYears(c.birthdate)?.toFixed(1) ?? ""}</td>
                <td align="right">{c.weight ?? ""}</td>
                <td align="right">{c.experienceYears ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: "grid", gap: 4, maxWidth: 720, marginTop: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {children.length > 0 ? (
            <span className="muted">Pick from your team roster.</span>
          ) : pickerSuggestedNames.length > 0 ? (
            <span className="suggestion-line">
              <span className="suggestion-label">Suggested:</span>{" "}
              <span className="suggestion-names">{pickerSuggestedNames.join(", ")}</span>
            </span>
          ) : (
            <span className="muted">Pick from your team roster. Suggested names use fuzzy last-name matching.</span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {children.length === 0 && pickerSuggestedNames.length > 0 && (
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={applySuggestedSelection}
                disabled={pickerSaving}
              >
                That's right
              </button>
            )}
            <button className="picker-btn primary" onClick={openPicker}>Select Wrestlers</button>
          </div>
        </div>
        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </div>

      <h2 style={{ marginTop: 24 }}>Upcoming Meets</h2>
      {upcomingMeets.length === 0 && <div>No upcoming meets yet.</div>}
      {upcomingMeets.map(group => (
        <div key={group.meet.id} className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{group.meet.name}</h3>
          </div>
          <div className="muted" style={{ marginBottom: 8 }}>
            {new Date(group.meet.date).toISOString().slice(0, 10)}{" "}
            {group.meet.location ? `• ${group.meet.location}` : "• Location TBD"}
          </div>
          {group.matches.length === 0 && <div>No scheduled matches yet.</div>}
          {group.matches.length > 0 && (
          <table cellPadding={10} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Wrestler</th>
                <th align="left">Bout #</th>
                <th align="left">Opponent</th>
                <th align="left">Result</th>
              </tr>
            </thead>
            <tbody>
              {group.matches.map(match => {
                const child = childMap.get(match.childId);
                return (
                  <tr key={match.boutId} style={{ borderTop: "1px solid #ddd" }}>
                      <td>
                        {nameChip(
                          `${child?.first ?? ""} ${child?.last ?? ""}`.trim(),
                          child?.teamSymbol ?? child?.teamName,
                          child?.teamColor ?? "#000000"
                        )}
                      </td>
                      <td>{boutNumber(match.mat, match.order)}</td>
                      <td>
                        {nameChip(match.opponentName, match.opponentTeam, match.opponentTeamColor ?? "#000000")}
                      </td>
                      <td>{formatMatchResult(match)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <h2 style={{ marginTop: 24 }}>Match History</h2>
      <div className="match-history">
        {sortedChildren.map(child => {
        const history = pastMatchesByChild.get(child.id) ?? [];
        return (
          <div key={child.id} className="panel" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>{child.first} {child.last}</h3>
                {child.teamSymbol || child.teamName ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    {child.teamSymbol ?? child.teamName}
                  </div>
                ) : null}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {history.length === 0 ? "No past matches yet" : `${history.length} match${history.length === 1 ? "" : "es"}`}
              </div>
            </div>
            {history.length === 0 ? (
              <div style={{ marginTop: 8 }}>No matches recorded.</div>
            ) : (
              <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
                <thead>
                  <tr>
                    <th align="left">Meet</th>
                    <th align="left">Date</th>
                    <th align="left">Opponent</th>
                    <th align="left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(match => (
                    <tr key={`${match.boutId}-${match.meetDate}`} style={{ borderTop: "1px solid #ddd" }}>
                      <td>{match.meetName}</td>
                      <td>{new Date(match.meetDate).toLocaleDateString()}</td>
                      <td>
                        {nameChip(match.opponentName, match.opponentTeam, match.opponentTeamColor ?? "#000000")}
                      </td>
                      <td>{formatMatchResult(match)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
        })}
      </div>
      {pickerOpen && (
        <div className="coach-modal-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="coach-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Select My Wrestlers">
            <h4>Select wrestlers for {pickerOwnerLabel}</h4>
            <div className="coach-modal-roster">
              {teamWrestlers.length === 0 ? (
                <div className="muted">No active wrestlers found.</div>
              ) : (
                teamWrestlers.map((wrestler) => {
                  const checked = pickerSelection.includes(wrestler.id);
                  return (
                    <label key={wrestler.id} className="coach-modal-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePickerWrestler(wrestler.id)}
                      />
                      <span>{formatLastFirstName(wrestler.first, wrestler.last)}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={() => setPickerSelection([...pickerSuggestedWrestlerIds])}
                disabled={pickerSaving || pickerSuggestedWrestlerIds.length === 0}
              >
                Match Last Name
              </button>
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={() => setPickerSelection([])}
                disabled={pickerSaving}
              >
                Clear
              </button>
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={() => setPickerOpen(false)}
                disabled={pickerSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="coach-btn"
                onClick={() => { void savePickerSelection(); }}
                disabled={pickerSaving}
              >
                {pickerSaving ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}



