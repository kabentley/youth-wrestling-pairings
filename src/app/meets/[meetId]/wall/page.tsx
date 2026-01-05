import { db } from "@/lib/db";
import PrintButton from "./PrintButton";

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
  const absentIds = new Set(statuses.filter(s => s.status === "ABSENT").map(s => s.wrestlerId));

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

  const maxRows = Math.max(0, ...mats.map(m => perMat.get(m)!.length));

  function cellText(b: any) {
    const r = wMap.get(b.redId);
    const g = wMap.get(b.greenId);
    const rTeam = r ? (tMap.get(r.teamId) ?? r.teamId) : "";
    const gTeam = g ? (tMap.get(g.teamId) ?? g.teamId) : "";
    return {
      red: r ? `${r.first} ${r.last} (${r.weight})` : b.redId,
      green: g ? `${g.first} ${g.last} (${g.weight})` : b.greenId,
      redColor: r ? (tColor.get(r.teamId) ?? "#000000") : "#000000",
      greenColor: g ? (tColor.get(g.teamId) ?? "#000000") : "#000000",
      teams: (rTeam || gTeam) ? `${rTeam} vs ${gTeam}` : "",
    };
  }

  return (
    <html>
      <head>
        <title>Wall Chart</title>
        <style>{`
          @media print { .noprint { display: none; } }
          body { font-family: system-ui; padding: 14px; }
          h1 { margin: 0 0 6px 0; }
          .meta { font-size: 12px; opacity: 0.75; margin-bottom: 10px; }
          .grid {
            display: grid;
            grid-template-columns: 90px repeat(${maxMat}, minmax(240px, 1fr));
            gap: 8px;
            align-items: stretch;
          }
          .hdr {
            font-weight: 700;
            border: 1px solid #ddd;
            border-radius: 10px;
            padding: 10px;
            background: #fafafa;
          }
          .rowlbl {
            border: 1px solid #eee;
            border-radius: 10px;
            padding: 10px;
            background: #fff;
            font-weight: 600;
            text-align: center;
          }
          .cell {
            border: 1px solid #eee;
            border-radius: 10px;
            padding: 10px;
            background: #fff;
            min-height: 88px;
          }
          .small { font-size: 12px; opacity: 0.75; }
        `}</style>
      </head>
      <body>
        <div className="noprint" style={{ marginBottom: 10 }}>
          <a href={`/meets/${meetId}`}>← Back</a> &nbsp;|&nbsp;
          <a href={`/meets/${meetId}/matboard`} target="_blank" rel="noreferrer">Mat Board</a> &nbsp;|&nbsp;
          <PrintButton />
        </div>

        <h1>{meet?.name ?? "Meet"} — Wall Chart</h1>
        <div className="meta">
          {meet ? new Date(meet.date).toISOString().slice(0, 10) : ""} {meet?.location ? `— ${meet.location}` : ""}
          <br />
          Teams: {meet?.meetTeams.map(mt => mt.team.symbol).join(", ")}
        </div>

        <div className="grid">
          <div className="hdr">Bout</div>
          {mats.map(m => (<div key={m} className="hdr">Mat {m}</div>))}

          {Array.from({ length: maxRows }, (_, idx) => idx + 1).map(row => (
            <div key={`row-${row}`} style={{ display: "contents" }}>
              <div className="rowlbl">{row}</div>
              {mats.map(m => {
                const b = perMat.get(m)![row - 1];
                if (!b) return <div key={`c-${m}-${row}`} className="cell" />;

                const t = cellText(b);
                return (
                  <div key={`c-${m}-${row}`} className="cell">
                    <div className="small">{t.teams}</div>
                    <div style={{ fontWeight: 650, marginTop: 4, color: t.redColor }}>{t.red}</div>
                    <div style={{ marginTop: 2, color: t.greenColor }}>{t.green}</div>
                    <div style={{ marginTop: 6 }}>
                      <div className="small">{b.notes ?? ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </body>
    </html>
  );
}
