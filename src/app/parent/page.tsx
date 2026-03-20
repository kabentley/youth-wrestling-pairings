"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppHeader from "@/components/AppHeader";
import ParentAttendancePanel from "@/components/parent/ParentAttendancePanel";
import ParentTodayMeetCards, {
  type ParentTodayCurrentUser,
  type ParentTodayMeetGroup,
} from "@/components/parent/ParentTodayMeetCards";
import { formatCompactResultSummary } from "@/lib/resultEntry";

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
type MatchWithMeet = Match & {
  meetId: string;
  meetName: string;
  meetDate: string;
  resultsCompletedAt?: string | null;
};
type AttendanceStatus = "COMING" | "NOT_COMING" | null;

type MeetGroup = {
  meet: {
    id: string;
    name: string;
    date: string;
    location?: string | null;
    status?: string | null;
    attendanceDeadline?: string | null;
    checkinStartAt?: string | null;
    checkinDurationMinutes?: number | null;
  };
  matches: Match[];
  children: Array<{
    childId: string;
    first: string;
    last: string;
    teamSymbol?: string | null;
    teamName: string;
    teamColor?: string | null;
    attendanceStatus: AttendanceStatus;
  }>;
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

/** Lowercases and strips punctuation so name matching ignores formatting noise. */
const normalizeNameToken = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
const formatLastFirstName = (first?: string | null, last?: string | null) => {
  const firstName = (first ?? "").trim();
  const lastName = (last ?? "").trim();
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  return lastName || firstName;
};

/**
 * Builds one or two last-name keys from the account holder's display name.
 *
 * The joined-token fallback helps with compound last names that may be stored
 * with or without spaces.
 */
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

/** Small local edit-distance helper used for fuzzy parent-to-wrestler matching. */
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

/**
 * Tuned similarity score for surname matching.
 *
 * Exact and near-exact matches get a boost so likely family matches are still
 * suggested when the account name has a typo or surname variant.
 */
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
  const [pastMatches, setPastMatches] = useState<MatchWithMeet[]>([]);
  const [currentUser, setCurrentUser] = useState<ParentTodayCurrentUser | null>(null);
  const [teamWrestlers, setTeamWrestlers] = useState<TeamWrestler[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [msg, setMsg] = useState("");

  /** Loads the parent dashboard payloads in parallel so the page paints once. */
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
    setCurrentUser(matchesRes.ok ? matchesJson?.currentUser ?? null : null);
    setChildren(matchesJson?.children ?? []);
    setMeetGroups(matchesJson?.meets ?? []);
    setPastMatches(Array.isArray(matchesJson?.pastMatches) ? matchesJson.pastMatches : []);
    setTeamWrestlers(teamWrestlersRes.ok && Array.isArray(teamWrestlersJson) ? teamWrestlersJson : []);
  }

  /** Suggests likely linked wrestlers from the roster using fuzzy surname matching. */
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

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
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
    for (const match of pastMatches) {
      const list = map.get(match.childId) ?? [];
      list.push(match);
      map.set(match.childId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.meetDate).getTime() - new Date(b.meetDate).getTime());
    }
    return map;
  }, [pastMatches]);

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
      <span style={{ color: "#111111", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, flexWrap: "wrap", maxWidth: "100%", justifyContent: "flex-end" }}>
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

  /**
   * Formats historical results for the compact parent dashboard view.
   *
   * Falls and technical falls may carry either a time or a period depending on
   * what was captured during results entry.
   */
  function formatMatchResult(match: Match) {
    const result = match.result;
    const outcome = result.winnerId
      ? (result.winnerId === match.childId ? "W" : "L")
      : "";
    const summary = formatCompactResultSummary({
      type: result.type,
      score: result.score,
      period: result.period,
      time: result.time,
    });
    if (outcome && summary) return `${outcome} ${summary}`;
    return outcome || summary;
  }
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent/today", label: "Today", roles: ["PARENT"] as const },
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
        .match-history-table-wrap {
          width: 100%;
          overflow-x: auto;
        }
        .match-history-table {
          border-collapse: collapse;
          width: 100%;
          margin-top: 8px;
          table-layout: fixed;
        }
        .match-history-table th,
        .match-history-table td {
          padding: 6px;
          text-align: left;
          vertical-align: top;
          overflow-wrap: anywhere;
        }
        .match-history-link {
          color: var(--accent);
        }
        .match-history-link:hover {
          color: #1769bf;
          text-decoration: underline;
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
        .attendance-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #1e88e5;
          color: #ffffff;
          padding: 10px 16px;
          font-weight: 700;
          border: 1px solid #1e88e5;
        }
        .attendance-link:hover {
          color: #ffffff;
          background: #1769bf;
          border-color: #1769bf;
        }
        .attendance-link.secondary {
          background: #ffffff;
          color: var(--ink);
          border-color: #cfd8e3;
        }
        .attendance-link.secondary:hover {
          color: var(--ink);
          background: #f7f9fb;
          border-color: #cfd8e3;
        }
        .attendance-summary {
          display: grid;
          gap: 8px;
        }
        .attendance-summary-card {
          border: 1px solid #dfe4ea;
          border-radius: 10px;
          padding: 12px;
          background: #f8fafc;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .attendance-summary-name {
          font-weight: 700;
        }
        .attendance-summary-status {
          font-weight: 700;
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
        .today-upcoming-list {
          display: grid;
          gap: 18px;
        }
        .today-card {
          background: #ffffff;
          border: 1px solid #d9e1e8;
          border-radius: 18px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
          padding: 18px;
          display: grid;
          gap: 16px;
          max-width: 960px;
        }
        .today-assignment-card {
          background: linear-gradient(180deg, #eef7ff 0%, #f8fbff 100%);
          border: 1px solid #bfd6ee;
          border-radius: 18px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
          padding: 16px 18px;
          font-size: 18px;
          font-weight: 600;
          color: #14324d;
        }
        .today-assignment-mat {
          font-weight: 800;
        }
        .today-meet-header {
          display: grid;
          gap: 6px;
        }
        .today-meet-label {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #586473;
        }
        .today-meet-name {
          margin: 0;
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: 28px;
          line-height: 1;
        }
        .today-meta {
          color: #586473;
          font-size: 17px;
        }
        .meet-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .today-wrestler-list {
          display: grid;
          gap: 12px;
        }
        .today-wrestler-card {
          border: 1px solid #d9e1e8;
          border-radius: 14px;
          background: #fbfdff;
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        .today-wrestler-name {
          font-size: 24px;
          font-weight: 800;
          line-height: 1.1;
        }
        .today-bouts {
          display: grid;
          gap: 8px;
        }
        .today-bouts-card {
          background: #ffffff;
          border: 1px solid #dfe5eb;
          border-radius: 12px;
          overflow: hidden;
        }
        .today-bout-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          padding: 10px;
        }
        .today-bout-row + .today-bout-row {
          border-top: 1px solid #dfe5eb;
        }
        .today-bout-number {
          font-weight: 800;
          min-width: 64px;
          white-space: nowrap;
        }
        .today-bout-opponent {
          flex: 1 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .today-bout-opponent-name {
          font-weight: 700;
        }
        @media (max-width: 640px) {
          .parent {
            padding: 20px 14px 32px;
          }
          .attendance-summary-card {
            padding: 10px;
            gap: 6px;
          }
          .attendance-summary-status {
            width: 100%;
          }
          .meet-actions {
            align-items: stretch;
          }
          .attendance-link {
            width: 100%;
          }
          .today-card {
            padding: 16px 14px;
          }
          .today-bout-row {
            gap: 8px;
            padding: 9px 8px;
          }
          .today-bout-number {
            min-width: 58px;
            font-size: 15px;
          }
          .today-bout-opponent {
            font-size: 15px;
          }
        }
      `}</style>
      <AppHeader links={headerLinks} />

      <ParentTodayMeetCards
        meetGroups={meetGroups as ParentTodayMeetGroup[]}
        currentUser={currentUser}
        title="Today's Meet"
        showEmptyState={false}
      />

      <div style={{ marginTop: 24 }}>
        <ParentAttendancePanel embedded />
      </div>

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

      <h2 style={{ marginTop: 24 }}>Match History</h2>
      <div className="match-history">
        {sortedChildren.map(child => {
        const history = pastMatchesByChild.get(child.id) ?? [];
        return (
          <div key={child.id} className="panel" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>{child.first} {child.last}</h3>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {history.length === 0 ? "No past matches yet" : `${history.length} match${history.length === 1 ? "" : "es"}`}
              </div>
            </div>
            {history.length === 0 ? (
              <div style={{ marginTop: 8 }}>No matches recorded.</div>
            ) : (
              <div className="match-history-table-wrap">
                <table className="match-history-table">
                  <colgroup>
                    <col style={{ width: "36%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "20%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Meet</th>
                      <th>Date</th>
                      <th>Opponent</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(match => (
                      <tr key={`${match.boutId}-${match.meetDate}`} style={{ borderTop: "1px solid #ddd" }}>
                        <td>
                          {match.resultsCompletedAt ? (
                            <Link className="match-history-link" href={`/results/${match.meetId}`}>{match.meetName}</Link>
                          ) : (
                            match.meetName
                          )}
                        </td>
                        <td>{new Date(match.meetDate).toLocaleDateString()}</td>
                        <td>
                          {nameChip(match.opponentName, match.opponentTeam, match.opponentTeamColor ?? "#000000")}
                        </td>
                        <td>{formatMatchResult(match)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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



