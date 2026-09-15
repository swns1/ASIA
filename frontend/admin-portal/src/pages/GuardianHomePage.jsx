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

// Pick the enrollment to feature per child: prefer an active (enrolled/pending)
// one, else the most recent by school year / id.
function pickPrimary(enrollments) {
  const active = enrollments.filter((e) => ["enrolled", "pending"].includes(e.enrollment_status));
  const pool = active.length ? active : enrollments;
  return [...pool].sort((a, b) =>
    (b.school_year || "").localeCompare(a.school_year || "") || b.enrollment_id - a.enrollment_id
  )[0];
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

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Here are your children's academic records. Select a child to view grades, attendance, and billing.
        </p>
      </motion.div>

      {error && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-500">
          <i className="ti ti-alert-circle text-base" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="secondary" size="sm" icon="ti-refresh" onClick={fetchChildren}>Try again</Button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-3">
                <Skeleton width={48} height={48} radius={12} />
                <div className="flex-1 space-y-2">
                  <Skeleton width="70%" height={15} />
                  <Skeleton width="40%" height={12} />
                </div>
              </div>
              <Skeleton width="100%" height={40} radius={10} />
            </div>
          ))}
        </div>
      ) : error ? null : children.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-16 text-center">
          <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-100),var(--color-brand-200))]">
            <i className="ti ti-users text-2xl text-neutral-500" aria-hidden="true" />
          </div>
          <div className="text-md font-semibold text-neutral-700">No linked students yet</div>
          <div className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-neutral-500">
            Your account hasn't been linked to a student record yet. Please contact the school's registrar or administrator to complete the link.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {children.map((child, idx) => {
            const e = child.primary;
            return (
              <motion.div
                key={child.student_id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05 + idx * 0.05 }}
              >
                <Card
                  interactive
                  onClick={() => navigate(`/guardian/child/${e.enrollment_id}`)}
                  className="w-full text-left transition-shadow hover:shadow-[0_10px_30px_rgba(224,49,49,0.12)]"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-brand-200),var(--color-brand-300))] text-lg font-bold text-brand-600">
                      {child.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-md font-bold text-neutral-900">{child.name}</div>
                      {child.lrn && <div className="mt-0.5 font-mono text-xs text-neutral-500">LRN {child.lrn}</div>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5">
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">{e.grade_level} · {e.section}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">{LEVEL_LABELS[e.school_level] || e.school_level} · SY {e.school_year}</div>
                    </div>
                    <StatusBadge
                      status={e.enrollment_status}
                      map={ENROLLMENT_STATUS_MAP}
                      dot
                      className={e.enrollment_status === "pending" ? "animate-pulse" : undefined}
                    />
                  </div>

                  <div className="mt-3.5 flex items-center justify-end gap-1.5 text-sm font-semibold text-brand-600">
                    View records <i className="ti ti-arrow-right text-base" aria-hidden="true" />
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
