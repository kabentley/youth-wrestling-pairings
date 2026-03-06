"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import ControlBar from "./ControlBar";

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

type Bout = {
  id: string;
  redId: string;
  greenId: string;
  mat?: number | null;
  order?: number | null;
};

type Status = { wrestlerId: string; status: string };

type WallChartPayload = {
  meet: MeetData;
  bouts: Bout[];
  statuses: Status[];
  wrestlers: Wrestler[];
};

const BOUTS_PER_PAGE = 15;

function chunk<T>(items: T[], size: number) {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size));
  }
  return parts;
}

function displayName(w?: Wrestler | null) {
  if (!w) return "";
  const first = w.first.trim();
  const last = w.last.trim();
  return `${first} ${last}`.trim();
}

export default function ScoringSheetTab({
  meetId,
  refreshIndex,
}: {
  meetId: string;
  refreshIndex?: number;
}) {
  const [payload, setPayload] = useState<WallChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleMats, setVisibleMats] = useState<number[] | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const fetchRequestIdRef = useRef(0);

  useEffect(() => {
    const signal = refreshIndex ?? 0;
    void signal;
    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;
    let isMounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/wall-chart/${meetId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error ?? "Failed to load scoring sheet");
        }
        return res.json();
      })
      .then((data: WallChartPayload) => {
        if (!isMounted || requestId !== fetchRequestIdRef.current) return;
        setPayload(data);
      })
      .catch(err => {
        if (isMounted && requestId === fetchRequestIdRef.current) {
          setError(err instanceof Error ? err.message : "Failed to load scoring sheet");
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
    @page {
      size: landscape;
      margin: 0.4in;
    }
    @media print {
      .scoring-sheet-root,
      .scoring-sheet-root * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .scoring-sheet-root .print-meet-header {
        display: none;
      }
      .scoring-sheet-root {
        padding-top: 0;
      }
      .scoring-sheet-root .chart-controls {
        display: none !important;
      }
      .scoring-sheet-root .mat-toggle-bar {
        display: none !important;
      }
      .scoring-sheet-root .sheet-page {
        page-break-after: always;
        break-after: page;
        margin: 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .scoring-sheet-root .sheet-page:last-of-type {
        page-break-after: auto;
        break-after: auto;
      }
      .scoring-sheet-root .sheet-card {
        border: none !important;
        border-radius: 0 !important;
      }
    }
    .scoring-sheet-root {
      font-family: Calibri, "Segoe UI", Arial, sans-serif;
      padding: 14px;
    }
    .scoring-sheet-root .print-meet-header {
      display: none;
    }
    .scoring-sheet-root .chart-controls {
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
    .scoring-sheet-root .chart-controls label {
      display: inline-flex;
      align-items: center;
    }
    .scoring-sheet-root .chart-controls input {
      width: auto;
    }
    .scoring-sheet-root .chart-controls select {
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid #d5dbe2;
      background: #fff;
      font-size: 13px;
      font-weight: 600;
    }
    .scoring-sheet-root .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
    .scoring-sheet-root .chart-controls button {
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
    .scoring-sheet-root .chart-controls button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
      background: #b0b5be;
    }
    .scoring-sheet-root .mat-toggle-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin: 0 0 14px;
    }
    .scoring-sheet-root .mat-toggle-label {
      font-size: 13px;
      font-weight: 700;
      color: #4b5563;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .scoring-sheet-root .mat-toggle-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .scoring-sheet-root .mat-toggle-btn {
      border: 1px solid #c7d2df;
      background: #fff;
      color: #1f2937;
      border-radius: 999px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .scoring-sheet-root .mat-toggle-btn.is-active {
      background: #1e88e5;
      border-color: #1e88e5;
      color: #fff;
    }
    .scoring-sheet-root .mat-toggle-btn:hover {
      border-color: #1e88e5;
    }
    .scoring-sheet-root .empty-state {
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      padding: 24px;
      color: #475569;
      text-align: center;
      background: #f8fafc;
      font-weight: 600;
    }
    .scoring-sheet-root .sheet-page {
      margin-bottom: 16px;
    }
    .scoring-sheet-root .sheet-card {
      border: 1px solid #30343c;
      border-radius: 6px;
      overflow: hidden;
      background: #fff;
    }
    .scoring-sheet-root .sheet-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 3px 8px;
      border-bottom: 1px solid #30343c;
      font-size: 16px;
      font-weight: 700;
    }
    .scoring-sheet-root .sheet-header-right {
      font-weight: 600;
      color: #444;
    }
    .scoring-sheet-root table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 13px;
    }
    .scoring-sheet-root th,
    .scoring-sheet-root td {
      border: 1px solid #30343c;
      vertical-align: middle;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .scoring-sheet-root th {
      padding: 1px 4px;
      line-height: 1.2;
    }
    .scoring-sheet-root td {
      padding: 1px 4px;
      line-height: 1.24;
    }
    .scoring-sheet-root thead th {
      text-align: center;
      font-weight: 700;
      background: #fff;
    }
    .scoring-sheet-root .c-bout { width: 3.6%; text-align: center; font-weight: 700; }
    .scoring-sheet-root .c-team { width: 3.6%; text-align: center; }
    .scoring-sheet-root .c-name { width: 16%; text-align: left; font-size: 14px; }
    .scoring-sheet-root .c-corner { width: 2.4%; text-align: center; font-weight: 700; }
    .scoring-sheet-root .c-period { width: 20%; text-align: center; }
    .scoring-sheet-root .c-small { width: 2.4%; text-align: center; }
    .scoring-sheet-root .c-ot { width: 2.8%; text-align: center; }
    .scoring-sheet-root .c-scr { width: 6.0%; text-align: center; font-weight: 700; }
    .scoring-sheet-root .home-cell {
      background: #ececec;
      font-weight: 700;
    }
    .scoring-sheet-root .blank-page {
      font-size: 13px;
      color: #666;
      padding: 8px;
    }
    .scoring-sheet-root tbody tr.wrestler-divider td:not(.match-divider-cell) {
      border-bottom: 0.75px solid #d6dae1;
    }
    .scoring-sheet-root tbody tr:first-child td {
      border-top: 1px solid #1f232b;
    }
    .scoring-sheet-root tbody tr.match-end td {
      border-bottom: 1px solid #1f232b;
    }
    .scoring-sheet-root tbody tr.match-end td:not(.match-divider-cell) {
      border-top: 0.75px solid #d6dae1;
    }
    .scoring-sheet-root .match-divider-cell {
      border-bottom: 1px solid #1f232b;
    }
    @media print {
      .black-and-white .scoring-sheet-root .home-cell {
        background: #e0e0e0 !important;
        color: #000 !important;
      }
    }
  `;

  const meet = payload?.meet ?? null;
  const homeTeamId = meet?.homeTeamId ?? null;
  const absentIds = new Set(
    (payload?.statuses ?? [])
      .filter(s => s.status === "NOT_COMING" || s.status === "ABSENT")
      .map(s => s.wrestlerId)
  );
  const wrestlers = new Map((payload?.wrestlers ?? []).map(w => [w.id, w]));
  const teamSymbols = new Map((meet?.meetTeams ?? []).map(mt => [mt.team.id, mt.team.symbol ?? mt.team.name]));
  const filteredBouts = (payload?.bouts ?? []).filter(
    b => !absentIds.has(b.redId) && !absentIds.has(b.greenId)
  );
  const mats = Array.from(new Set(filteredBouts.map(b => b.mat ?? 1))).sort((a, b) => a - b);
  if (payload && mats.length === 0) mats.push(1);
  const matsKey = mats.join(",");

  useEffect(() => {
    if (!payload) return;
    setVisibleMats(current => {
      if (current === null) return mats;
      const next = current.filter(mat => mats.includes(mat));
      if (next.length === current.length && next.every((mat, index) => mat === current[index])) {
        return current;
      }
      return next;
    });
  }, [payload, matsKey]);

  if (loading) return <p>Loading scoring sheet...</p>;
  if (error) return <div className="notice">Unable to load scoring sheet: {error}</div>;
  if (!payload) return null;
  const meetData = payload.meet;

  const perMat = new Map<number, Bout[]>();
  for (const mat of mats) perMat.set(mat, []);
  for (const bout of filteredBouts) {
    const mat = bout.mat ?? 1;
    const list = perMat.get(mat) ?? [];
    list.push(bout);
    perMat.set(mat, list);
  }
  for (const mat of mats) {
    perMat.set(
      mat,
      (perMat.get(mat) ?? []).slice().sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    );
  }

  type MatBoutEntry = { bout: Bout; boutNumber: string };
  const selectedMats = visibleMats ?? mats;
  const pages = selectedMats.flatMap((mat) => {
    const bouts = perMat.get(mat) ?? [];
    const entries: MatBoutEntry[] = bouts.map((bout, idx) => {
      const displayOrder = Math.max(0, (bout.order ?? (idx + 1)) - 1);
      return {
        bout,
        boutNumber: String(mat * 100 + displayOrder).padStart(3, "0"),
      };
    });
    const chunks = entries.length > 0 ? chunk(entries, BOUTS_PER_PAGE) : [[]];
    return chunks.map((entryChunk, idx) => ({
      mat,
      key: `mat-${mat}-page-${idx}`,
      pageIndex: idx,
      pageCount: chunks.length,
      entries: entryChunk,
    }));
  });

  const headerLabel = meetData.name || "Scoring Sheet";

  return (
    <div className="scoring-sheet-root" ref={sheetRef}>
      <style>{styles}</style>
      <div className="print-meet-header" aria-hidden="true">{headerLabel}</div>
      <ControlBar meetId={meetId} printTargetRef={sheetRef} printStyles={styles} />
      <div className="mat-toggle-bar">
        <span className="mat-toggle-label">Mats</span>
        <div className="mat-toggle-buttons" role="group" aria-label="Visible mats">
          {mats.map((mat) => {
            const isActive = selectedMats.includes(mat);
            return (
              <button
                key={`mat-toggle-${mat}`}
                type="button"
                className={`mat-toggle-btn${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => {
                      setVisibleMats(current => {
                    const activeMats = current ?? mats;
                    if (activeMats.includes(mat)) {
                      return activeMats.filter(value => value !== mat);
                    }
                    return [...activeMats, mat].sort((a, b) => a - b);
                  });
                }}
              >
                Mat {mat}
              </button>
            );
          })}
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="empty-state">Turn on at least one mat to show scoring sheets.</div>
      ) : (
        pages.map((page) => (
          <section className="sheet-page" key={page.key}>
            <div className="sheet-card">
              <div className="sheet-header">
                <div>
                  Mat {page.mat} Scoring Sheet
                  {page.pageCount > 1 ? ` (Page ${page.pageIndex + 1}/${page.pageCount})` : ""}
                </div>
                <div className="sheet-header-right">{meetData.name}</div>
              </div>

              {page.entries.length === 0 ? (
                <div className="blank-page">No bouts scheduled for this mat.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th className="c-bout">#</th>
                      <th className="c-team">T</th>
                      <th className="c-name">NAME</th>
                      <th className="c-corner" />
                      <th className="c-period">PERIOD 1</th>
                      <th className="c-small">C</th>
                      <th className="c-period">PERIOD 2</th>
                      <th className="c-small">C</th>
                      <th className="c-period">PERIOD 3</th>
                      <th className="c-ot">OT</th>
                      <th className="c-ot">OT</th>
                      <th className="c-scr">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      { length: BOUTS_PER_PAGE },
                      (_, slotIndex) => (slotIndex < page.entries.length ? page.entries[slotIndex] : null)
                    ).map((entry, slotIndex) => {
                      if (!entry) {
                        return (
                          <Fragment key={`${page.key}-blank-${slotIndex}`}>
                            <tr className="wrestler-divider">
                              <td className="c-bout match-divider-cell" rowSpan={2} />
                              <td className="c-team" />
                              <td className="c-name" />
                              <td className="c-corner">R</td>
                              <td className="c-period" />
                              <td className="c-small" />
                              <td className="c-period" />
                              <td className="c-small" />
                              <td className="c-period" />
                              <td className="c-ot" />
                              <td className="c-ot" />
                              <td className="c-scr" />
                            </tr>
                            <tr className="match-end">
                              <td className="c-team" />
                              <td className="c-name" />
                              <td className="c-corner">G</td>
                              <td className="c-period" />
                              <td className="c-small" />
                              <td className="c-period" />
                              <td className="c-small" />
                              <td className="c-period" />
                              <td className="c-ot" />
                              <td className="c-ot" />
                              <td className="c-scr" />
                            </tr>
                          </Fragment>
                        );
                      }
                      const { bout, boutNumber } = entry;
                      const red = wrestlers.get(bout.redId);
                      const green = wrestlers.get(bout.greenId);
                      const redTeam = red ? (teamSymbols.get(red.teamId) ?? "") : "";
                      const greenTeam = green ? (teamSymbols.get(green.teamId) ?? "") : "";
                      const redIsHome = !!(red && homeTeamId && red.teamId === homeTeamId);
                      const greenIsHome = !!(green && homeTeamId && green.teamId === homeTeamId);

                      return (
                        <Fragment key={bout.id}>
                          <tr className="wrestler-divider">
                            <td className="c-bout match-divider-cell" rowSpan={2}>{boutNumber}</td>
                            <td className={`c-team${redIsHome ? " home-cell" : ""}`}>{redTeam}</td>
                            <td className={`c-name${redIsHome ? " home-cell" : ""}`}>{displayName(red)}</td>
                            <td className="c-corner">R</td>
                            <td className="c-period" />
                            <td className="c-small" />
                            <td className="c-period" />
                            <td className="c-small" />
                            <td className="c-period" />
                            <td className="c-ot" />
                            <td className="c-ot" />
                            <td className="c-scr" />
                          </tr>
                          <tr className="match-end">
                            <td className={`c-team${greenIsHome ? " home-cell" : ""}`}>{greenTeam}</td>
                            <td className={`c-name${greenIsHome ? " home-cell" : ""}`}>{displayName(green)}</td>
                            <td className="c-corner">G</td>
                            <td className="c-period" />
                            <td className="c-small" />
                            <td className="c-period" />
                            <td className="c-small" />
                            <td className="c-period" />
                            <td className="c-ot" />
                            <td className="c-ot" />
                            <td className="c-scr" />
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
