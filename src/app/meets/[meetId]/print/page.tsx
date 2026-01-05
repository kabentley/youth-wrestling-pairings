import { db } from "@/lib/db";

export default async function PrintMeet({ params }: { params: { meetId: string } }) {
  const meet = await db.meet.findUnique({
    where: { id: params.meetId },
    include: { meetTeams: { include: { team: true } } },
  });

  const bouts = await db.bout.findMany({
    where: { meetId: params.meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { score: "asc" }],
  });

  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId: params.meetId },
    select: { wrestlerId: true, status: true },
  });
  const absentIds = new Set(statuses.filter(s => s.status === "ABSENT").map(s => s.wrestlerId));
  const filteredBouts = bouts.filter(b => !absentIds.has(b.redId) && !absentIds.has(b.greenId));

  const teamIds = meet?.meetTeams.map(mt => mt.teamId) ?? [];
  const wrestlers = await db.wrestler.findMany({ where: { teamId: { in: teamIds } } });
  const wMap = new Map(wrestlers.map(w => [w.id, w]));
  const tMap = new Map(meet?.meetTeams.map(mt => [mt.team.id, mt.team.symbol]) ?? []);
  const tColor = new Map(meet?.meetTeams.map(mt => [mt.team.id, mt.team.color]) ?? []);

  const mats = new Map<number, typeof bouts>();
  for (const b of filteredBouts) {
    const m = b.mat ?? 0;
    if (!mats.has(m)) mats.set(m, []);
    mats.get(m)!.push(b);
  }

  return (
    <html>
      <head>
        <title>Print Meet</title>
        <style>{`
          @media print { .noprint { display: none; } }
          body { font-family: system-ui; padding: 18px; }
          h1,h2 { margin: 0 0 8px 0; }
          .mat { page-break-after: always; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-top: 1px solid #ddd; padding: 6px; vertical-align: top; }
          .small { font-size: 12px; color: #444; }
        `}</style>
      </head>
      <body>
        <div className="noprint" style={{ marginBottom: 12 }}>
          <a href={`/meets/${params.meetId}`}>← Back</a> &nbsp;|&nbsp;
          <button onClick={() => window.print()}>Print</button>
        </div>

        <h1>{meet?.name ?? "Meet"}</h1>
        <div className="small">
          {meet ? new Date(meet.date).toISOString().slice(0, 10) : ""}{" "}
          {meet?.location ? `— ${meet.location}` : ""}
          <br />
          Teams: {meet?.meetTeams.map(mt => mt.team.symbol).join(", ")}
        </div>

        {Array.from(mats.entries())
          .filter(([mat]) => mat !== 0)
          .sort((a, b) => a[0] - b[0])
          .map(([mat, list]) => (
            <div key={mat} className="mat">
              <h2>Mat {mat}</h2>
              <table>
                <thead>
                  <tr>
                    <th align="left">Bout</th>
                    <th align="left">Red</th>
                    <th align="left">Green</th>
                    <th align="left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(b => {
                    const r = wMap.get(b.redId);
                    const g = wMap.get(b.greenId);
                    return (
                      <tr key={b.id}>
                        <td>{b.order ?? ""}</td>
                        <td>
                          <span style={{ color: tColor.get(r?.teamId ?? "") ?? "#000000" }}>
                            {r ? `${r.first} ${r.last} (${r.weight}) — ${tMap.get(r.teamId) ?? r.teamId}` : b.redId}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: tColor.get(g?.teamId ?? "") ?? "#000000" }}>
                            {g ? `${g.first} ${g.last} (${g.weight}) — ${tMap.get(g.teamId) ?? g.teamId}` : b.greenId}
                          </span>
                        </td>
                        <td className="small">
                          {b.locked ? "LOCKED • " : ""}
                          {b.notes ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

        {mats.has(0) && (mats.get(0)!.length > 0) && (
          <div>
            <h2>Unassigned (no mat)</h2>
            <table>
              <thead>
                <tr>
                  <th align="left">Red</th>
                  <th align="left">Green</th>
                  <th align="left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {mats.get(0)!.map(b => (
                  <tr key={b.id}>
                    <td style={{ color: tColor.get(wMap.get(b.redId)?.teamId ?? "") ?? "#000000" }}>
                      {wMap.get(b.redId)?.first} {wMap.get(b.redId)?.last}
                    </td>
                    <td style={{ color: tColor.get(wMap.get(b.greenId)?.teamId ?? "") ?? "#000000" }}>
                      {wMap.get(b.greenId)?.first} {wMap.get(b.greenId)?.last}
                    </td>
                    <td className="small">{b.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </body>
    </html>
  );
}
