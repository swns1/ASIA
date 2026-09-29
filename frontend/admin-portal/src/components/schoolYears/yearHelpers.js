import { computeDefaultSchoolYear } from "../../utils/schoolYear";

// Helpers for the School Years pages: a new year's suggested label and dates,
// and how far through its dates a year is.

// "2025-06-08" -> "2026-06-08". Date strings, not Date objects: a Date built
// from a bare ISO date is UTC midnight, and shifting it can land a day off.
export function shiftYear(iso, years) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(y) + years}-${m}-${d}`;
}

export function nextLabel(label) {
  const first = parseInt(String(label).slice(0, 4), 10);
  return Number.isNaN(first) ? "" : `${first + 1}-${first + 2}`;
}

export function previousLabel(label) {
  const first = parseInt(String(label).slice(0, 4), 10);
  return Number.isNaN(first) ? "" : `${first - 1}-${first}`;
}

// A new year starts as a copy of the latest one, a year later: most schools
// keep the same calendar shape, so the dates only need a nudge, not typing.
export function suggestNewYear(years) {
  const latest = years[0];
  if (!latest) return { label: computeDefaultSchoolYear(), start_date: "", end_date: "" };
  return {
    label: nextLabel(latest.label),
    start_date: shiftYear(latest.start_date, 1),
    end_date: shiftYear(latest.end_date, 1),
  };
}

export function progressThrough(start, end) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (!s || !e || now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

// The years Compare opens on: the current year and the two before it -- this
// year against last, and one more so a change can be seen as a trend. With no
// current year, the latest three. `labels` needn't be sorted.
export function defaultCompareYears(labels, current, count = 3) {
  const sorted = [...labels].sort();
  const upTo = current && sorted.includes(current) ? sorted.slice(0, sorted.indexOf(current) + 1) : sorted;
  return upTo.slice(-count);
}
