"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import AppHeader from "@/components/AppHeader";
import { DEFAULT_MAT_RULES } from "@/lib/matRules";

type TeamInfo = { id: string; name: string; symbol?: string | null; color?: string | null };
type WrestlerInfo = { id: string; first: string; last: string; teamId: string; team: TeamInfo };
type BoutRow = {
  id: string;
  mat: number | null;
  order: number | null;
  red: WrestlerInfo;
  green: WrestlerInfo;
  resultWinnerId: string | null;
  resultType: string | null;
  resultScore: string | null;
  resultPeriod: number | null;
  resultTime: string | null;
  resultNotes: string | null;
  resultAt: string | null;
};
type MeetInfo = {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  status?: string | null;
  homeTeamId?: string | null;
};
type ResultSnapshot = {
  winnerId: string | null;
  type: string | null;
  score: string | null;
};
type LockState = { status: "loading" | "acquired" | "locked"; lockedByUsername?: string | null; lockExpiresAt?: string | null };

const RESULT_TYPES = ["DEC", "MAJ", "TF", "FALL", "DQ", "FOR"];

export default function EnterResultsPage() {
  const params = useParams<{ meetId: string }>();
  const meetId = params.meetId;
  const [meet, setMeet] = useState<MeetInfo | null>(null);
  const [bouts, setBouts] = useState<BoutRow[]>([]);
  const [msg, setMsg] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const [activeMat, setActiveMat] = useState<number | "unassigned">("unassigned");
  const lockStatusRef = useRef<LockState["status"]>("loading");
  const [matColors, setMatColors] = useState<Record<number, string | null>>({});
  const originalResultsRef = useRef<Record<string, ResultSnapshot | undefined>>({});

  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/account", label: "Account" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  const canEdit = lockState.status === "acquired" && !authMsg;

  function boutLabel(mat?: number | null, order?: number | null) {
    if (!mat || !order) return "Unassigned";
    const ordValue = Math.max(0, order - 1);
    const ordStr = String(ordValue).padStart(2, "0");
    return `${mat}${ordStr}`;
  }

  function updateBout(id: string, patch: Partial<BoutRow>) {
    setBouts((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function load() {
    setMsg("");
    const res = await fetch(`/api/meets/${meetId}/results`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg(json?.error ?? "Unable to load results.");
      return;
    }
    const json = await res.json();
    setMeet(json.meet ?? null);
    setBouts(Array.isArray(json.bouts) ? json.bouts : []);
    const original: Record<string, { winnerId: string | null; type: string | null; score: string | null }> = {};
    if (Array.isArray(json.bouts)) {
      for (const bout of json.bouts) {
        original[bout.id] = {
          winnerId: bout.resultWinnerId ?? null,
          type: bout.resultType ?? null,
          score: bout.resultScore ?? null,
        };
      }
    }
    originalResultsRef.current = original;
  }

  function updateLockState(next: LockState) {
    lockStatusRef.current = next.status;
    setLockState(next);
  }

  async function acquireLock() {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.status === 401) {
      setAuthMsg("Please sign in to enter results.");
      return;
    }
    if (res.status === 403) {
      const json = await res.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to enter results.");
      return;
    }
    if (res.status === 409) {
      const json = await res.json().catch(() => ({}));
      updateLockState({
        status: "locked",
        lockedByUsername: json?.lockedByUsername ?? null,
        lockExpiresAt: json?.lockExpiresAt ?? null,
      });
      return;
    }
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      updateLockState({
        status: "acquired",
        lockExpiresAt: json?.lockExpiresAt ?? null,
      });
    }
  }

  async function releaseLock() {
    await fetch(`/api/meets/${meetId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
  }

  async function saveResult(bout: BoutRow) {
    if (!canEdit) return;
    const original = originalResultsRef.current[bout.id];
    const winnerId = bout.resultWinnerId ?? null;
    const type = bout.resultType?.trim() ?? null;
    const score = bout.resultScore?.trim() ?? null;
    if (
      original !== undefined &&
      original.winnerId === winnerId &&
      original.type === type &&
      original.score === score
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/bouts/${bout.id}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            winnerId,
            type,
            score,
            period: bout.resultPeriod ?? null,
            time: bout.resultTime?.trim() ?? null,
            notes: bout.resultNotes?.trim() ?? null,
          }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setMsg(json?.error ?? "Unable to save result.");
        return;
      }
      const json = await res.json();
      updateBout(bout.id, {
        resultWinnerId: json.resultWinnerId ?? null,
        resultType: json.resultType ?? null,
        resultScore: json.resultScore ?? null,
        resultPeriod: json.resultPeriod ?? null,
        resultTime: json.resultTime ?? null,
        resultNotes: json.resultNotes ?? null,
        resultAt: json.resultAt ?? null,
      });
      originalResultsRef.current[bout.id] = {
        winnerId: json.resultWinnerId ?? null,
        type: json.resultType ?? null,
        score: json.resultScore ?? null,
      };
      setMsg("");
    } finally {
      // no-op
    }
  }

  useEffect(() => {
    void load();
  }, [meetId]);

  useEffect(() => {
    let cancelled = false;
    const fetchMatColors = async () => {
      const res = await fetch(`/api/meets/${meetId}/mat-rules`);
      if (!res.ok) {
        if (!cancelled) setMatColors({});
        return;
      }
      const payload = await res.json().catch(() => null);
      if (cancelled) return;
      const colors: Record<number, string | null> = {};
      const rules = Array.isArray(payload?.rules) ? payload.rules : [];
      for (const rule of rules) {
        if (typeof rule.matIndex === "number") {
          const trimmed = typeof rule.color === "string" ? rule.color.trim() : "";
          colors[rule.matIndex] = trimmed.length > 0 ? trimmed : null;
        }
      }
      setMatColors(colors);
    };
    void fetchMatColors();
    return () => {
      cancelled = true;
    };
  }, [meetId]);

  useEffect(() => {
    void acquireLock();
    const interval = setInterval(() => {
      if (lockStatusRef.current === "acquired") {
        void acquireLock();
      }
    }, 60_000);
    const onBeforeUnload = () => { void releaseLock(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void releaseLock();
    };
  }, [meetId]);

  const meetNameDisplay = meet?.name ?? "Meet";

  const darkenHex = (color: string, amount: number) => {
    if (!color.startsWith("#") || color.length !== 7) return color;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
    const factor = Math.max(0, Math.min(1, 1 - amount));
    const nr = Math.round(r * factor);
    const ng = Math.round(g * factor);
    const nb = Math.round(b * factor);
    return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
  };
  const matTextColor = (color?: string | null) => {
    if (!color?.startsWith("#") || color.length !== 7) return color ?? "#000000";
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance > 0.8) return darkenHex(color, 0.6);
    if (luminance > 0.7) return darkenHex(color, 0.45);
    if (luminance > 0.6) return darkenHex(color, 0.3);
    return color;
  };
  const contrastText = (color?: string | null) => {
    if (!color?.startsWith("#")) return "#ffffff";
    const hex = color.slice(1);
    if (hex.length !== 6) return "#ffffff";
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#ffffff";
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111111" : "#ffffff";
  };
  const getDefaultMatColor = (matIndex: number) => {
    const preset = DEFAULT_MAT_RULES[(matIndex - 1) % DEFAULT_MAT_RULES.length];
    return preset.color ?? "#f2f2f2";
  };
  const getMatColor = (matIndex: number) => {
    if (!matIndex || matIndex < 1) return "#f2f2f2";
    const stored = matColors[matIndex];
    if (stored?.trim()) return stored.trim();
    return getDefaultMatColor(matIndex);
  };

  const mats = useMemo(() => {
    const matSet = new Set<number>();
    let hasUnassigned = false;
    for (const b of bouts) {
      if (!b.mat || !b.order) {
        hasUnassigned = true;
        continue;
      }
      matSet.add(b.mat);
    }
    const ordered = Array.from(matSet).sort((a, b) => a - b);
    return { ordered, hasUnassigned };
  }, [bouts]);

  useEffect(() => {
    if (mats.ordered.length === 0 && mats.hasUnassigned) {
      setActiveMat("unassigned");
      return;
    }
    if (activeMat === "unassigned") {
      if (!mats.hasUnassigned && mats.ordered.length > 0) {
        setActiveMat(mats.ordered[0]);
      }
      return;
    }
    if (typeof activeMat === "number" && !mats.ordered.includes(activeMat)) {
      if (mats.ordered.length > 0) {
        setActiveMat(mats.ordered[0]);
      } else if (mats.hasUnassigned) {
        setActiveMat("unassigned");
      }
    }
  }, [activeMat, mats]);

  const filteredBouts = useMemo(() => {
    if (activeMat === "unassigned") {
      return bouts.filter(b => !b.mat || !b.order);
    }
    return bouts.filter(b => b.mat === activeMat);
  }, [activeMat, bouts]);

  const focusNextRow = (index: number) => {
    const fields = Array.from(document.querySelectorAll<HTMLSelectElement | HTMLInputElement>(".first-field"));
    if (index + 1 < fields.length) {
      fields[index + 1].focus();
    }
  };

  return (
    <main className="results-entry">
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
        .results-entry {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          border-bottom: 1px solid var(--line);
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .title {
          font-family: "Oswald", Arial, sans-serif;
          font-size: clamp(24px, 3vw, 36px);
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .title .meet-name {
          font-size: 0.85em;
          font-weight: 600;
          text-transform: none;
        }
        .title .meet-location {
          font-size: 0.7em;
          font-weight: 500;
          color: var(--muted);
          text-transform: none;
          letter-spacing: 0.2px;
        }
        .subtitle {
          margin-top: 6px;
          color: var(--muted);
          font-size: 14px;
        }
        .notice {
          border: 1px solid #e8c3c3;
          background: #fff3f3;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 12px;
          color: #b00020;
        }
        .lock {
          background: #fffaf0;
          border: 1px solid #f3c27a;
          color: #8a4b00;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .table-wrap {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px;
          overflow-x: auto;
          max-width: 1200px;
          margin: 0;
        }
        .pairings-tab-bar {
          display: flex;
          gap: 6px;
          align-items: flex-end;
          border-bottom: 1px solid var(--line);
          margin-top: 8px;
        }
        .pairing-tab {
          border: 1px solid var(--line);
          border-bottom: none;
          border-radius: 8px 8px 0 0;
          background: #eef1f4;
          padding: 6px 12px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
        }
        .pairing-tab.active {
          background: #ffffff;
          color: var(--ink);
          box-shadow: 0 -2px 0 #ffffff inset;
        }
        .pairing-tab:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
        .tab-body {
          margin-top: -1px;
          padding-top: 0;
          border: 1px solid var(--line);
          border-top: none;
          background: #fff;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          min-width: 720px;
          table-layout: auto;
        }
        th, td {
          border-bottom: 1px solid var(--line);
          padding: 4px;
          font-size: 12px;
          text-align: left;
          vertical-align: top;
        }
        th {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--muted);
        }
        .bout-num {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.4px;
        }
        .winner-col select {
          font-size: 14px;
          font-weight: 600;
        }
        .type-col select,
        .score-col input {
          font-size: 14px;
          font-weight: 600;
        }
        .wrestler {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          font-size: 15px;
        }
        input, select, button, textarea {
          font-family: inherit;
        }
        input, select, textarea {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 4px 6px;
          width: 100%;
          box-sizing: border-box;
          font-size: 12px;
        }
        textarea {
          min-height: 40px;
          resize: vertical;
        }
        .results-entry .btn {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 4px 8px;
          font-weight: 700;
          background: #ffffff;
          color: var(--ink);
          cursor: pointer;
          font-size: 12px;
        }
        .results-entry .btn:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .results-entry .app-header-actions {
          flex-wrap: nowrap;
        }
        .results-entry .app-header-user-info {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }
        .first-field:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
          box-shadow: 0 0 0 2px rgba(30, 136, 229, 0.15);
        }
        .status {
          font-size: 12px;
          color: var(--muted);
          margin-top: 6px;
        }
        .name-col {
          white-space: nowrap;
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vs {
          color: var(--muted);
          font-weight: 600;
          margin: 0 6px;
        }
        .name-col .wrestler {
          display: inline-block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: bottom;
        }
      `}</style>

      <AppHeader links={headerLinks} />

      <div className="header">
        <div>
          <h1 className="title">
            Results for: <span className="meet-name">{meetNameDisplay}</span>
            {meet?.location ? <span className="meet-location"> - {meet.location}</span> : ""}
          </h1>
        </div>
        <div>
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {authMsg && <div className="notice">{authMsg}</div>}
      {lockState.status === "locked" && (
        <div className="lock">
          Editing locked by {lockState.lockedByUsername ?? "another user"}. Try again when they are done.
          <button className="btn" style={{ marginLeft: 10 }} onClick={acquireLock}>Try again</button>
        </div>
      )}
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="pairings-tab-bar" role="tablist" aria-label="Mat tabs">
        {mats.ordered.map((mat) => (
          <button
            key={mat}
            className={`pairing-tab ${activeMat === mat ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeMat === mat}
            onClick={() => setActiveMat(mat)}
            style={{
              background: activeMat === mat
                ? getMatColor(mat)
                : getMatColor(mat) ? `${getMatColor(mat)}22` : undefined,
              borderColor: getMatColor(mat),
              color: activeMat === mat
                ? contrastText(getMatColor(mat))
                : matTextColor(getMatColor(mat)),
              borderWidth: activeMat === mat ? 2 : undefined,
              fontWeight: activeMat === mat ? 700 : undefined,
              boxShadow: activeMat === mat ? "0 -2px 0 #ffffff inset, 0 2px 0 rgba(0,0,0,0.12)" : undefined,
            }}
          >
            Mat {mat}
          </button>
        ))}
        {mats.hasUnassigned && (
          <button
            className={`pairing-tab ${activeMat === "unassigned" ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeMat === "unassigned"}
            onClick={() => setActiveMat("unassigned")}
          >
            Unassigned
          </button>
        )}
      </div>

      <div className="tab-body">
        <div className="table-wrap">
          <table>
          <thead>
            <tr>
              <th>Bout</th>
              <th className="name-col">Wrestlers</th>
              <th>Winner</th>
              <th>Type</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {filteredBouts.map((b, index) => {
              const redLabel = `${b.red.first} ${b.red.last}`;
              const greenLabel = `${b.green.first} ${b.green.last}`;
              const isHomeRed = meet?.homeTeamId ? b.red.teamId === meet.homeTeamId : false;
              const isHomeGreen = meet?.homeTeamId ? b.green.teamId === meet.homeTeamId : false;
              const first = meet?.homeTeamId && isHomeGreen && !isHomeRed ? b.green : b.red;
              const second = first.id === b.red.id ? b.green : b.red;
              const firstLabel = first.id === b.red.id ? redLabel : greenLabel;
              const secondLabel = second.id === b.red.id ? redLabel : greenLabel;
              const firstTeamLabel = first.team.symbol ?? first.team.name;
              const secondTeamLabel = second.team.symbol ?? second.team.name;
              const winnerColor = b.resultWinnerId === b.red.id
                ? (b.red.team.color ?? "#000000")
                : b.resultWinnerId === b.green.id
                  ? (b.green.team.color ?? "#000000")
                  : undefined;
              return (
                <tr
                  key={b.id}
                  onBlur={(e) => {
                    const next = e.relatedTarget as HTMLElement | null;
                    if (next && e.currentTarget.contains(next)) return;
                    void saveResult(b);
                  }}
                >
                  <td className="bout-num">{boutLabel(b.mat, b.order)}</td>
                  <td className="name-col">
                    <span className="wrestler" style={{ color: first.team.color ?? "#000000" }}>
                      {firstLabel} ({firstTeamLabel})
                    </span>
                    <span className="vs">v</span>
                    <span className="wrestler" style={{ color: second.team.color ?? "#000000" }}>
                      {secondLabel} ({secondTeamLabel})
                    </span>
                  </td>
                  <td className="winner-col">
                    <select
                      className="first-field"
                      value={b.resultWinnerId ?? ""}
                      onChange={(e) => updateBout(b.id, { resultWinnerId: e.target.value || null })}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        void saveResult(b);
                        focusNextRow(index);
                      }}
                      disabled={!canEdit}
                      style={{ color: winnerColor }}
                    >
                      <option value="">No winner</option>
                      <option value={b.red.id}>
                        {redLabel} ({b.red.team.symbol ?? b.red.team.name})
                      </option>
                      <option value={b.green.id}>
                        {greenLabel} ({b.green.team.symbol ?? b.green.team.name})
                      </option>
                    </select>
                  </td>
                  <td className="type-col">
                    <select
                      value={b.resultType ?? ""}
                      onChange={(e) => updateBout(b.id, { resultType: e.target.value || null })}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        void saveResult(b);
                        focusNextRow(index);
                      }}
                      disabled={!canEdit}
                    >
                      <option value="">-</option>
                      {RESULT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="score-col">
                    <input
                      value={b.resultScore ?? ""}
                      onChange={(e) => updateBout(b.id, { resultScore: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        void saveResult(b);
                        focusNextRow(index);
                      }}
                      disabled={!canEdit}
                    />
                  </td>
                </tr>
              );
            })}
            {filteredBouts.length === 0 && (
              <tr>
                <td colSpan={5}>No bouts available for results.</td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
