type WrestlerLabelInput = {
  first: string;
  last: string;
  team?: { symbol: string | null } | null;
};

export function formatWrestlerLabel(wrestler?: WrestlerLabelInput | null) {
  if (!wrestler) return null;
  const name = `${wrestler.first} ${wrestler.last}`.trim();
  if (!name) return null;
  const symbol = wrestler.team?.symbol?.trim();
  if (!symbol) return name;
  return `${name} (${symbol})`;
}
