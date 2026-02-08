function darkenHex(color: string, amount: number) {
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
}

export function adjustTeamTextColor(color?: string | null) {
  if (!color) return "#000000";
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
}
