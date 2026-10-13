// RegistrarHome — the registrar's task-first home page.
//
// Built from the same pieces as the admin home (./HomeParts.jsx, loaded by
// ./useHomeData.js), so the two read and behave alike: the greeting, one
// school year picker for the whole page, the bell, Start a task, the
// partial-load warning, the Trends section. What differs is what the
// registrar acts on (the "Registrar · Proposed" board on the dashboard
// redesign canvas):
//
//   1. Start a task: find a student, enroll one, issue an application form
//      link, add a student, print a school form.
//   2. Needs your attention, on the page as well as in the bell, since these
//      queues are the registrar's day: pending approvals with how many still
//      owe documents, applications (opened ones too), learners with no class
//      in the year, sections with no adviser (./attention.js).
//   3. At a glance: the four enrollment tiles, on the page's year.
//   4. Trends: as on the admin home.
//   5. Recent enrollments in the year.
//
// Every count follows the picked year, and so does every link, because the
// list pages open on the year in their link.

import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import IssueInviteModal from "../../components/applications/IssueInviteModal";
import {
  AttentionPanel, EnrollmentTiles, HomeHeader, PartialLoadAlert, QuickActions, RecentEnrollmentsPanel,
  TrendsSection,
} from "./HomeParts";
import { ALL_YEARS_PARAM } from "../../hooks/useYearFilter";
import { pageVariants } from "../../utils/motion";
import { bellItems } from "./attention";
import { quarterOn } from "./adminHomeData";
import { enrollmentGlanceRequests, quarterRequests, trendRequests } from "./homeRequests";
import useHomeData from "./useHomeData";

// The pending tile reads the pending queue's count, so it isn't asked twice.
const requests = (year, currentYear) => ({
  ...quarterRequests(currentYear),
  ...trendRequests(year),
  ...enrollmentGlanceRequests(year, { pending: false }),
});

export default function RegistrarHome() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [showInvite, setShowInvite] = useState(false);
  const home = useHomeData("Registrar home", requests);
  const { year, loading, data, rows } = home;

  return (
    <>
      <HomeHeader
        now={now}
        period={quarterOn(data.quarters?.results ?? data.quarters, now)}
        year={year}
        onYearChange={home.setYear}
        yearIsDefault={home.yearIsDefault}
        currentYear={home.currentYear}
        notifications={bellItems(rows)}
        notificationsFailed={home.attentionFailed}
      />

      {/* Every child of the scroller keeps its height (shrink-0), so the page
          scrolls rather than squeezing a card. */}
      <motion.div
        variants={pageVariants.container}
        initial="hidden"
        animate="visible"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6"
      >
        <PartialLoadAlert show={home.partialError} onRetry={home.reload} />

        {/* Above the panels below, which the finder's matches drop over. */}
        <motion.div variants={pageVariants.item} className="relative z-20 shrink-0">
          <QuickActions
            onOpenStudent={(st) => navigate(`/students/${st.student_id}`)}
            // Every year, so a learner who left or graduated is found too.
            onFind={(term) => navigate(
              term
                ? `/students?search=${encodeURIComponent(term)}&school_year=${ALL_YEARS_PARAM}`
                : "/students",
            )}
            actions={[
              { label: "Enroll a student", icon: "ti-user-plus", primary: true, onClick: () => navigate("/enrollments/new") },
              { label: "Issue form link", icon: "ti-link", onClick: () => setShowInvite(true) },
              { label: "Add a student", icon: "ti-user-edit", onClick: () => navigate("/students/new") },
              { label: "Print a school form", icon: "ti-printer", onClick: () => navigate("/school-forms") },
            ]}
          />
        </motion.div>

        <motion.div variants={pageVariants.item} className="shrink-0">
          <AttentionPanel rows={rows} loading={loading} failed={home.attentionFailed} onGo={navigate} />
        </motion.div>

        <motion.div variants={pageVariants.item} className="shrink-0">
          <EnrollmentTiles data={data} loading={loading} year={year} pending={data.pending} onGo={navigate} />
        </motion.div>

        <motion.div variants={pageVariants.item} className="shrink-0">
          <TrendsSection
            summary={data.summary} loading={loading} year={year} onGo={navigate}
            failed={home.failed.includes("summary")} onRetry={home.reload}
          />
        </motion.div>

        <motion.div variants={pageVariants.item} className="shrink-0">
          <RecentEnrollmentsPanel
            rows={data.recent?.results ?? []}
            loading={loading}
            schoolYear={year}
            onGo={navigate}
          />
        </motion.div>
      </motion.div>

      {showInvite && <IssueInviteModal onClose={() => setShowInvite(false)} />}
    </>
  );
}
