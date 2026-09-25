import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { getEnrollments, submitGuardianResponse } from "../api/enrollmentApi";
import { getCurrentUser } from "../utils/auth";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import { StatusBadge } from "../components/ui/Badge";
import { ENROLLMENT_STATUS_MAP, GUARDIAN_RESPONSE_MAP } from "../constants/statusMaps";
import { LEVEL_LABELS } from "../constants/schoolLevels";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import GuardianHero from "../components/GuardianHero";

const newestFirst = (a, b) =>
  (b.school_year || "").localeCompare(a.school_year || "") || b.enrollment_id - a.enrollment_id;

// A returning learner's next-year row: pending, with an earlier year this
// child actually attended. A pending row with no history is a new learner's
// placement waiting on documents, not a question for the family -- the server
// refuses an answer on it for the same reason.
function nextYearRow(enrollments) {
  const attended = enrollments.filter((e) => ["enrolled", "completed"].includes(e.enrollment_status));
  return enrollments
    .filter((e) => e.enrollment_status === "pending"
      && attended.some((a) => (a.school_year || "") < (e.school_year || "")))
    .sort(newestFirst)[0] ?? null;
}

// Pick the enrollment the card opens: this year's (enrolled), else a pending
// one, else the most recent. The next-year row is left out -- once Promote
// creates it, it is the newest pending row, and featuring it sent the parent
// to a record with no grades yet in place of the year still in progress.
function pickPrimary(enrollments, next = null) {
  const rest = next ? enrollments.filter((e) => e !== next) : enrollments;
  const pool = [["enrolled"], ["pending"]]
    .map((statuses) => rest.filter((e) => statuses.includes(e.enrollment_status)))
    .find((rows) => rows.length) ?? rest;
  return [...(pool.length ? pool : enrollments)].sort(newestFirst)[0];
}

// "Will your child return next school year?" -- the one thing the portal lets
// a parent send. It records their answer and nothing else: the enrollment
// stays Pending until the registrar confirms it.
function NextYearPrompt({ enrollment, childName, onAnswered }) {
  const saved = enrollment.guardian_response;
  const [editing, setEditing] = useState(!saved);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState(saved?.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const firstName = childName.split(/\s+/)[0] || "your child";
  const place = [enrollment.grade_level, enrollment.section].filter(Boolean).join(" · ");

  async function answer(response) {
    setSaving(true);
    setError("");
    try {
      const data = await submitGuardianResponse(enrollment.enrollment_id, {
        response,
        reason: response === "not_returning" ? reason.trim() : "",
      });
      onAnswered(enrollment.enrollment_id, data.guardian_response);
      setEditing(false);
      setAskReason(false);
    } catch (e) {
      setError(e.message || "Your answer could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={`School year ${enrollment.school_year} for ${childName}`}
      className="mt-2 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
          SY {enrollment.school_year}{place ? ` · ${place}` : ""}
        </div>
        <StatusBadge status="pending" map={ENROLLMENT_STATUS_MAP} size="sm" />
      </div>

      {saved && !editing ? (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm text-neutral-800">
            <StatusBadge status={saved.response} map={GUARDIAN_RESPONSE_MAP} size="sm" />
            <span className="min-w-0">
              {saved.response === "returning"
                ? "The registrar will confirm the enrollment."
                : saved.reason ? `Reason: ${saved.reason}` : "Thank you for letting the school know."}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setEditing(true); setError(""); }}>
            Change answer
          </Button>
        </div>
      ) : (
        <div className="mt-2.5">
          <p className="text-sm font-medium text-neutral-900">
            Will {firstName} return to school in SY {enrollment.school_year}?
          </p>
          {askReason ? (
            <div className="mt-3">
              <label htmlFor={`reason-${enrollment.enrollment_id}`} className="mb-1 block text-xs font-semibold text-neutral-600">
                Reason (optional)
              </label>
              <textarea
                id={`reason-${enrollment.enrollment_id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g. Moving to another city"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus-ring"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" loading={saving} onClick={() => answer("not_returning")}>
                  Send: not returning
                </Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => setAskReason(false)}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" icon="ti-user-check" loading={saving} onClick={() => answer("returning")}>
                Yes, returning
              </Button>
              <Button size="sm" variant="secondary" icon="ti-user-x" disabled={saving} onClick={() => setAskReason(true)}>
                Not returning
              </Button>
              {saved && (
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            This only tells the school your plans. The registrar still confirms the enrollment.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-2 text-xs font-medium text-error-500">{error}</div>
      )}
    </section>
  );
}

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function GuardianHomePage() {
  usePageTitle("My Children");
  const navigate = useNavigate();
  const user = getCurrentUser();

  const [children, setChildren] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const fetchChildren = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getEnrollments({ page_size: 500 });
      const rows = Array.isArray(data) ? data : data?.results ?? [];

      // Group enrollments by student → one card per child.
      const byStudent = new Map();
      rows.forEach((e) => {
        const sid = e.student_id ?? e.student;
        if (!byStudent.has(sid)) byStudent.set(sid, []);
        byStudent.get(sid).push(e);
      });

      const kids = Array.from(byStudent.values()).map((enrollments) => {
        const next = nextYearRow(enrollments);
        const primary = pickPrimary(enrollments, next);
        return {
          student_id:   primary.student_id ?? primary.student,
          name:         primary.student_detail?.full_name || primary.student_name || "Student",
          lrn:          primary.student_detail?.lrn,
          primary,
          next,
        };
      });
      kids.sort((a, b) => a.name.localeCompare(b.name));
      setChildren(kids);
    } catch (e) {
      setError(e.message || "Failed to load your children's records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswered = (enrollmentId, guardianResponse) => {
    setChildren((kids) => kids.map((k) => (
      k.next?.enrollment_id === enrollmentId
        ? { ...k, next: { ...k.next, guardian_response: guardianResponse } }
        : k
    )));
  };

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <GuardianHero className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-white/60">{today}</div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {greeting()}{firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-white/70">
                Your children's grades, attendance, billing and documents, all in one place.
              </p>
            </div>
            {!loading && !error && children.length > 0 && (
              <div className="hidden shrink-0 border-l border-white/15 pl-5 sm:block">
                <div className="text-3xl font-semibold leading-none text-white">{children.length}</div>
                <div className="mt-1.5 text-xs font-medium uppercase tracking-[0.08em] text-white/60">
                  {children.length === 1 ? "Child" : "Children"} linked
                </div>
              </div>
            )}
          </div>
        </GuardianHero>
      </motion.div>

      {error && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-500">
          <i className="ti ti-alert-circle text-base" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="secondary" size="sm" icon="ti-refresh" onClick={fetchChildren}>Try again</Button>
        </div>
      )}

      {!error && (
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">Your children</h2>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <div className="flex items-start gap-3.5 p-5">
                <Skeleton width={48} height={48} radius={12} />
                <div className="flex-1 space-y-2">
                  <Skeleton width="65%" height={15} />
                  <Skeleton width="35%" height={12} />
                  <Skeleton width="45%" height={11} />
                </div>
              </div>
              <div className="border-t border-neutral-200 px-5 py-3">
                <Skeleton width="50%" height={12} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? null : children.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-14 text-center shadow-sm">
          <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100">
            <i className="ti ti-users text-2xl text-brand-600" aria-hidden="true" />
          </div>
          <div className="text-md font-semibold text-neutral-900">No linked students yet</div>
          <div className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-neutral-500">
            Your account hasn't been linked to a student record yet. Please contact the school's registrar or administrator to complete the link.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {children.map((child, idx) => {
            const e = child.primary;
            const avatar = getAvatarPalette(child.name);
            return (
              <motion.div
                key={child.student_id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05 + idx * 0.05 }}
              >
                <Card
                  interactive
                  padding="none"
                  onClick={() => navigate(`/guardian/child/${e.enrollment_id}`)}
                  className="group h-full overflow-hidden"
                >
                  <div className="flex items-start gap-3.5 p-5">
                    {/* Each child keeps their own colour, so a parent with several
                        can tell the cards apart before reading a name. */}
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-md font-bold"
                      style={{ background: avatar.bg, color: avatar.color }}
                      aria-hidden="true"
                    >
                      {initialsFrom(child.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-md font-bold leading-snug text-neutral-900">{child.name}</div>
                      <div className="mt-0.5 truncate text-sm font-medium text-neutral-700">
                        {[e.grade_level, e.section].filter(Boolean).join(" · ")}
                      </div>
                      {child.lrn && <div className="mt-1 text-xs tabular-nums text-neutral-500">LRN {child.lrn}</div>}
                    </div>
                    <StatusBadge
                      status={e.enrollment_status}
                      map={ENROLLMENT_STATUS_MAP}
                      className={`shrink-0 ${e.enrollment_status === "pending" ? "animate-pulse" : ""}`}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3">
                    <span className="min-w-0 truncate text-xs text-neutral-500">
                      {LEVEL_LABELS[e.school_level] || e.school_level} · SY {e.school_year}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600">
                      View records
                      <i className="ti ti-arrow-right text-base transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </div>
                </Card>
                {/* Outside the card: the card is itself a button, and these
                    are buttons too. */}
                {child.next && (
                  <NextYearPrompt
                    key={child.next.enrollment_id}
                    enrollment={child.next}
                    childName={child.name}
                    onAnswered={handleAnswered}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
