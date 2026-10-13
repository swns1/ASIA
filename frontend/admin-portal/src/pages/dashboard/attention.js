// What's waiting on someone, for the home pages: the bell on every home and
// the on-page "Needs your attention" list (registrar, accounting, teacher),
// loaded by useHomeData. One list, so every role reads the same
// words, icons, order and school year; each role gets only the queues it can
// act on.

import {
  getDocumentStatus, getEnrollments, getMyDay, getRiskAssessmentLatest, getSections, getUnplacedStudents,
} from "../../api/enrollmentApi";
import { getFinancialSummary, getInvoiceSummary, getInvoices } from "../../api/billingApi";
import { getStudentApplications } from "../../api/applicationApi";
import { previousLabel } from "../../components/schoolYears/yearHelpers";
import { hasAnyRole, ACADEMIC_STAFF, BILLING_ROLES } from "../../utils/auth";
import { isGrade12Finisher } from "../enrollment/unplaced";
import { isFlagged } from "../analytics/riskVocabulary";
import { peso } from "../../utils/format";
import { dueLine, mySectionsLink, plural, sectionName } from "./adminHomeData";

// "has" / "have" with the number in front: "1 has", "20 have".
const verb = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// A detail that rounds out a queue's line but isn't its count: a failure
// leaves the line without it rather than failing the whole queue. Wrapped so
// a call that throws before returning a promise is caught the same way.
const optional = (call) => Promise.resolve().then(call).catch(() => null);

// A past year can't take new placements or advisers, so its "no class" and
// "no adviser" lists would only be noise (everyone who joined since, say).
const openYear = (sy, currentYear) => !currentYear || !sy || sy >= currentYear;

// In the order the bell and the list show them. `roles` are the roles that act
// on the queue, the same ones the backend lets read it: enrollments,
// applications, placement and advisers are registrar work (intake's
// REVIEW_ROLES, enrollment-service's ACADEMIC_STAFF_ROLES), invoices are
// billing's. Every count and link is on one school year, so the number shown
// is the number on the page it opens.
//
// `fetch(sy, ctx)` answers `{ count, ... }`; `text` and `hint` read that
// answer. `ctx.once(key, call)` shares one request between the queues of one
// load: a teacher's three rows all read the same my-day answer.
//
const listNames = (sections) => {
  const names = sections.map(sectionName);
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${(names.length - 3).toLocaleString()} more` : names.join(", ");
};
const myDay = (sy, ctx) => ctx.once("myDay", () => getMyDay({ school_year: sy }));
const sectionLink = (section, tab, opts) => mySectionsLink(section.year, section.advisory_id, tab, opts);

const QUEUES = [
  {
    id: "pending", roles: ACADEMIC_STAFF, icon: "ti-clipboard-list", tone: "warning", action: "Review",
    fetch: async (sy) => {
      const [all, docs] = await Promise.all([
        getEnrollments({ enrollment_status: "pending", school_year: sy, page_size: 1 }),
        // How many the document gate would let through today.
        optional(() => getDocumentStatus({ school_year: sy, enrollment_status: "pending", page_size: 1 })),
      ]);
      return { count: all?.count ?? 0, owing: docs?.summary?.missing ?? null };
    },
    text: (r) => `${plural(r.count, "enrollment")} waiting for your approval`,
    hint: (r) => {
      if (r.owing == null) return null;
      if (r.owing === 0) return "Every one has its documents in";
      if (r.owing >= r.count) return "Every one still owes documents";
      return `${verb(r.count - r.owing, "has", "have")} every document in · ${verb(r.owing, "still owes", "still owe")} documents`;
    },
    to: (sy) => `/enrollments?enrollment_status=pending&school_year=${sy}`,
  },
  {
    // Applications aren't filed under a school year here. Opening one marks
    // it "in review", so those are counted too: one someone opened and left
    // undecided used to drop out of every list.
    id: "applications", roles: ACADEMIC_STAFF, icon: "ti-user-plus", tone: "info", action: "Review",
    fetch: async () => {
      const [fresh, opened] = await Promise.all([
        getStudentApplications({ status: "submitted", page_size: 1 }),
        getStudentApplications({ status: "in_review", page_size: 1 }),
      ]);
      const f = fresh?.count ?? 0;
      const o = opened?.count ?? 0;
      return { count: f + o, fresh: f, opened: o };
    },
    text: (r) => ((r.fresh ?? r.count)
      ? `${plural(r.fresh ?? r.count, "new application")} to look over`
      : `${plural(r.opened, "application")} opened but not decided yet`),
    hint: (r) => (r.fresh && r.opened ? `${r.opened.toLocaleString()} more opened but not decided yet` : null),
    to: (sy, r) => (r.fresh === 0 ? "/student-applications?tab=in_review" : "/student-applications"),
  },
  {
    id: "unplaced", roles: ACADEMIC_STAFF, icon: "ti-user-question", tone: "warning", action: "Place",
    when: openYear,
    fetch: async (sy) => {
      const data = await getUnplacedStudents(sy);
      const rows = data?.results ?? [];
      const last = previousLabel(sy);
      const graduates = rows.filter(isGrade12Finisher).length;
      const finished = rows.filter((st) => !isGrade12Finisher(st)
        && st.last_enrollment?.school_year === last
        && st.last_enrollment?.enrollment_status === "completed").length;
      return { count: data?.count ?? rows.length, finished, graduates };
    },
    text: (r, sy) => `${plural(r.count, "learner has", "learners have")} no class in S.Y. ${sy}`,
    hint: (r) => [
      r.finished ? `${r.finished.toLocaleString()} finished last school year but ${r.finished === 1 ? "hasn't" : "haven't"} enrolled for this one` : null,
      r.graduates ? `${r.graduates.toLocaleString()} finished Grade 12 and can be marked graduated` : null,
    ].filter(Boolean).join(" · ") || null,
    to: (sy) => `/enrollments?school_year=${sy}&unplaced=1`,
  },
  {
    id: "noAdviser", roles: ACADEMIC_STAFF, icon: "ti-user-off", tone: "warning", action: "Assign",
    when: openYear,
    fetch: async (sy) => {
      const data = await getSections({ school_year: sy, page_size: 500 });
      const rows = Array.isArray(data) ? data : data?.results ?? [];
      // Active advisers only: one who was deactivated can't take attendance,
      // the same rule as the admin's Teachers today (with_active_teacher).
      const bare = rows.filter((s) => !s.active_adviser_count);
      return {
        count: bare.length,
        names: bare.map((s) => [s.grade_level, s.strand, s.name].filter(Boolean).join(" · ")),
      };
    },
    text: (r) => `${plural(r.count, "section has", "sections have")} no adviser`,
    hint: (r) => {
      if (!r.names?.length) return null;
      if (r.names.length === 1) return `${r.names[0]}: no teacher can take its attendance or enter its grades`;
      const more = r.names.length - 3;
      return r.names.slice(0, 3).join(", ") + (more > 0 ? ` and ${more.toLocaleString()} more` : "");
    },
    to: (sy) => `/teacher-advisories?school_year=${sy}`,
  },
  {
    // Teachers: today's attendance, in the current year only (it's today's).
    id: "attendance", roles: ["teacher"], icon: "ti-calendar-check", tone: "warning", action: "Take",
    when: (sy, currentYear) => !currentYear || sy === currentYear,
    fetch: async (sy, ctx) => {
      const day = await myDay(sy, ctx);
      // No classes today (a weekend, a holiday): nothing is owed.
      if (day?.no_classes) return { count: 0 };
      const open = (day?.sections ?? [])
        .filter((s) => s.students > 0 && s.attendance.unmarked > 0)
        .map((s) => ({ ...s, year: sy }));
      return { count: open.length, sections: open };
    },
    text: (r) => (r.sections?.length === 1
      ? `Today's attendance isn't ${r.sections[0].attendance.taken ? "finished" : "taken"} yet`
      : `Today's attendance isn't done for ${plural(r.count, "section")}`),
    hint: (r) => {
      if (!r.sections?.length) return null;
      if (r.sections.length > 1) return listNames(r.sections);
      const s = r.sections[0];
      return s.attendance.taken
        ? `${sectionName(s)} · ${s.attendance.marked.toLocaleString()} of ${plural(s.students, "learner")} marked`
        : sectionName(s);
    },
    to: (sy, r) => (r.sections?.[0] ? sectionLink(r.sections[0], "attendance") : "/my-sections"),
  },
  {
    id: "grades", roles: ["teacher"], icon: "ti-chart-bar", tone: "info", action: "Enter",
    fetch: async (sy, ctx) => {
      const day = await myDay(sy, ctx);
      const open = (day?.sections ?? [])
        .filter((s) => s.grades && !s.grades.complete)
        .map((s) => ({ ...s, year: sy }));
      const done = open.reduce((n, s) => n + s.grades.done, 0);
      const expected = open.reduce((n, s) => n + s.grades.expected, 0);
      return { count: open.length, sections: open, done, expected };
    },
    text: (r) => (r.sections?.length
      ? `${r.sections[0].grades.label} grades: ${r.done.toLocaleString()} of ${r.expected.toLocaleString()} in`
      : `${plural(r.count, "section")} with grades to finish`),
    hint: (r) => {
      const s = r.sections?.[0];
      if (!s) return null;
      const due = s.grades.due_date ? dueLine(s.grades.due_date, new Date())?.text : null;
      return [r.sections.length > 1 ? listNames(r.sections) : sectionName(s), due].filter(Boolean).join(" · ");
    },
    to: (sy, r) => {
      const s = r.sections?.[0];
      if (!s) return "/my-sections";
      // The first subject still short of grades.
      const subject = s.grades.subjects.find((x) => !x.complete);
      return sectionLink(s, "grades", { period: s.grades.period, subject: subject?.subject_id });
    },
  },
  {
    id: "narrative", roles: ["teacher"], icon: "ti-clipboard-text", tone: "info", action: "Enter",
    fetch: async (sy, ctx) => {
      const day = await myDay(sy, ctx);
      const open = (day?.sections ?? [])
        .filter((s) => s.narrative && !s.narrative.complete)
        .map((s) => ({ ...s, year: sy }));
      const done = open.reduce((n, s) => n + s.narrative.done, 0);
      const expected = open.reduce((n, s) => n + s.narrative.expected, 0);
      return { count: open.length, sections: open, done, expected };
    },
    text: (r) => (r.sections?.length
      ? `${r.sections[0].narrative.label} narrative reports: ${r.done.toLocaleString()} of ${r.expected.toLocaleString()} ratings in`
      : `${plural(r.count, "section")} with narrative reports to finish`),
    hint: (r) => (r.sections?.length ? listNames(r.sections) : null),
    to: (sy, r) => (r.sections?.[0]
      ? sectionLink(r.sections[0], "narrative", { period: r.sections[0].narrative.period })
      : "/my-sections"),
  },
  {
    // The latest risk check, scoped by the server to the teacher's own
    // learners. Flagged ones only (high and critical), the same follow-up
    // list as the admin's "Need follow-up" and Analytics; "Watch" is only
    // worth keeping an eye on.
    id: "followUp", roles: ["teacher"], icon: "ti-alert-triangle", tone: "warning", action: "View",
    fetch: async (sy) => {
      // No run yet for the year answers 404: nothing to follow up, not a failure.
      const run = await getRiskAssessmentLatest({ school_year: sy }).catch((e) => {
        if (e?.response?.status === 404 || e?.status === 404) return null;
        throw e;
      });
      const flagged = (run?.scores ?? []).filter((s) => isFlagged(s.risk_level));
      return { count: flagged.length, names: flagged.map((s) => s.student_name).filter(Boolean) };
    },
    text: (r) => `${plural(r.count, "learner")} to follow up`,
    hint: (r) => {
      if (!r.names?.length) return null;
      // Names come as "Last, First M.", so commas can't separate them.
      const more = r.names.length - 3;
      return r.names.slice(0, 3).join(" · ") + (more > 0 ? ` · and ${more.toLocaleString()} more` : "");
    },
    to: (sy) => `/analytics?school_year=${sy}`,
  },
  {
    id: "unpaid", roles: BILLING_ROLES, icon: "ti-receipt-off", tone: "error", action: "View",
    fetch: (sy) => getInvoices({ status: "unpaid", school_year: sy, page_size: 1 }),
    text: (r) => `${plural(r.count, "invoice")} with no payment yet`,
    to: (sy) => `/invoices?status=unpaid&school_year=${sy}`,
  },
  {
    id: "overdue", roles: BILLING_ROLES, icon: "ti-clock-exclamation", tone: "error", action: "View",
    fetch: (sy) => getInvoices({ overdue: "true", school_year: sy, page_size: 1 }),
    text: (r) => `${plural(r.count, "invoice")} with a payment past due`,
    to: (sy) => `/invoices?overdue=1&school_year=${sy}`,
  },
  {
    // The year before the picked one: balances nobody is chasing, since every
    // other count here is on the picked year.
    id: "lastYear", roles: BILLING_ROLES, icon: "ti-history", tone: "warning", action: "View",
    fetch: async (sy) => {
      const last = previousLabel(sy);
      const counts = await getInvoiceSummary({ school_year: last });
      const count = (counts?.unpaid ?? 0) + (counts?.partially_paid ?? 0);
      // The amount only when there is something to chase.
      const money = count ? await optional(() => getFinancialSummary(last)) : null;
      const owed = Number(money?.outstanding ?? 0);
      return { count, last, outstanding: owed > 0 ? owed : null };
    },
    text: (r, sy) => `${plural(r.count, "invoice")} from S.Y. ${r.last ?? previousLabel(sy)} still ${r.count === 1 ? "owes" : "owe"} money`,
    hint: (r) => (r.outstanding ? `${peso(r.outstanding)} outstanding` : null),
    // Only the ones still owing, so the list's count is this row's.
    to: (sy, r) => `/invoices?school_year=${encodeURIComponent(r.last ?? previousLabel(decodeURIComponent(sy)))}&money=balance&ordering=-balance`,
  },
];

// A queue's answer as `{ count, ... }`. A bare number is a count (tests, and
// paginated responses read for their `count`).
function asResult(value) {
  if (value == null) return null;
  if (typeof value === "number") return { count: value };
  return { ...value, count: value.count ?? 0 };
}

/** One request per queue the user acts on in that year, keyed by queue id.
 *  `currentYear` decides which queues apply to a past year. */
/** Requests one load shares: `once(key, call)` makes the call the first time
 *  and hands every later caller the same promise. useHomeData passes one to
 *  both the page's requests and the queues, so a request the two need (a
 *  teacher's my-day) is made once. */
export function sharedRequests() {
  const shared = new Map();
  return {
    once: (key, call) => {
      if (!shared.has(key)) shared.set(key, Promise.resolve().then(call));
      return shared.get(key);
    },
  };
}

/** The teacher's my-day for a year, through `ctx` (see sharedRequests). */
export const myDayRequest = (schoolYear, ctx) => myDay(schoolYear, ctx);

export function attentionRequests(user, schoolYear, { currentYear, ctx = sharedRequests() } = {}) {
  return Object.fromEntries(
    QUEUES
      .filter((q) => hasAnyRole(user, q.roles))
      .filter((q) => !q.when || q.when(schoolYear, currentYear))
      .map((q) => [q.id, Promise.resolve().then(() => q.fetch(schoolYear, ctx)).then(asResult)]),
  );
}

/** The queues with something in them, in order. `results` is keyed by queue
 *  id; a queue with no answer (not fetched, or failed) is left out. */
export function attentionRows(results, schoolYear) {
  const sy = encodeURIComponent(schoolYear ?? "");
  return QUEUES
    .map((q) => [q, asResult(results[q.id])])
    .filter(([, r]) => r?.count > 0)
    .map(([q, r]) => ({
      id: q.id,
      count: r.count,
      icon: q.icon,
      tone: q.tone,
      action: q.action,
      text: q.text(r, schoolYear),
      hint: q.hint?.(r, schoolYear) ?? null,
      to: q.to(sy, r),
    }));
}

/** Rows as NotificationBell items. */
export function bellItems(rows) {
  return rows.map((r) => ({ id: r.id, icon: r.icon, tone: r.tone, message: r.text, hint: r.hint, link: r.to }));
}
