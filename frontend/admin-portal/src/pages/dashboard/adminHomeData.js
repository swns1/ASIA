// Plain helpers behind AdminHome: wording, dates and the attention queue.
// Kept out of the component file so it only exports components (fast refresh)
// and so these can be tested on their own.

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function greeting(now) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// "2026-10-23" is a calendar date, not an instant. `new Date("2026-10-23")`
// reads it as UTC midnight, which is the day before in some time zones.
function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(iso, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDate(iso) - today) / 86_400_000);
}

export function dueLine(iso, now) {
  if (!iso) return null;
  const days = daysUntil(iso, now);
  const date = parseDate(iso).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
  if (days > 1)   return { text: `Due ${date} · ${days} days left`, late: false };
  if (days === 1) return { text: `Due tomorrow, ${date}`, late: false };
  if (days === 0) return { text: "Due today", late: false };
  return { text: `Was due ${date} · ${plural(-days, "day")} ago`, late: true };
}

export function sectionName(s) {
  return [s.grade_level, s.strand, s.section].filter(Boolean).join(" · ");
}

export const compactPeso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { notation: "compact", maximumFractionDigits: 2 })}`;

// Every link carries the school year its count came from, because the list
// pages open on the year in their link.
export function attentionRows(data, schoolYear) {
  const sy = encodeURIComponent(schoolYear ?? "");
  return [
    {
      id: "pending", count: data.pending, icon: "ti-clipboard-list", tone: "warning", action: "Review",
      text: (n) => `${plural(n, "enrollment")} waiting for your approval`,
      to: `/enrollments?enrollment_status=pending&school_year=${sy}`,
    },
    {
      id: "applications", count: data.applications, icon: "ti-user-plus", tone: "info", action: "Review",
      text: (n) => `${plural(n, "new application")} to look over`,
      to: "/student-applications",
    },
    {
      id: "unpaid", count: data.unpaid, icon: "ti-receipt-off", tone: "error", action: "View",
      text: (n) => `${plural(n, "invoice")} with no payment yet`,
      to: `/invoices?status=unpaid&school_year=${sy}`,
    },
    {
      id: "overdue", count: data.overdue, icon: "ti-clock-exclamation", tone: "error", action: "View",
      text: (n) => `${plural(n, "invoice")} with a payment past due`,
      to: `/invoices?overdue=1&school_year=${sy}`,
    },
  ].filter((r) => r.count > 0);
}
