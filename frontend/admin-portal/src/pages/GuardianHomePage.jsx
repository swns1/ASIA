import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { getEnrollments } from "../api/enrollmentApi";
import { getCurrentUser } from "../utils/auth";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import { StatusBadge } from "../components/ui/Badge";
import { ENROLLMENT_STATUS_MAP } from "../constants/statusMaps";
import { LEVEL_LABELS } from "../constants/schoolLevels";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import GuardianHero from "../components/GuardianHero";

// Pick the enrollment to feature per child: prefer an active (enrolled/pending)
// one, else the most recent by school year / id.
function pickPrimary(enrollments) {
  const active = enrollments.filter((e) => ["enrolled", "pending"].includes(e.enrollment_status));
  const pool = active.length ? active : enrollments;
  return [...pool].sort((a, b) =>
    (b.school_year || "").localeCompare(a.school_year || "") || b.enrollment_id - a.enrollment_id
  )[0];
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
        const primary = pickPrimary(enrollments);
        return {
          student_id:   primary.student_id ?? primary.student,
          name:         primary.student_detail?.full_name || primary.student_name || "Student",
          lrn:          primary.student_detail?.lrn,
          primary,
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
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
