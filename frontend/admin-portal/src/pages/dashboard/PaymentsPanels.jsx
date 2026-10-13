// PaymentsPanels — the home pages' view of money coming in: what was
// collected today (the cashier's close-out), and the latest payments with
// their receipts. Requests: AccountingHome's `paidToday`, `paidTodayCount` and
// `payments` (GET /payments/summary/ and /payments/).
//
// `showAmounts`: the page's one eye button (on the Billing panel) blurs these
// amounts too, as it does on the admin home's money panels.

import { Panel } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import Table, { TableRow, TableCell } from "../../components/ui/Table";
import Badge from "../../components/ui/Badge";
import { PAYMENT_METHODS, paymentMethodMeta } from "../../constants/paymentMethods";
import { ALL_YEARS_PARAM } from "../../hooks/useYearFilter";
import { fmtDate, fmtLongDay, peso, todayISO } from "../../utils/format";
import { plural } from "./adminHomeData";

const hide = (showAmounts) => (showAmounts ? "" : "select-none blur-[6px]");

/** Today's payments: the total, how many, and the split by method. */
export function PaymentsTodayPanel({ summary, count, loading, showAmounts = true, onGo }) {
  const today = todayISO();
  const total = Number(summary?.total ?? 0);
  const methods = PAYMENT_METHODS.filter((m) => Number(summary?.[m.value] ?? 0) > 0);
  return (
    <Panel
      title="Collected today"
      subtitle={fmtLongDay()}
      icon="ti-cash"
      className="min-w-0"
      action={
        <Button
          variant="ghost" size="sm" iconRight icon="ti-arrow-right"
          // Every year: a payment today can settle any year's invoice.
          onClick={() => onGo(`/payments?date_from=${today}&date_to=${today}&school_year=${ALL_YEARS_PARAM}`)}
        >
          Payments
        </Button>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton height={28} variant="pulse" />
          <Skeleton height={14} variant="pulse" />
        </div>
      ) : summary == null ? (
        <p className="text-sm text-neutral-600">Today&apos;s payments didn&apos;t load.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold tabular-nums text-neutral-900 ${hide(showAmounts)}`}>{peso(total)}</span>
            <span className="text-sm text-neutral-600">
              {count == null ? "" : `from ${plural(count, "payment")}`}
            </span>
          </div>
          {methods.length ? (
            <ul className="flex flex-col divide-y divide-neutral-200">
              {methods.map((m) => (
                <li key={m.value} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Badge variant={m.tone} icon={m.icon}>{m.label}</Badge>
                  <span className={`tabular-nums font-semibold text-neutral-900 ${hide(showAmounts)}`}>
                    {peso(summary[m.value])}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-600">No payments recorded yet today.</p>
          )}
        </div>
      )}
    </Panel>
  );
}

const PAYMENT_COLUMNS = [
  { key: "date",    label: "Date" },
  { key: "student", label: "Student" },
  { key: "amount",  label: "Amount" },
  { key: "method",  label: "Method" },
  { key: "receipt", label: "" },
];

/** The latest payments, any year, each with its receipt. */
export function RecentPaymentsPanel({ rows, loading, showAmounts = true, onGo }) {
  return (
    <Panel
      title="Recent payments"
      icon="ti-receipt"
      padding="none"
      className="min-w-0"
      action={
        <Button variant="ghost" size="sm" iconRight icon="ti-arrow-right" onClick={() => onGo(`/payments?school_year=${ALL_YEARS_PARAM}`)}>
          View all
        </Button>
      }
    >
      <Table
        columns={PAYMENT_COLUMNS}
        loading={loading}
        skeletonRows={5}
        stickyHeader={false}
        isEmpty={rows.length === 0}
        empty={{ icon: "ti-cash-off", title: "No payments yet", subtitle: "Recorded payments show up here.", withAvatar: false }}
      >
        {rows.map((p) => {
          const method = paymentMethodMeta(p.payment_method);
          return (
            <TableRow key={p.payment_id}>
              <TableCell className="whitespace-nowrap">{fmtDate(p.payment_date)}</TableCell>
              <TableCell className="font-semibold text-neutral-900">
                {p.invoice_detail?.student_name ?? `Invoice #${p.invoice}`}
                <div className="text-xs font-normal text-neutral-500">{p.invoice_detail?.invoice_no}</div>
              </TableCell>
              <TableCell className={`tabular-nums ${hide(showAmounts)}`}>{peso(p.amount_paid)}</TableCell>
              <TableCell><Badge variant={method.tone} icon={method.icon}>{method.label}</Badge></TableCell>
              <TableCell>
                <Button
                  variant="ghost" size="sm" icon="ti-printer"
                  aria-label={`Print the receipt for ${peso(p.amount_paid)} paid ${fmtDate(p.payment_date)}`}
                  onClick={() => window.open(`/print/receipt/${p.payment_id}`, "_blank")}
                >
                  Receipt
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </Table>
    </Panel>
  );
}
