export type TeamLabel = {
  name?: string | null;
  symbol?: string | null;
};

export function formatTeamName(team?: TeamLabel | null) {
  const name = (team?.name ?? "").trim();
  const symbol = (team?.symbol ?? "").trim();
  if (symbol && name) return `${symbol} - ${name}`;
  if (symbol) return symbol;
  if (name) return name;
  return "Team";
}
