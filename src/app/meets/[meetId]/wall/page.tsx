import Head from "next/head";
import { db } from "@/lib/db";
import ControlBar from "./ControlBar";

export const dynamic = "force-dynamic";

type Params = { params: { meetId: string } };

export async function generateMetadata({ params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  if (!meetId) {
    return { title: "Wall Charts" };
  }
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    include: { meetTeams: { include: { team: true } } },
  });
  const meetDate = meet?.date ? new Date(meet.date).toISOString().slice(0, 10) : null;
  const titleParts = [meet?.name ?? "Meet", meetDate].filter(Boolean);
  const title = titleParts.join(" · ");
  return { title: `${title} - Wall Charts` };
}

export default async function WallChart({ params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    include: { meetTeams: { include: { team: true } } },
  });

  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { score: "asc" }],
  });

  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId },
    select: { wrestlerId: true, status: true },
  });
  const absentIds = new Set(statuses.filter(s => s.status === "NOT_COMING" || s.status === "ABSENT").map(s => s.wrestlerId));

  const filteredBouts = bouts.filter(b => !absentIds.has(b.redId) && !absentIds.has(b.greenId));

  const teamIds = meet?.meetTeams.map(mt => mt.teamId) ?? [];
  const wrestlers = await db.wrestler.findMany({ where: { teamId: { in: teamIds } } });
  const wMap = new Map(wrestlers.map(w => [w.id, w]));
  const tMap = new Map(meet?.meetTeams.map(mt => [mt.team.id, mt.team.symbol]) ?? []);
  const tColor = new Map(meet?.meetTeams.map(mt => [mt.team.id, mt.team.color]) ?? []);

  const maxMat = Math.max(1, ...filteredBouts.map(b => b.mat ?? 1));
  const mats = Array.from({ length: maxMat }, (_, i) => i + 1);

  const perMat = new Map<number, typeof bouts>();
  for (const m of mats) perMat.set(m, []);
  for (const b of filteredBouts) {
    const m = b.mat ?? 1;
    if (!perMat.has(m)) perMat.set(m, []);
    perMat.get(m)!.push(b);
  }
  for (const m of mats) perMat.get(m)!.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

  type MatchInfo = {
    boutNumber: string;
    opponent: string;
  };
  const wrestlerMatches = new Map<string, MatchInfo[]>();
  for (const mat of mats) {
    const boutsForMat = perMat.get(mat) ?? [];
    boutsForMat.forEach((bout, idx) => {
      const boutNumber = String(mat * 100 + idx + 1).padStart(3, "0");
      const red = wMap.get(bout.redId);
      const green = wMap.get(bout.greenId);
      const redName = red ? `${red.first} ${red.last}`.trim() : bout.redId;
      const greenName = green ? `${green.first} ${green.last}`.trim() : bout.greenId;
      const redTeamSymbol = red ? (tMap.get(red.teamId) ?? "") : "";
      const greenTeamSymbol = green ? (tMap.get(green.teamId) ?? "") : "";
      const redTeamColor = red ? (tColor.get(red.teamId) ?? "#000") : "#000";
      const greenTeamColor = green ? (tColor.get(green.teamId) ?? "#000") : "#000";

      if (bout.redId) {
        const list = wrestlerMatches.get(bout.redId) ?? [];
        list.push({
          boutNumber,
          opponent: greenName ?? "TBD",
          opponentTeam: greenTeamSymbol ?? "",
          opponentColor: greenTeamColor,
        });
        wrestlerMatches.set(bout.redId, list);
      }
      if (bout.greenId) {
        const list = wrestlerMatches.get(bout.greenId) ?? [];
        list.push({
          boutNumber,
          opponent: redName ?? "TBD",
          opponentTeam: redTeamSymbol ?? "",
          opponentColor: redTeamColor,
        });
        wrestlerMatches.set(bout.greenId, list);
      }
    });
  }

  const teamsList = meet?.meetTeams.map(mt => mt.team) ?? [];
  const teamCharts = teamsList.map(team => {
    const members = wrestlers
      .filter(w => w.teamId === team.id)
      .map(w => {
        const matches = (wrestlerMatches.get(w.id) ?? []).slice().sort((a, b) => Number(a.boutNumber) - Number(b.boutNumber));
        return {
          id: w.id,
          name: `${w.first} ${w.last}`.trim(),
          matches,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: team.id,
      name: team.name,
      symbol: team.symbol,
      color: team.color ?? "#000000",
      members,
    };
  });

  function cellText(b: any) {
    const r = wMap.get(b.redId);
    const g = wMap.get(b.greenId);
    const rTeam = r ? (tMap.get(r.teamId) ?? r.teamId) : "";
    const gTeam = g ? (tMap.get(g.teamId) ?? g.teamId) : "";
    return {
      red: r ? `${r.first} ${r.last}${rTeam ? ` (${rTeam})` : ""}` : b.redId,
      green: g ? `${g.first} ${g.last}${gTeam ? ` (${gTeam})` : ""}` : b.greenId,
      redColor: r ? (tColor.get(r.teamId) ?? "#000000") : "#000000",
      greenColor: g ? (tColor.get(g.teamId) ?? "#000000") : "#000000",
      teams: (rTeam || gTeam) ? `${rTeam} vs ${gTeam}` : "",
    };
  }

  const styles = `
          @media print {
            .noprint { display: none; }
            .chart-page { page-break-after: always; }
            .chart-page:last-of-type { page-break-after: auto; }
            .mat-block { page-break-after: always; }
            .mat-block:last-of-type { page-break-after: auto; }
          }
          body { font-family: system-ui; padding: 14px; }
          h1 { margin: 0 0 6px 0; }
          h2 { margin: 24px 0 12px 0; font-weight: 600; }
          .meta { font-size: 12px; opacity: 0.75; margin-bottom: 10px; }
          .chart-page {
            page-break-after: always;
            break-after: page;
            margin-bottom: 18px;
          }
          .chart-page:last-of-type {
            page-break-after: auto;
          }
          .mat-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .mat-block {
            border: 1px solid #ddd;
            border-radius: 12px;
            padding: 8px;
            background: #fff;
            page-break-inside: avoid;
            break-inside: avoid;
            page-break-after: always;
          }
          .mat-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
            font-weight: 600;
            gap: 8px;
          }
          .mat-block:last-of-type {
            page-break-after: auto;
          }
          .mat-table {
            border-collapse: collapse;
            font-size: 14px;
          }
          .mat-table th,
          .mat-table td {
            border: 1px solid #eee;
            padding: 4px 6px;
            text-align: left;
          }
          .mat-table th {
            background: #f7f9fb;
          }
          .mat-empty {
            margin: 0;
            font-size: 14px;
            color: #555;
          }
          .per-team {
            margin-top: 20px;
          }
          .team-block {
            border: 1px solid #eee;
            border-radius: 10px;
            padding: 8px;
            background: #fff;
            margin-bottom: 12px;
            page-break-inside: avoid;
          }
          .team-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
            gap: 8px;
          }
          .team-name {
            font-weight: 700;
            font-size: 16px;
          }
          .card-meet-label {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            white-space: nowrap;
          }
          .chart-controls {
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
          .chart-controls .meet-heading {
            margin-right: auto;
            font-weight: 700;
            font-size: 18px;
            letter-spacing: 0.6px;
            color: #0d3b66;
          }
          .chart-controls label {
            display: inline-flex;
            align-items: center;
          }
          .chart-controls input {
            width: auto;
          }
          .chart-controls select {
            padding: 6px 10px;
            border-radius: 6px;
            border: 1px solid #d5dbe2;
            background: #fff;
            font-size: 13px;
            font-weight: 600;
          }
          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            border: 0;
          }
          .chart-controls button {
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
          .chart-controls button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
            box-shadow: none;
            background: #b0b5be;
          }
          .chart-controls .refresh-btn {
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
            .chart-controls {
              display: none !important;
            }
            .chart-controls .meet-heading {
              display: none;
            }
          }
          .black-and-white .mat-block,
          .black-and-white .team-block {
            background: #fff !important;
          }
          .black-and-white .mat-table th,
          .black-and-white .mat-table td,
          .black-and-white .match-opponent,
          .black-and-white .team-name,
          .black-and-white .card-meet-label {
            color: #000 !important;
            background: transparent !important;
          }
          .team-table {
            border-collapse: collapse;
            font-size: 14px;
          }
          .team-table th,
          .team-table td {
            border: 1px solid #eee;
            padding: 4px 6px;
            text-align: left;
          }
          .match-line {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            gap: 18px;
            font-size: 14px;
          }
          .match-chip {
            display: inline-flex;
            align-items: baseline;
            gap: 0;
          }
          .match-bout {
            font-weight: 400;
            margin-right: 6px;
          }
          .match-opponent {
            font-weight: 400;
          }
          .team-empty {
            font-size: 14px;
            color: #555;
            margin: 0 0 12px 0;
          }
          .wrestler-name {
            font-weight: 400;
          }
        `;
  const meetDate = meet?.date ? new Date(meet.date).toISOString().slice(0, 10) : null;
  const teamNames = meet?.meetTeams?.map(mt => mt.team.name ?? "").filter(name => name) ?? [];
  const headerLabel =
    meet && (meetDate || teamNames.length)
      ? `${meet.name ?? "Meet"}${meetDate ? ` · ${meetDate}` : ""}${teamNames.length ? ` · ${teamNames.join(", ")}` : ""}`
      : meet?.name ?? "Meet";
  const cardLabel =
    meet && meetDate
      ? `${meet.name ?? "Meet"} · ${meetDate}`
      : meet?.name ?? "Meet";
  const tabTitle = cardLabel;
  return (
    <>
      <Head>
        <title>{tabTitle} - Wall Charts</title>
      </Head>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div>
        <ControlBar label={headerLabel} />

        <section className="chart-page per-mat">
          <div className="mat-grid">
            {mats.map((mat) => {
              const boutsForMat = perMat.get(mat) ?? [];
              return (
                <article key={mat} className="mat-block">
                  <div className="mat-header">
                    <span>Mat {mat}</span>
                    <span className="card-meet-label">{cardLabel}</span>
                  </div>
                  {boutsForMat.length === 0 ? (
                    <p className="mat-empty">No bouts scheduled for this mat.</p>
                  ) : (
                    <table className="mat-table">
                      <thead>
                        <tr>
                          <th>Bout #</th>
                          <th>Wrestler 1</th>
                          <th>Wrestler 2</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boutsForMat.map((bout, index) => {
                          const boutNumber = String(mat * 100 + index + 1).padStart(3, "0");
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
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="chart-page per-team">
          {teamCharts.length === 0 && (
            <p className="team-empty">No wrestlers found for this meet.</p>
          )}
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
                              {member.matches.map((match, idx) => (
                                <span
                                  key={`${member.id}-${match.boutNumber}`}
                                  className="match-chip"
                                >
                                  <span className="match-bout">#{match.boutNumber}</span>
                                  <span
                                    className="match-opponent"
                                    style={{ color: match.opponentColor || "#000" }}
                                  >
                                    {match.opponent}
                                    {match.opponentTeam ? ` (${match.opponentTeam})` : ""}
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
      </div>
    </>
  );
}
