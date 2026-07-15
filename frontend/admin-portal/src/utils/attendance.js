// Single source of truth for "does this status count as present" and the
// resulting attendance rate — Late is treated as attended (present, just
// tardy), Excused still counts against the rate (it's the reason that's
// excused, not the absence itself). Matches SF2 (the official DepEd form).
export function isPresentStatus(status) {
  return status === "P" || status === "L";
}

export function attendanceRate({ present = 0, late = 0, total = 0 } = {}) {
  return total ? Math.round(((present + late) / total) * 100) : null;
}
