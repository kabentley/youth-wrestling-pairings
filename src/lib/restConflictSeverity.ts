export function restConflictSeverityLabel(minGap: number) {
  if (minGap <= 1) return "Severe";
  if (minGap <= 4) return "Major";
  return "Minor";
}

export function shouldShowRestConflict(minGap: number) {
  return restConflictSeverityLabel(minGap) !== "Minor";
}
