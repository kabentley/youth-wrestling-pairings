"use client";

import { useEffect, useMemo, useState } from "react";
import ControlBar from "./ControlBar";

type MeetData = {
  id: string;
  name: string;
  date: string;
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

export default function WallChartTab({
  meetId,
  refreshIndex,
}: {
  meetId: string;
  refreshIndex?: number;
}) {
  const [payload, setPayload] = useState<WallChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const signal = refreshIndex ?? 0;
    void signal;
    let isMounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/wall-chart/${meetId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error ?? "Failed to load wall chart");
        }
        return res.json();
      })
      .then((data: WallChartPayload) => {
        if (!isMounted) return;
        setPayload(data);
      })
      .catch(err => {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load wall chart");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [meetId, refreshIndex]);

  const styles = `
          @media print {
            .wall-chart-root .noprint { display: none; }
            .wall-chart-root .chart-page { page-break-after: always; }
            .wall-chart-root .chart-page:last-of-type { page-break-after: auto; }
            .wall-chart-root .mat-block { page-break-after: always; }
            .wall-chart-root .mat-block:last-of-type { page-break-after: auto; }
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
          .wall-chart-root .mat-table {
            border-collapse: collapse;
            font-size: 14px;
          }
          .wall-chart-root .mat-table th,
          .wall-chart-root .mat-table td {
            border: 1px solid #eee;
            padding: 4px 6px;
            text-align: left;
          }
          .wall-chart-root .mat-table th {
            background: #f7f9fb;
          }
          .wall-chart-root .mat-empty {
            margin: 0;
            font-size: 14px;
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
          .wall-chart-root .chart-controls {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 12px;
            margin-bottom: 16px;
            padding: 12px 18px;
            border-radius: 14px;
            background: #fff;
            border: 1px solid #d5dbe2;
            box-shadow: 0 16px 32px rgba(13, 59, 102, 0.12);
          }
          .wall-chart-root .chart-controls .meet-heading {
            margin-right: auto;
            font-weight: 700;
            font-size: 18px;
            letter-spacing: 0.6px;
            color: #0d3b66;
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
          @media print {
            .wall-chart-root .chart-controls {
              display: none !important;
            }
            .wall-chart-root .chart-controls .meet-heading {
              display: none;
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
          }
          .wall-chart-root .team-table th,
          .wall-chart-root .team-table td {
            border: 1px solid #eee;
            padding: 4px 6px;
            text-align: left;
          }
          .wall-chart-root .match-line {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            gap: 18px;
            font-size: 14px;
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

  if (loading) {
    return <p>Loading wall chart…</p>;
  }
  if (error) {
    return <div className="notice">Unable to load wall chart: {error}</div>;
  }
  if (!payload) {
    return null;
  }

  const meet = payload.meet;
  const statuses = payload.statuses;
  const absentIds = new Set(statuses.filter(s => s.status === "NOT_COMING" || s.status === "ABSENT").map(s => s.wrestlerId));
  const filteredBouts = payload.bouts.filter(b => !absentIds.has(b.redId) && !absentIds.has(b.greenId));
  const teamIds = meet.meetTeams.map(mt => mt.team.id);
  const wMap = new Map(payload.wrestlers.map(w => [w.id, w]));
  const tMap = new Map(meet.meetTeams.map(mt => [mt.team.id, mt.team.symbol ?? mt.team.name]));
  const tColor = new Map(meet.meetTeams.map(mt => [mt.team.id, mt.team.color ?? "#000"]));
  const maxMat = Math.max(1, ...filteredBouts.map(b => b.mat ?? 1));
  const mats = Array.from({ length: maxMat }, (_, i) => i + 1);

  const perMat = new Map<number, Bout[]>();
  for (const mat of mats) perMat.set(mat, []);
  for (const bout of filteredBouts) {
    const mat = bout.mat ?? 1;
    if (!perMat.has(mat)) perMat.set(mat, []);
    perMat.get(mat)!.push(bout);
  }
  for (const mat of mats) perMat.get(mat)!.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

  type MatchInfo = {
    boutNumber: string;
    opponent: string;
  };
  const wrestlerMatches = new Map<string, MatchInfo[]>();
  for (const mat of mats) {
    const matBouts = perMat.get(mat) ?? [];
    matBouts.forEach((bout, idx) => {
      const boutNumber = String(mat * 100 + idx + 1).padStart(3, "0");
      const red = wMap.get(bout.redId);
      const green = wMap.get(bout.greenId);
      const redName = red ? `${red.first} ${red.last}`.trim() : bout.redId;
      const greenName = green ? `${green.first} ${green.last}`.trim() : bout.greenId;

      if (bout.redId) {
        const list = wrestlerMatches.get(bout.redId) ?? [];
        list.push({ boutNumber, opponent: greenName ?? "TBD" });
        wrestlerMatches.set(bout.redId, list);
      }
      if (bout.greenId) {
        const list = wrestlerMatches.get(bout.greenId) ?? [];
        list.push({ boutNumber, opponent: redName ?? "TBD" });
        wrestlerMatches.set(bout.greenId, list);
      }
    });
  }

  const teamCharts = meet.meetTeams.map(mt => {
    const members = payload.wrestlers
      .filter(w => w.teamId === mt.team.id)
      .map(w => ({
        id: w.id,
        name: `${w.first} ${w.last}`.trim(),
        matches: (wrestlerMatches.get(w.id) ?? []).slice().sort((a, b) => Number(a.boutNumber) - Number(b.boutNumber)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: mt.team.id,
      name: mt.team.name,
      symbol: mt.team.symbol,
      color: mt.team.color ?? "#000",
      members,
    };
  });

  const headerLabel =
    meet.name && meet.date
      ? `${meet.name} · ${new Date(meet.date).toISOString().slice(0, 10)} · ${meet.meetTeams.map(mt => mt.team.name).join(", ")}`
      : meet.name ?? "Meet";
  const cardLabel = meet.name && meet.date ? `${meet.name} · ${new Date(meet.date).toISOString().slice(0, 10)}` : meet.name ?? "Meet";

  function cellText(bout: Bout) {
    const red = wMap.get(bout.redId);
    const green = wMap.get(bout.greenId);
    const redTeam = red ? (tMap.get(red.teamId) ?? "") : "";
    const greenTeam = green ? (tMap.get(green.teamId) ?? "") : "";
    return {
      red: red ? `${red.first} ${red.last}${redTeam ? ` (${redTeam})` : ""}` : bout.redId,
      green: green ? `${green.first} ${green.last}${greenTeam ? ` (${greenTeam})` : ""}` : bout.greenId,
      redColor: red ? (tColor.get(red.teamId) ?? "#000") : "#000",
      greenColor: green ? (tColor.get(green.teamId) ?? "#000") : "#000",
    };
  }

  return (
    <div className="wall-chart-root">
      <style>{styles}</style>
      <ControlBar label={headerLabel} />
      <div>
        <section className="chart-page per-mat">
          <div className="mat-grid">
            {mats.map(mat => (
              <article key={mat} className="mat-block">
                <div className="mat-header">
                  <span>Mat {mat}</span>
                  <span className="card-meet-label">{cardLabel}</span>
                </div>
                {perMat.get(mat)?.length ? (
                  <table className="mat-table">
                    <thead>
                      <tr>
                        <th>Bout #</th>
                        <th>Wrestler 1</th>
                        <th>Wrestler 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perMat.get(mat)?.map((bout, idx) => {
                        const boutNumber = String(mat * 100 + idx + 1).padStart(3, "0");
                        const t = cellText(bout);
                        return (
                          <tr key={bout.id}>
                            <td>{boutNumber}</td>
                            <td style={{ color: t.redColor }}>{t.red}</td>
                            <td style={{ color: t.greenColor }}>{t.green}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="mat-empty">No bouts scheduled for this mat.</p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="chart-page per-team">
          {teamCharts.map(team => (
            <article key={team.id} className="team-block">
              <div className="team-header">
                <div className="team-name">
                  {team.name}
                  {team.symbol ? ` (${team.symbol})` : ""}
                </div>
                <span className="card-meet-label">{cardLabel}</span>
              </div>
              {team.members.length === 0 ? (
                <p className="team-empty">No wrestlers recorded.</p>
              ) : (
                <table className="team-table">
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
                                  <span className="match-opponent">{match.opponent}</span>
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
      </div>
    </div>
  );
}
