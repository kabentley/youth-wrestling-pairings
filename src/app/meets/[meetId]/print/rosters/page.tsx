import { db } from "@/lib/db";

function ageInYears(birthdate: Date, onDate: Date) {
  const diff = onDate.getTime() - birthdate.getTime();
  return diff / (365.25 * 24 * 60 * 60 * 1000);
}

export default async function PrintRosters({ params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    include: { meetTeams: { include: { team: true } } },
  });
  if (!meet) {
    return (
      <html>
        <body>Meet not found.</body>
      </html>
    );
  }

  const teamIds = meet.meetTeams.map(mt => mt.teamId);
  const wrestlers = await db.wrestler.findMany({
    where: { teamId: { in: teamIds }, active: true },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });
  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId },
    select: { wrestlerId: true, status: true },
  });
  const statusMap = new Map(statuses.map(s => [s.wrestlerId, s.status]));
  const meetDate = meet.date ?? new Date();

  return (
    <html>
      <head>
        <title>Print Rosters</title>
        <style>{`
          @media print { .noprint { display: none; } }
          body { font-family: system-ui; padding: 18px; color: #111; }
          h1, h2 { margin: 0 0 8px 0; }
          .small { font-size: 12px; color: #444; }
          .team { page-break-after: always; margin-top: 18px; }
          .team:last-of-type { page-break-after: auto; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-top: 1px solid #ddd; padding: 6px; vertical-align: top; font-size: 12px; }
          th { text-align: left; }
          .muted { color: #777; }
          .not-coming { color: #999; text-decoration: line-through; }
        `}</style>
      </head>
      <body>
        <div className="noprint" style={{ marginBottom: 12 }}>
          <a href={`/meets/${meetId}`}><- Back</a> &nbsp;|&nbsp;
          <button onClick={() => window.print()}>Print</button>
        </div>

        <h1>{meet.name} - Team Rosters</h1>
        <div className="small">
          {new Date(meet.date).toISOString().slice(0, 10)}
          {meet.location ? ` - ${meet.location}` : ""}
        </div>

        {meet.meetTeams.map(mt => {
          const team = mt.team;
          const teamWrestlers = wrestlers.filter(w => w.teamId === team.id);
          return (
            <div key={team.id} className="team">
              <h2>{team.name} {team.symbol ? `(${team.symbol})` : ""}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Last</th>
                    <th>First</th>
                    <th>Age</th>
                    <th>Weight</th>
                    <th>Exp</th>
                    <th>Skill</th>
                    <th>Status</th>
                    <th>Check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {teamWrestlers.map(w => {
                    const status = statusMap.get(w.id) ?? "COMING";
                    const isNotComing = status === "NOT_COMING" || status === "ABSENT";
                    return (
                      <tr key={w.id} className={isNotComing ? "not-coming" : ""}>
                        <td>{w.last}</td>
                        <td>{w.first}</td>
                        <td>{ageInYears(w.birthdate, meetDate).toFixed(1)}</td>
                        <td>{w.weight}</td>
                        <td>{w.experienceYears}</td>
                        <td>{w.skill}</td>
                        <td className={status === "COMING" ? "muted" : ""}>{status.replace(/_/g, " ")}</td>
                        <td />
                      </tr>
                    );
                  })}
                  {teamWrestlers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="muted">No active wrestlers.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}
      </body>
    </html>
  );
}
