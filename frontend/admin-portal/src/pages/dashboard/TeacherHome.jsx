// TeacherHome — the teacher's task-first home page.
//
// Built from the same pieces as the other homes (./HomeParts.jsx, loaded by
// ./useHomeData.js): the greeting with today's quarter, one school year
// picker, the bell, Start a task, the partial-load warning. What differs is
// what a teacher acts on, all of it in the sections they advise (the
// "Teacher · Proposed" board on the dashboard redesign canvas; the my-day
// request, GET /dashboard/my-day/):
//
//   1. Start a task: find a learner, take today's attendance, enter grades,
//      print a school form.
//   2. Today: each section's attendance, saved marks only.
//   3. Needs your attention, on the page and in the bell: attendance not
//      done, grades and narrative reports still to enter this period,
//      learners to follow up (./attention.js).
//   4. Grades to finish (a bar per subject) beside Coming up (the calendar
//      and the teacher's own events; Coming up alone with no section).
//   5. Kept from the shared dashboard for now: the enrollment tiles (scoped
//      to their learners by the server), Trends and recent enrollments.
//
// A teacher with no section in the year is told so, plainly. Today's cards
// are the current year's only; another year shows its grades and queues.

import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import Card from "../../components/ui/Card";
import {
  AttentionPanel, EnrollmentTiles, HomeHeader, PartialLoadAlert, QuickActions, RecentEnrollmentsPanel,
  TrendsSection,
} from "./HomeParts";
import { GradesToFinish, TodayCard } from "./TeacherPanels";
import ComingUp from "./ComingUp";
import { ALL_YEARS_PARAM } from "../../hooks/useYearFilter";
import { CHIP_GLOW } from "../../constants/statusTones";
import { pageVariants } from "../../utils/motion";
import { bellItems, myDayRequest } from "./attention";
import { TWO_UP, mySectionsLink, quarterOn } from "./adminHomeData";
import { comingUpRequests, enrollmentGlanceRequests, quarterRequests, trendRequests } from "./homeRequests";
import useHomeData from "./useHomeData";

const requests = (year, currentYear, ctx) => ({
  ...quarterRequests(currentYear),
  // The same answer the attention queues read: one request.
  myDay:    myDayRequest(year, ctx),
  ...comingUpRequests(),
  ...enrollmentGlanceRequests(year),
  ...trendRequests(year),
});

export default function TeacherHome() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const home = useHomeData("Teacher home", requests);
  const { year, currentYear, loading, data, rows } = home;
  const day = data.myDay;
  const sections = day?.sections ?? [];
  const isCurrentYear = year === currentYear;
  const first = sections[0];
  const firstGraded = sections.find((s) => s.grades && !s.grades.complete) ?? sections.find((s) => s.grades);
  const noSection = !loading && day && sections.length === 0;

  const actions = first
    ? [
        ...(isCurrentYear
          ? [{ label: "Take today's attendance", icon: "ti-calendar-check", primary: true,
               onClick: () => navigate(mySectionsLink(year, first.advisory_id, "attendance")) }]
          : []),
        { label: "Enter grades", icon: "ti-pencil", primary: !isCurrentYear,
          onClick: () => navigate(firstGraded
            ? mySectionsLink(year, firstGraded.advisory_id, "grades", { period: firstGraded.grades.period })
            : mySectionsLink(year, first.advisory_id, "grades")) },
        { label: "Print a school form", icon: "ti-printer", onClick: () => navigate("/school-forms") },
      ]
    : [{ label: "Print a school form", icon: "ti-printer", primary: true, onClick: () => navigate("/school-forms") }];

  return (
    <>
      <HomeHeader
        now={now}
        period={quarterOn(data.quarters?.results ?? data.quarters, now)}
        year={year}
        onYearChange={home.setYear}
        yearIsDefault={home.yearIsDefault}
        currentYear={currentYear}
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
            onFind={(term) => navigate(
              term
                ? `/students?search=${encodeURIComponent(term)}&school_year=${ALL_YEARS_PARAM}`
                : "/students",
            )}
            actions={actions}
          />
        </motion.div>

        {noSection && (
          <motion.div variants={pageVariants.item} className="shrink-0">
            <Card className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-600 ${CHIP_GLOW.brand}`}>
                <i className="ti ti-users-group text-lg" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900">
                  You&apos;re not an adviser of a section in S.Y. {year}.
                </p>
                <p className="text-xs text-neutral-600">
                  Attendance, grades and narrative reports open once the registrar assigns you a section.
                </p>
              </div>
            </Card>
          </motion.div>
        )}

        {isCurrentYear && sections.length > 0 && (
          <motion.section
            variants={pageVariants.item}
            aria-labelledby="teacher-today-heading"
            className="flex shrink-0 flex-col gap-4"
          >
            <h2 id="teacher-today-heading" className="text-sm font-bold text-neutral-900">Today</h2>
            <div className={TWO_UP}>
              {sections.map((s) => (
                <TodayCard key={s.advisory_id} section={s} noClasses={day.no_classes} year={year} onGo={navigate} />
              ))}
            </div>
          </motion.section>
        )}

        <motion.div variants={pageVariants.item} className="shrink-0">
          <AttentionPanel rows={rows} loading={loading} failed={home.attentionFailed} onGo={navigate} />
        </motion.div>

        <motion.div variants={pageVariants.item} className={`${TWO_UP} shrink-0`}>
          {!noSection && (
            <GradesToFinish
              sections={sections} loading={loading} failed={home.failed.includes("myDay")}
              year={year} onGo={navigate}
            />
          )}
          {/* Shown with no section too: the calendar and their own events
              are still theirs. */}
          <ComingUp
            events={data.calendar?.results ?? data.calendar}
            personal={data.personal?.results ?? data.personal}
            loading={loading}
            dueDate={firstGraded?.grades?.due_date ?? null}
            periodLabel={firstGraded?.grades?.label ?? ""}
            onGo={navigate}
          />
        </motion.div>

        <motion.div variants={pageVariants.item} className="shrink-0">
          {/* Scholarships is academic staff's page; the count is the teacher's own learners'. */}
          <EnrollmentTiles data={data} loading={loading} year={year} onGo={navigate} canOpenScholarships={false} />
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
    </>
  );
}
