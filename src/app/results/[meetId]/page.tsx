"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import AppHeader from "@/components/AppHeader";

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
type MeetInfo = { id: string; name: string; date: string; location?: string | null; status?: string | null };
type LockState = { status: "loading" | "acquired" | "locked"; lockedByUsername?: string | null; lockExpiresAt?: string | null };

const RESULT_TYPES = ["DEC", "MAJ", "TF", "FALL", "DQ", "FOR"];

export default function EnterResultsPage() {
  const params = useParams<{ meetId: string }>();
  const meetId = params.meetId;
  const [meet, setMeet] = useState<MeetInfo | null>(null);
  const [bouts, setBouts] = useState<BoutRow[]>([]);
  const [msg, setMsg] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const lockStatusRef = useRef<LockState["status"]>("loading");

  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/account", label: "Account" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  const canEdit = lockState.status === "acquired" && !authMsg;

  function boutLabel(mat?: number | null, order?: number | null) {
    if (!mat || !order) return "Unassigned";
    return `${mat}${String(order).padStart(2, "0")}`;
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
    setSavingId(bout.id);
    try {
      const res = await fetch(`/api/bouts/${bout.id}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          winnerId: bout.resultWinnerId ?? null,
          type: bout.resultType?.trim() ?? null,
          score: bout.resultScore?.trim() ?? null,
          period: bout.resultPeriod ?? null,
          time: bout.resultTime?.trim() || null,
          notes: bout.resultNotes?.trim() || null,
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
      setMsg("Saved.");
      setTimeout(() => setMsg(""), 1200);
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    void load();
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

  const subtitle = useMemo(() => {
    if (!meet) return "";
    const dateLabel = meet.date ? new Date(meet.date).toLocaleDateString() : "";
    const pieces = [dateLabel, meet.location].filter(Boolean);
    return pieces.join(" - ");
  }, [meet]);

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
        }
        table {
          border-collapse: collapse;
          width: 100%;
          min-width: 960px;
        }
        th, td {
          border-bottom: 1px solid var(--line);
          padding: 8px;
          font-size: 13px;
          text-align: left;
          vertical-align: top;
        }
        th {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--muted);
        }
        .wrestler {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        input, select, button, textarea {
          font-family: inherit;
        }
        input, select, textarea {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px 8px;
          width: 100%;
          box-sizing: border-box;
        }
        textarea {
          min-height: 54px;
          resize: vertical;
        }
        .btn {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 6px 10px;
          font-weight: 700;
          background: #ffffff;
          cursor: pointer;
        }
        .btn:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .status {
          font-size: 12px;
          color: var(--muted);
          margin-top: 6px;
        }
      `}</style>

      <AppHeader links={headerLinks} />

      <div className="header">
        <div>
          <h1 className="title">Enter Results</h1>
          <div className="subtitle">{meet?.name || "Meet"} {subtitle ? `- ${subtitle}` : ""}</div>
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

      <div className="table-wrap">
        <table>
          <colgroup>
            <col style={{ width: 90 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Bout</th>
              <th>Red</th>
              <th>Green</th>
              <th>Winner</th>
              <th>Type</th>
              <th>Score</th>
              <th>Period</th>
              <th>Time</th>
              <th>Notes</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {bouts.map((b) => {
              const redLabel = `${b.red.first} ${b.red.last}`;
              const greenLabel = `${b.green.first} ${b.green.last}`;
              return (
                <tr key={b.id}>
                  <td>{boutLabel(b.mat, b.order)}</td>
                  <td>
                    <span className="wrestler">
                      <span className="dot" style={{ background: b.red.team?.color ?? "#000000" }} />
                      {redLabel} ({b.red.team?.symbol ?? b.red.team?.name ?? ""})
                    </span>
                  </td>
                  <td>
                    <span className="wrestler">
                      <span className="dot" style={{ background: b.green.team?.color ?? "#000000" }} />
                      {greenLabel} ({b.green.team?.symbol ?? b.green.team?.name ?? ""})
                    </span>
                  </td>
                  <td>
                    <select
                      value={b.resultWinnerId ?? ""}
                      onChange={(e) => updateBout(b.id, { resultWinnerId: e.target.value || null })}
                      disabled={!canEdit}
                    >
                      <option value="">No winner</option>
                      <option value={b.red.id}>{redLabel}</option>
                      <option value={b.green.id}>{greenLabel}</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={b.resultType ?? ""}
                      onChange={(e) => updateBout(b.id, { resultType: e.target.value || null })}
                      disabled={!canEdit}
                    >
                      <option value="">-</option>
                      {RESULT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={b.resultScore ?? ""}
                      onChange={(e) => updateBout(b.id, { resultScore: e.target.value })}
                      placeholder="6-2"
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={b.resultPeriod ?? ""}
                      onChange={(e) => updateBout(b.id, { resultPeriod: e.target.value ? Number(e.target.value) : null })}
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <input
                      value={b.resultTime ?? ""}
                      onChange={(e) => updateBout(b.id, { resultTime: e.target.value })}
                      placeholder="2:15"
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <textarea
                      value={b.resultNotes ?? ""}
                      onChange={(e) => updateBout(b.id, { resultNotes: e.target.value })}
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <button className="btn" onClick={() => saveResult(b)} disabled={!canEdit || savingId === b.id}>
                      {savingId === b.id ? "Saving..." : "Save"}
                    </button>
                    {b.resultAt && <div className="status">Saved {new Date(b.resultAt).toLocaleTimeString()}</div>}
                  </td>
                </tr>
              );
            })}
            {bouts.length === 0 && (
              <tr>
                <td colSpan={10}>No bouts available for results.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
