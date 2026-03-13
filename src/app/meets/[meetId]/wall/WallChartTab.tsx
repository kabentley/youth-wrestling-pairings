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

const TEAM_MEMBERS_PER_PAGE = 32;
const MAT_BOUTS_PER_PAGE = 35;

export default function WallChartTab({
  meetId,
  refreshIndex,
  chartType = "both",
}: {
  meetId: string;
  refreshIndex?: number;
  chartType?: "mat" | "team" | "both";
}) {
  const [payload, setPayload] = useState<WallChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleMats, setVisibleMats] = useState<number[] | null>(null);
  const wallChartRef = useRef<HTMLDivElement | null>(null);
  const fetchRequestIdRef = useRef(0);

function formatWrestlerName(w?: Wrestler | null) {
  if (!w) return "";
  const last = w.last.trim();
  const first = w.first.trim();
  if (last && first) return `${last}, ${first}`;
  return last || first || "";
}

function formatWrestlerFirstLast(w?: Wrestler | null) {
  if (!w) return null;
  const first = w.first.trim();
  const last = w.last.trim();
  if (first && last) return `${first} ${last}`;
  const single = first || last;
  return single || null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  if (items.length === 0) return [[]];
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size));
  }
  return parts;
}

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
          throw new Error(json?.error ?? "Failed to load wall chart");
        }
        return res.json();
      })
      .then((data: WallChartPayload) => {
        if (!isMounted || requestId !== fetchRequestIdRef.current) return;
        setPayload(data);
      })
      .catch(err => {
        if (isMounted && requestId === fetchRequestIdRef.current) {
          setError(err instanceof Error ? err.message : "Failed to load wall chart");
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
            size: ${chartType === "team" ? "landscape" : "portrait"};
            size: letter ${chartType === "team" ? "landscape" : "portrait"};
            margin: 0.4in;
          }
          @media print {
            .wall-chart-root,
            .wall-chart-root * {
              -webkit-text-size-adjust: 100% !important;
              text-size-adjust: 100% !important;
            }
            .wall-chart-root .print-meet-header {
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
              line-height: 1.2;
            }
            .wall-chart-root {
              padding: 54px 0 0 !important;
              font-family: system-ui !important;
              font-size: 12px !important;
              line-height: 1.2 !important;
              width: 100% !important;
              max-width: 100% !important;
              -webkit-text-size-adjust: 100% !important;
              text-size-adjust: 100% !important;
            }
            .wall-chart-root .noprint { display: none; }
            .wall-chart-root .mat-toggle-bar { display: none !important; }
            .wall-chart-root .chart-page { page-break-after: always; }
            .wall-chart-root .chart-page:last-of-type { page-break-after: auto; }
            .wall-chart-root .mat-block { page-break-after: always; }
            .wall-chart-root .mat-block:last-of-type { page-break-after: auto; }
            .wall-chart-root .team-block { page-break-after: always; break-after: page; }
            .wall-chart-root .team-block:last-of-type { page-break-after: auto; break-after: auto; }
            .wall-chart-root .mat-block,
            .wall-chart-root .team-block {
              border: none !important;
              border-radius: 0 !important;
            }
            .wall-chart-root .mat-table {
              font-size: 8.5pt !important;
              width: 7.5in !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              table-layout: fixed !important;
            }
            .wall-chart-root .mat-col-bout {
              width: 0.6in !important;
            }
            .wall-chart-root .mat-col-name {
              width: 3.45in !important;
            }
            .wall-chart-root .mat-table th,
            .wall-chart-root .mat-table td {
              font-size: 8.5pt !important;
              padding: 0.03in 0.05in !important;
              line-height: 1.2 !important;
            }
            .wall-chart-root .mat-table th.mat-wrestler-header {
              font-size: 9pt !important;
              line-height: 1.15 !important;
            }
            .wall-chart-root .mat-table th.mat-bout-number,
            .wall-chart-root .mat-table td.mat-bout-number {
              font-size: 8.5pt !important;
              line-height: 1.15 !important;
            }
            .wall-chart-root .mat-table td.mat-wrestler-name {
              font-size: 9pt !important;
              line-height: 1.15 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
            }
            .wall-chart-root .mat-table-wrap {
              overflow: visible !important;
            }
            .wall-chart-root .mat-header,
            .wall-chart-root .team-header {
              font-size: 16px !important;
              line-height: 1.2 !important;
            }
            .wall-chart-root .team-name,
            .wall-chart-root .card-meet-label {
              line-height: 1.2 !important;
            }
            .wall-chart-root .mat-empty,
            .wall-chart-root .team-empty {
              line-height: 1.2 !important;
            }
            .wall-chart-root .team-table {
              font-size: 12px !important;
              width: 100% !important;
              table-layout: fixed !important;
            }
            .wall-chart-root .team-table th,
            .wall-chart-root .team-table td {
              font-size: 12px !important;
              line-height: 1.2 !important;
              padding: 2px 4px !important;
            }
            .wall-chart-root .match-line {
              font-size: 12px !important;
              line-height: 1.2 !important;
            }
            .wall-chart-root .team-empty {
              font-size: 12px !important;
              line-height: 1.2 !important;
            }
            .wall-chart-root .team-col-name {
              width: 190px !important;
            }
          }
          .print-document .wall-chart-root,
          .print-document .wall-chart-root * {
            -webkit-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }
          .print-document .wall-chart-root {
            padding: 54px 0 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .print-document .wall-chart-root .chart-controls,
          .print-document .wall-chart-root .mat-toggle-bar {
            display: none !important;
          }
          .print-document .wall-chart-root .mat-table {
            font-size: 8.5pt !important;
            width: 7.5in !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            table-layout: fixed !important;
          }
          .print-document .wall-chart-root .mat-col-bout {
            width: 0.6in !important;
          }
          .print-document .wall-chart-root .mat-col-name {
            width: 3.45in !important;
          }
          .print-document .wall-chart-root .mat-table th,
          .print-document .wall-chart-root .mat-table td {
            font-size: 8.5pt !important;
            padding: 0.03in 0.05in !important;
            line-height: 1.2 !important;
          }
          .print-document .wall-chart-root .mat-table th.mat-wrestler-header {
            font-size: 9pt !important;
            line-height: 1.15 !important;
          }
          .print-document .wall-chart-root .mat-table th.mat-bout-number,
          .print-document .wall-chart-root .mat-table td.mat-bout-number {
            font-size: 8.5pt !important;
            line-height: 1.15 !important;
          }
          .print-document .wall-chart-root .mat-table td.mat-wrestler-name {
            font-size: 9pt !important;
            line-height: 1.15 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .print-document .wall-chart-root .mat-table-wrap {
            overflow: visible !important;
          }
          .wall-chart-root {
            font-family: system-ui;
            padding: 14px;
          }
          .wall-chart-root h1 { margin: 0 0 6px 0; }
          .wall-chart-root h2 { margin: 24px 0 12px 0; font-weight: 600; }
          .wall-chart-root .meta { font-size: 12px; opacity: 0.75; margin-bottom: 10px; }
          .wall-chart-root .chart-page {
            page-break-after: always;
            break-after: page;
            margin-bottom: 18px;
          }
          .wall-chart-root .chart-page:last-of-type {
            page-break-after: auto;
          }
          .wall-chart-root .mat-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .wall-chart-root .mat-block {
            border: 1px solid #ddd;
            border-radius: 12px;
            padding: 8px;
            background: #fff;
            page-break-inside: avoid;
            break-inside: avoid;
            page-break-after: always;
          }
          .wall-chart-root .mat-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
            font-weight: 600;
            gap: 8px;
          }
          .wall-chart-root .mat-block:last-of-type {
            page-break-after: auto;
          }
          .wall-chart-root .mat-table-wrap {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .wall-chart-root .mat-table {
            border-collapse: collapse;
            font-size: 11px;
          }
          .wall-chart-root .mat-col-bout {
            width: 46px;
          }
          .wall-chart-root .mat-col-name {
            width: 180px;
          }
          .wall-chart-root .mat-table th,
          .wall-chart-root .mat-table td {
            border: 1px solid #eee;
            padding: 2px 4px;
            text-align: left;
          }
          .wall-chart-root .mat-table td.mat-wrestler-name {
            font-size: 13px;
          }
          .wall-chart-root .mat-table th.mat-bout-number,
          .wall-chart-root .mat-table td.mat-bout-number {
            text-align: center;
          }
          .wall-chart-root .mat-table th.mat-wrestler-header {
            text-align: center;
            font-size: 14px;
          }
          .wall-chart-root .mat-table th {
            background: #f7f9fb;
          }
          .wall-chart-root .mat-empty {
            margin: 0;
            font-size: 11px;
            color: #555;
          }
          .wall-chart-root .per-team {
            margin-top: 20px;
          }
          .wall-chart-root .team-block {
            border: 1px solid #eee;
            border-radius: 10px;
            padding: 8px;
            background: #fff;
            margin-bottom: 12px;
            page-break-inside: avoid;
          }
          .wall-chart-root .team-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
            gap: 8px;
          }
          .wall-chart-root .team-name {
            font-weight: 700;
            font-size: 16px;
          }
          .wall-chart-root .card-meet-label {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            white-space: nowrap;
          }
          .wall-chart-root .print-meet-header {
            display: none;
          }
          .wall-chart-root .mat-toolbar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: flex-start;
            gap: 12px;
            margin: 0 0 12px;
          }
          .wall-chart-root .mat-toolbar .chart-controls,
          .wall-chart-root .mat-toolbar .mat-toggle-bar {
            margin: 0;
          }
          .wall-chart-root .mat-toolbar .chart-controls {
            margin-left: auto;
            justify-content: flex-start;
          }
          .wall-chart-root .chart-controls {
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
          .wall-chart-root .chart-controls label {
            display: inline-flex;
            align-items: center;
          }
          .wall-chart-root .chart-controls input {
            width: auto;
          }
          .wall-chart-root .chart-controls select {
            padding: 6px 10px;
            border-radius: 6px;
            border: 1px solid #d5dbe2;
            background: #fff;
            font-size: 13px;
            font-weight: 600;
          }
          .wall-chart-root .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            border: 0;
          }
          .wall-chart-root .chart-controls button {
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
          .wall-chart-root .chart-controls button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
            box-shadow: none;
            background: #b0b5be;
          }
          .wall-chart-root .mat-toggle-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            margin: 0 0 12px;
          }
          .wall-chart-root .mat-toggle-label {
            font-size: 13px;
            font-weight: 700;
            color: #4b5563;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .wall-chart-root .mat-toggle-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .wall-chart-root .mat-toggle-btn {
            border: 1px solid #c7d2df;
            background: #fff;
            color: #1f2937;
            border-radius: 999px;
            padding: 7px 14px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
          }
          .wall-chart-root .mat-toggle-btn.is-active {
            background: #1e88e5;
            border-color: #1e88e5;
            color: #fff;
          }
          .wall-chart-root .mat-toggle-btn:hover {
            border-color: #1e88e5;
          }
          .wall-chart-root .mat-empty-state {
            border: 1px dashed #cbd5e1;
            border-radius: 8px;
            padding: 24px;
            color: #475569;
            text-align: center;
            background: #f8fafc;
            font-weight: 600;
          }
          .wall-chart-root .chart-controls .refresh-btn {
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
          @media (max-width: 720px) {
            .wall-chart-root {
              padding: 10px;
            }
            .wall-chart-root .chart-page {
              margin-bottom: 12px;
            }
            .wall-chart-root .mat-toolbar {
              flex-wrap: nowrap;
              align-items: center;
              gap: 8px;
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .wall-chart-root .mat-toolbar .chart-controls,
            .wall-chart-root .mat-toolbar .mat-toggle-bar {
              width: auto;
              min-width: 0;
              flex: 0 0 auto;
              align-items: center;
            }
            .wall-chart-root .mat-toolbar .chart-controls {
              margin-left: 0;
              flex-direction: row;
              align-items: center;
              justify-content: flex-start;
              gap: 8px;
            }
            .wall-chart-root .chart-controls {
              flex-direction: column;
              align-items: stretch;
              justify-content: flex-start;
              gap: 8px;
            }
            .wall-chart-root .mat-toolbar .chart-controls > span,
            .wall-chart-root .mat-toolbar .chart-controls label,
            .wall-chart-root .mat-toolbar .chart-controls button {
              width: auto;
            }
            .wall-chart-root .chart-controls > span,
            .wall-chart-root .chart-controls label,
            .wall-chart-root .chart-controls button {
              width: 100%;
            }
            .wall-chart-root .mat-toolbar .chart-controls button,
            .wall-chart-root .mat-toolbar .chart-controls select {
              min-height: 0;
            }
            .wall-chart-root .chart-controls button,
            .wall-chart-root .chart-controls select {
              min-height: 40px;
            }
            .wall-chart-root .mat-toggle-bar {
              flex-wrap: nowrap;
              align-items: center;
              gap: 8px;
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .wall-chart-root .mat-toggle-label {
              flex: 0 0 auto;
            }
            .wall-chart-root .mat-toggle-buttons {
              width: auto;
              min-width: 0;
              flex: 1 1 auto;
              flex-wrap: nowrap;
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .wall-chart-root .mat-toggle-btn {
              flex: 0 0 auto;
              text-align: center;
              padding: 8px 10px;
            }
            .wall-chart-root .mat-block {
              padding: 10px;
              border-radius: 10px;
            }
            .wall-chart-root .mat-header,
            .wall-chart-root .team-header {
              flex-direction: column;
              align-items: flex-start;
            }
            .wall-chart-root .card-meet-label {
              white-space: normal;
              font-size: 13px;
            }
            .wall-chart-root .mat-table {
              width: 334px;
              min-width: 334px;
              table-layout: fixed;
              font-size: 9px;
            }
            .wall-chart-root .mat-col-bout {
              width: 34px;
            }
            .wall-chart-root .mat-col-name {
              width: 150px;
            }
            .wall-chart-root .mat-table th,
            .wall-chart-root .mat-table td {
              padding: 3px 4px;
            }
            .wall-chart-root .mat-table td.mat-wrestler-name {
              font-size: 11px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          }
          @media print {
            .wall-chart-root .chart-controls {
              display: none !important;
            }
          }
          .black-and-white .wall-chart-root .mat-block,
          .black-and-white .wall-chart-root .team-block {
            background: #fff !important;
          }
          .black-and-white .wall-chart-root .mat-table th,
          .black-and-white .wall-chart-root .mat-table td,
          .black-and-white .wall-chart-root .match-opponent,
          .black-and-white .wall-chart-root .team-name,
          .black-and-white .wall-chart-root .card-meet-label {
            color: #000 !important;
            background: transparent !important;
          }
          .wall-chart-root .team-table {
            border-collapse: collapse;
            font-size: 14px;
            width: 100%;
          }
          .wall-chart-root .team-col-name {
            width: 190px;
          }
          .wall-chart-root .team-table th,
          .wall-chart-root .team-table td {
            border: 1px solid #eee;
            padding: 2px 4px;
            text-align: left;
          }
          .wall-chart-root .team-table td:first-child,
          .wall-chart-root .team-table .wrestler-name {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .wall-chart-root .match-line {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            column-gap: 18px;
            row-gap: 2px;
            font-size: 14px;
            line-height: 1.1;
          }
          .wall-chart-root .match-chip {
            display: inline-flex;
            align-items: baseline;
            gap: 0;
          }
          .wall-chart-root .match-bout {
            font-weight: 400;
            margin-right: 6px;
          }
          .wall-chart-root .match-opponent {
            font-weight: 400;
          }
          .wall-chart-root .team-empty {
            font-size: 14px;
            color: #555;
            margin: 0 0 12px 0;
          }
          .wall-chart-root .wrestler-name {
            font-weight: 400;
          }
  `;

  const derivedMeet = payload?.meet ?? null;
  const statuses = payload?.statuses ?? [];
  const absentIds = new Set(
    statuses
      .filter(s => s.status === "NOT_COMING" || s.status === "ABSENT")
      .map(s => s.wrestlerId)
  );
  const filteredBouts = (payload?.bouts ?? []).filter(
    b => !absentIds.has(b.redId) && !absentIds.has(b.greenId)
  );
  const wMap = new Map((payload?.wrestlers ?? []).map(w => [w.id, w]));
  const meetTeams = derivedMeet?.meetTeams ?? [];
  const tMap = new Map(meetTeams.map(mt => [mt.team.id, mt.team.symbol ?? mt.team.name]));
  const teamSymbolMap = new Map(meetTeams.map(mt => [mt.team.id, mt.team.symbol ?? ""]));
  const tColor = new Map(meetTeams.map(mt => [mt.team.id, mt.team.color ?? "#000"]));
  const wallChartPrintOrientation = chartType === "team" ? "landscape" : "portrait";

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
  const teamTextColor = (teamId?: string | null) => {
    const color = teamId ? (tColor.get(teamId) ?? "#000") : "#000";
    if (!color.startsWith("#") || color.length !== 7) return color;
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
  const maxMat = Math.max(1, ...filteredBouts.map(b => b.mat ?? 1));
  const mats = Array.from({ length: maxMat }, (_, i) => i + 1);
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

  if (loading) {
    return <p>Loading wall chart...</p>;
  }
  if (error) {
    return <div className="notice">Unable to load wall chart: {error}</div>;
  }
  if (!payload) {
    return null;
  }
  const meet = payload.meet;

  const perMat = new Map<number, Bout[]>();
  for (const mat of mats) perMat.set(mat, []);
  for (const bout of filteredBouts) {
    const mat = bout.mat ?? 1;
    if (!perMat.has(mat)) perMat.set(mat, []);
    perMat.get(mat)!.push(bout);
  }
  for (const mat of mats) perMat.get(mat)!.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  const selectedMats = visibleMats ?? mats;
  const matPages = selectedMats.flatMap((mat) => {
    const entries = (perMat.get(mat) ?? []).map((bout, idx) => {
      const displayOrder = Math.max(0, (bout.order ?? (idx + 1)) - 1);
      return {
        bout,
        boutNumber: String(mat * 100 + displayOrder).padStart(3, "0"),
      };
    });
    const pages = chunkArray(entries, MAT_BOUTS_PER_PAGE);
    return pages.map((pageEntries, pageIndex) => ({
      mat,
      entries: pageEntries,
      pageIndex,
      pageCount: pages.length,
      pageKey: `${mat}-${pageIndex}`,
    }));
  });

  type MatchInfo = {
    boutNumber: string;
    opponentName: string;
    opponentColor: string;
    opponentTeamLabel: string;
  };
  const wrestlerMatches = new Map<string, MatchInfo[]>();
  for (const mat of mats) {
    const matBouts = perMat.get(mat) ?? [];
    matBouts.forEach((bout, idx) => {
      const displayOrder = Math.max(0, (bout.order ?? (idx + 1)) - 1);
      const boutNumber = String(mat * 100 + displayOrder).padStart(3, "0");
      const red = wMap.get(bout.redId);
      const green = wMap.get(bout.greenId);
      const greenInfo = green
        ? {
            opponentName: formatWrestlerFirstLast(green) ?? `${green.first} ${green.last}`.trim(),
            opponentColor: teamTextColor(green.teamId),
            opponentTeamLabel: teamSymbolMap.get(green.teamId) ?? tMap.get(green.teamId) ?? "",
          }
        : { opponentName: bout.greenId, opponentColor: "#000", opponentTeamLabel: "" };
      const redInfo = red
        ? {
            opponentName: formatWrestlerFirstLast(red) ?? `${red.first} ${red.last}`.trim(),
            opponentColor: teamTextColor(red.teamId),
            opponentTeamLabel: teamSymbolMap.get(red.teamId) ?? tMap.get(red.teamId) ?? "",
          }
        : { opponentName: bout.redId, opponentColor: "#000", opponentTeamLabel: "" };

      if (bout.redId) {
        const list = wrestlerMatches.get(bout.redId) ?? [];
        list.push({
          boutNumber,
          opponentName: greenInfo.opponentName || "TBD",
          opponentColor: greenInfo.opponentColor,
          opponentTeamLabel: greenInfo.opponentTeamLabel,
        });
        wrestlerMatches.set(bout.redId, list);
      }
      if (bout.greenId) {
        const list = wrestlerMatches.get(bout.greenId) ?? [];
        list.push({
          boutNumber,
          opponentName: redInfo.opponentName || "TBD",
          opponentColor: redInfo.opponentColor,
          opponentTeamLabel: redInfo.opponentTeamLabel,
        });
        wrestlerMatches.set(bout.greenId, list);
      }
    });
  }

  const teamCharts = meet.meetTeams.map(mt => {
    const members = payload.wrestlers
      .filter(w => w.teamId === mt.team.id && !absentIds.has(w.id))
      .map(w => ({
        id: w.id,
        name: formatWrestlerName(w),
        matches: (wrestlerMatches.get(w.id) ?? []).slice().sort((a, b) => Number(a.boutNumber) - Number(b.boutNumber)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: mt.team.id,
      label: formatTeamName(mt.team),
      color: mt.team.color ?? "#000",
      members,
    };
  });
  const teamPages = teamCharts.flatMap((team) => {
    const memberPages = chunkArray(team.members, TEAM_MEMBERS_PER_PAGE);
    return memberPages.map((members, index) => ({
      ...team,
      members,
      pageIndex: index,
      pageCount: memberPages.length,
      pageKey: `${team.id}-${index}`,
    }));
  });

  const headerLabel =
    meet.name
      ? `${meet.name} · ${meet.meetTeams.map(mt => formatTeamName(mt.team)).join(", ")}`
      : meet.name;
  const cardLabel = meet.name;

  function cellText(bout: Bout) {
    const red = wMap.get(bout.redId);
    const green = wMap.get(bout.greenId);
    const left = red;
    const right = green;
    const leftTeam = left ? (tMap.get(left.teamId) ?? "") : "";
    const rightTeam = right ? (tMap.get(right.teamId) ?? "") : "";
    return {
      red: left ? `${left.first} ${left.last}${leftTeam ? ` (${leftTeam})` : ""}` : bout.redId,
      green: right ? `${right.first} ${right.last}${rightTeam ? ` (${rightTeam})` : ""}` : bout.greenId,
      redColor: left ? teamTextColor(left.teamId) : "#000",
      greenColor: right ? teamTextColor(right.teamId) : "#000",
    };
  }

  return (
    <div className="wall-chart-root" ref={wallChartRef}>
      <style>{styles}</style>
      <div className="print-meet-header" aria-hidden="true">{headerLabel}</div>
      {(chartType === "both" || chartType === "mat") ? (
        <div className="mat-toolbar">
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
          <ControlBar meetId={meetId} printTargetRef={wallChartRef} printStyles={styles} printOrientation={wallChartPrintOrientation} />
        </div>
      ) : (
        <ControlBar meetId={meetId} printTargetRef={wallChartRef} printStyles={styles} printOrientation={wallChartPrintOrientation} />
      )}
      <div>
        {(chartType === "both" || chartType === "mat") && (
          <section className="chart-page per-mat">
            <div className="mat-grid">
              {matPages.length === 0 ? (
                <div className="mat-empty-state">Turn on at least one mat to show mat sheets.</div>
              ) : (
                matPages.map((matPage) => (
                  <article key={matPage.pageKey} className="mat-block">
                    <div className="mat-header">
                      <span>
                        <strong>Mat {matPage.mat}</strong> (Page {matPage.pageIndex + 1}/{matPage.pageCount})
                      </span>
                      <span className="card-meet-label">{cardLabel}</span>
                    </div>
                    {matPage.entries.length ? (
                      <div className="mat-table-wrap">
                        <table className="mat-table">
                          <colgroup>
                            <col className="mat-col-bout" />
                            <col className="mat-col-name" />
                            <col className="mat-col-name" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th className="mat-bout-number">Bout #</th>
                              <th className="mat-wrestler-header">Wrestler 1</th>
                              <th className="mat-wrestler-header">Wrestler 2</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matPage.entries.map(({ bout, boutNumber }) => {
                              const t = cellText(bout);
                              return (
                                <tr key={bout.id}>
                                  <td className="mat-bout-number">{boutNumber}</td>
                                  <td className="mat-wrestler-name" style={{ color: t.redColor }}>{t.red}</td>
                                  <td className="mat-wrestler-name" style={{ color: t.greenColor }}>{t.green}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mat-empty">No bouts scheduled for this mat.</p>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {(chartType === "both" || chartType === "team") && (
          <section className="chart-page per-team">
            {teamPages.map(team => (
              <article key={team.pageKey} className="team-block">
                <div className="team-header">
                  <div className="team-name">
                    {team.label} (Page {team.pageIndex + 1}/{team.pageCount})
                  </div>
                  <span className="card-meet-label">{cardLabel}</span>
                </div>
                {team.members.length === 0 ? (
                  <p className="team-empty">No wrestlers recorded.</p>
                ) : (
                  <table className="team-table">
                    <colgroup>
                      <col className="team-col-name" />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Matches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map(member => (
                        <tr key={member.id}>
                          <td>
                            <span className="wrestler-name" style={{ color: "#000" }}>{member.name}</span>
                          </td>
                          <td>
                            {member.matches.length === 0 ? (
                              <span className="team-empty">No matches scheduled.</span>
                            ) : (
                              <div className="match-line">
                            {member.matches.map(match => (
                              <span key={`${member.id}-${match.boutNumber}`} className="match-chip">
                                <span className="match-bout">#{match.boutNumber}</span>
                                <span
                                  className="match-opponent"
                                  style={{ color: match.opponentColor }}
                                >
                                  {match.opponentName}
                                  {match.opponentTeamLabel ? ` (${match.opponentTeamLabel})` : ""}
                                </span>
                              </span>
                            ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
