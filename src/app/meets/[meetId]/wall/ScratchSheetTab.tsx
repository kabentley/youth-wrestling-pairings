"use client";

import { useEffect, useRef, useState } from "react";

import ControlBar from "./ControlBar";

import { formatTeamName } from "@/lib/formatTeamName";

type MeetData = {
  id: string;
  name: string;
  date: string;
  homeTeamId?: string | null;
  meetTeams: { team: { id: string; name: string; symbol?: string | null; color?: string | null } }[];
};

type Wrestler = {
  id: string;
  teamId: string;
  first: string;
  last: string;
};

type Status = { wrestlerId: string; status: string };

type WallChartPayload = {
  meet: MeetData;
  statuses: Status[];
  wrestlers: Wrestler[];
};

const NAMES_PER_COLUMN = 35;
const NAMES_PER_PAGE = NAMES_PER_COLUMN * 2;

function formatLastFirst(w?: Wrestler | null) {
  if (!w) return "";
  const last = w.last.trim();
  const first = w.first.trim();
  if (last && first) return `${last}, ${first}`;
  return last || first || "";
}

function chunk<T>(items: T[], size: number) {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size));
  }
  return parts;
}

export default function ScratchSheetTab({
  meetId,
  refreshIndex,
}: {
  meetId: string;
  refreshIndex?: number;
}) {
  const [payload, setPayload] = useState<WallChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scratchRef = useRef<HTMLDivElement | null>(null);
  const fetchRequestIdRef = useRef(0);

  useEffect(() => {
    const signal = refreshIndex ?? 0;
    void signal;
    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;
    let isMounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/wall-chart/${meetId}?r=${encodeURIComponent(String(refreshIndex ?? 0))}&req=${requestId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error ?? "Failed to load scratch sheet");
        }
        return res.json();
      })
      .then((data: WallChartPayload) => {
        if (!isMounted || requestId !== fetchRequestIdRef.current) return;
        setPayload(data);
      })
      .catch(err => {
        if (isMounted && requestId === fetchRequestIdRef.current) {
          setError(err instanceof Error ? err.message : "Failed to load scratch sheet");
        }
      })
      .finally(() => {
        if (isMounted && requestId === fetchRequestIdRef.current) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [meetId, refreshIndex]);

  const styles = `
    @media print {
      .scratch-sheet-root .print-meet-header {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        padding: 10px 14px;
        font-weight: 700;
        font-size: 16px;
        background: #fff;
        border-bottom: 1px solid #d0d5df;
        z-index: 5;
      }
      .scratch-sheet-root {
        padding-top: 54px;
      }
      .scratch-sheet-root .chart-controls {
        display: none !important;
      }
      .scratch-sheet-root .scratch-page {
        page-break-after: always;
        break-after: page;
      }
      .scratch-sheet-root .scratch-page:last-of-type {
        page-break-after: auto;
        break-after: auto;
      }
      .scratch-sheet-root .page-card {
        border: none !important;
        border-radius: 0 !important;
      }
    }
    .scratch-sheet-root {
      font-family: Calibri, "Segoe UI", Arial, sans-serif;
      padding: 14px;
    }
    .scratch-sheet-root .print-meet-header {
      display: none;
    }
    .scratch-sheet-root .chart-controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin: 0 0 12px;
      padding: 0;
      border-radius: 0;
      background: transparent;
      border: none;
      box-shadow: none;
    }
    .scratch-sheet-root .chart-controls label {
      display: inline-flex;
      align-items: center;
    }
    .scratch-sheet-root .chart-controls input {
      width: auto;
    }
    .scratch-sheet-root .chart-controls select {
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid #d5dbe2;
      background: #fff;
      font-size: 13px;
      font-weight: 600;
    }
    .scratch-sheet-root .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
    .scratch-sheet-root .chart-controls button {
      padding: 8px 18px;
      background: #1e88e5;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(14, 57, 96, 0.25);
    }
    .scratch-sheet-root .chart-controls button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
      background: #b0b5be;
    }
    .scratch-sheet-root .chart-controls .refresh-btn {
      padding: 8px 18px;
      background: #92979d;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      cursor: pointer;
    }
    .scratch-sheet-root .page-card {
      border: 1px solid #ddd;
      border-radius: 12px;
      padding: 10px 12px;
      background: #fff;
    }
    .scratch-sheet-root .page-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      border-bottom: 1px solid #e5e8ee;
      padding-bottom: 6px;
    }
    .scratch-sheet-root .team-label {
      font-size: 16px;
      font-weight: 700;
    }
    .scratch-sheet-root .meet-label {
      font-size: 12px;
      color: #4e5563;
      white-space: nowrap;
    }
    .scratch-sheet-root .scratch-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(280px, 360px));
      justify-content: center;
      gap: 12px;
    }
    .scratch-sheet-root .name-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .scratch-sheet-root .name-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      min-height: 19px;
      font-size: 14px;
      line-height: 1.25;
      border-bottom: 1px solid #f1f3f6;
      padding: 2px 0;
    }
    .scratch-sheet-root .name-row:last-child {
      border-bottom: none;
    }
    .scratch-sheet-root .name-value {
      flex: 1 1 auto;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .scratch-sheet-root .name-check {
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      margin: 0;
    }
    .scratch-sheet-root .empty-msg {
      font-size: 14px;
      color: #666;
      margin: 8px 0 0;
    }
  `;

  if (loading) {
    return <p>Loading scratch sheet...</p>;
  }
  if (error) {
    return <div className="notice">Unable to load scratch sheet: {error}</div>;
  }
  if (!payload) {
    return null;
  }

  const absentIds = new Set(
    payload.statuses
      .filter(s => s.status === "NOT_COMING" || s.status === "ABSENT")
      .map(s => s.wrestlerId)
  );
  const meet = payload.meet;
  const meetLabel = meet.name || "Meet";
  const headerLabel =
    meet.name
      ? `${meet.name} - ${meet.meetTeams.map(mt => formatTeamName(mt.team)).join(", ")}`
      : meet.name;

  const pages = meet.meetTeams.flatMap((mt) => {
    const names = payload.wrestlers
      .filter(w => w.teamId === mt.team.id && !absentIds.has(w.id))
      .sort((a, b) => {
        const lastCmp = a.last.localeCompare(b.last, undefined, { sensitivity: "base" });
        if (lastCmp !== 0) return lastCmp;
        return a.first.localeCompare(b.first, undefined, { sensitivity: "base" });
      })
      .map(w => formatLastFirst(w))
      .filter(Boolean);

    const nameChunks = names.length > 0 ? chunk(names, NAMES_PER_PAGE) : [[]];
    return nameChunks.map((part, idx) => ({
      key: `${mt.team.id}-${idx}`,
      teamLabel: formatTeamName(mt.team),
      names: part,
      pageIndex: idx,
      pageCount: nameChunks.length,
    }));
  });

  return (
    <div className="scratch-sheet-root" ref={scratchRef}>
      <style>{styles}</style>
      <div className="print-meet-header" aria-hidden="true">{headerLabel}</div>
      <ControlBar meetId={meetId} printTargetRef={scratchRef} printStyles={styles} />
      {pages.map((page) => {
        const left = page.names.slice(0, NAMES_PER_COLUMN);
        const right = page.names.slice(NAMES_PER_COLUMN, NAMES_PER_PAGE);
        const leftRows = Array.from({ length: NAMES_PER_COLUMN }, (_, idx) => left[idx] ?? "");
        const rightRows = Array.from({ length: NAMES_PER_COLUMN }, (_, idx) => right[idx] ?? "");
        const showPageSuffix = page.pageCount > 1;
        return (
          <section key={page.key} className="scratch-page">
            <article className="page-card">
              <div className="page-header">
                <div className="team-label">
                  {page.teamLabel}
                  {showPageSuffix ? ` (Page ${page.pageIndex + 1}/${page.pageCount})` : ""}
                </div>
                <div className="meet-label">{meetLabel}</div>
              </div>
              {page.names.length === 0 ? (
                <p className="empty-msg">No attending wrestlers.</p>
              ) : (
                <div className="scratch-columns">
                  <ul className="name-list">
                    {leftRows.map((name, idx) => (
                      <li className="name-row" key={`${page.key}-left-${idx}`}>
                        {name ? <input className="name-check" type="checkbox" aria-label={`Mark ${name}`} /> : null}
                        <span className="name-value">{name}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="name-list">
                    {rightRows.map((name, idx) => (
                      <li className="name-row" key={`${page.key}-right-${idx}`}>
                        {name ? <input className="name-check" type="checkbox" aria-label={`Mark ${name}`} /> : null}
                        <span className="name-value">{name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          </section>
        );
      })}
    </div>
  );
}
