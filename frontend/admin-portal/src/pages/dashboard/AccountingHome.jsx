// AccountingHome — accounting's task-first home page.
//
// Built from the same pieces as the admin and registrar homes (./HomeParts.jsx,
// loaded by ./useHomeData.js): the greeting, one school year picker for the
// whole page, the bell, Start a task, the partial-load warning. What differs
// is what accounting acts on:
//
//   1. Start a task: find a student, record a payment, generate an invoice
//      (the Invoices page's own window), find an invoice.
//   2. Needs your attention, on the page as well as in the bell, since these
//      queues are accounting's day: invoices with no payment yet, payments
//      past due, last year's invoices still owing (./attention.js). Beside it,
//      Coming up: the calendar and accounting's own events (./ComingUp.jsx).
//   3. Payments: what came in today, by method, and the latest payments with
//      their receipts (./PaymentsPanels.jsx).
//   4. Billing: the year's Billing panel. Its eye button hides the amounts on
//      the payment panels too.
//   5. Kept from the shared dashboard for now: the enrollment tiles, Trends
//      and recent enrollments.
//
// Every count follows the picked year, and so does every link. Today's and
// the latest payments are the exception: a payment made today can settle any
// year's invoice.

import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import BillingPanel from "../../components/ui/BillingPanel";
import RecordPaymentModal from "../../components/RecordPaymentModal";
import {
  AttentionPanel, EnrollmentTiles, HomeHeader, PartialLoadAlert, QuickActions, RecentEnrollmentsPanel,
  TrendsSection,
} from "./HomeParts";
import { PaymentsTodayPanel, RecentPaymentsPanel } from "./PaymentsPanels";
import { getFinancialSummary, getPayments, getPaymentSummary } from "../../api/billingApi";
import { ALL_YEARS_PARAM } from "../../hooks/useYearFilter";
import { pageVariants } from "../../utils/motion";
import { todayISO } from "../../utils/format";
import { bellItems } from "./attention";
import ComingUp from "./ComingUp";
import { TWO_UP, quarterOn, withYear } from "./adminHomeData";
import { comingUpRequests, enrollmentGlanceRequests, quarterRequests, trendRequests } from "./homeRequests";
import useHomeData from "./useHomeData";

const requests = (year, currentYear) => {
  const today = todayISO();
  return {
    ...quarterRequests(currentYear),
    money:          getFinancialSummary(year),
    paidToday:      getPaymentSummary({ date_from: today, date_to: today }),
    paidTodayCount: getPayments({ date_from: today, date_to: today, page_size: 1 }),
    // Newest payment date first; the record number only breaks ties, since
    // payments aren't always recorded in the order they were made.
    payments:       getPayments({ ordering: "-payment_date,-payment_id", page_size: 5 }),
    ...enrollmentGlanceRequests(year),
    ...trendRequests(year),
    ...comingUpRequests(),
  };
};

export default function AccountingHome() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [showAmounts, setShowAmounts] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const home = useHomeData("Accounting home", requests);
  const { year, loading, data, rows } = home;
  const sy = encodeURIComponent(year ?? "");

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
              { label: "Record a payment", icon: "ti-cash", primary: true, onClick: () => setShowPayment(true) },
              { label: "Generate an invoice", icon: "ti-receipt", onClick: () => navigate(`/invoices?generate=1&school_year=${sy}`) },
              { label: "Find an invoice", icon: "ti-file-search", onClick: () => navigate(`/invoices?school_year=${sy}`) },
            ]}
          />
        </motion.div>

        <motion.div variants={pageVariants.item} className={`${TWO_UP} shrink-0`}>
          <AttentionPanel rows={rows} loading={loading} failed={home.attentionFailed} onGo={navigate} />
          <ComingUp
            events={data.calendar?.results ?? data.calendar}
            personal={data.personal?.results ?? data.personal}
            loading={loading}
            onGo={navigate}
          />
        </motion.div>

        <motion.section
          variants={pageVariants.item}
          aria-labelledby="accounting-payments-heading"
          className="flex shrink-0 flex-col gap-4"
        >
          <h2 id="accounting-payments-heading" className="text-sm font-bold text-neutral-900">Payments</h2>
          <div className={TWO_UP}>
            <PaymentsTodayPanel
              summary={data.paidToday}
              count={data.paidTodayCount?.count ?? null}
              loading={loading}
              showAmounts={showAmounts}
              onGo={navigate}
            />
            <RecentPaymentsPanel
              rows={data.payments?.results ?? []}
              loading={loading}
              showAmounts={showAmounts}
              onGo={navigate}
            />
          </div>
        </motion.section>

        {/* The year's figures. A failed load is said once, by the warning
            above with its retry -- not also as a row of ₱0.00. No year filter
            of its own: the page's picker governs it, and its links carry it. */}
        {(loading || data.money) && (
          <motion.div variants={pageVariants.item} className="shrink-0">
            <BillingPanel
              summary={data.money}
              loading={loading}
              schoolYear={year}
              showAmounts={showAmounts}
              onToggleAmounts={() => setShowAmounts((v) => !v)}
              onOpenInvoices={(link) => navigate(withYear(link, year))}
            />
          </motion.div>
        )}

        <motion.div variants={pageVariants.item} className="shrink-0">
          {/* The Scholarships page is academic staff's. */}
          <EnrollmentTiles data={data} loading={loading} year={year} onGo={navigate} canOpenScholarships={false} />
        </motion.div>

        <motion.div variants={pageVariants.item} className="shrink-0">
          {/* No Analytics button: that page isn't accounting's. */}
          <TrendsSection
            summary={data.summary} loading={loading} year={year}
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

      {showPayment && (
        <RecordPaymentModal
          preloadedInvoiceId={null}
          onClose={() => setShowPayment(false)}
          onSaved={() => { setShowPayment(false); home.reload(); }}
        />
      )}
    </>
  );
}
