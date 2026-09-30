import { useId } from "react";

import { peso } from "../../../utils/format";
import { NoData } from "../ChartFrame";
import { columnPath } from "../geometry";
import { chartInk, token } from "../tokens";
import { fmtOne, num, pesoCompact, share, shortYear } from "../../schoolYears/compareFigures";
import ChartCard, { Caption } from "./ChartCard";
import ColumnPlot from "../ColumnPlot";
import Legend from "../Legend";
import { linearAxis } from "../scale";

// 1e — what each year billed and how much of it has come in. The whole column
// is the bill; the collected part fills it from the bottom, so the pale part
// left on top is what's still owed. Above each column, the collection rate and
// what's left to collect.

export default function CollectionChart({ years, states, source }) {
  return (
    <ChartCard
      icon="ti-cash"
      title="Collected against billed"
      subtitle="Invoices for each year's enrollments, as of today"
      source={source}
      errorSubject="billing figures"
    >
      <Collection years={years} states={states} get={source.get} />
    </ChartCard>
  );
}

function Collection({ years, states, get }) {
  // The collected fill is clipped to its column's rounded outline; each clip
  // needs a document-unique id.
  const clipId = `collected-${useId().replace(/[^\w-]/g, "")}`;
  const ink = chartInk();
  const colors = {
    collected: token("--color-brand-600"),
    outstanding: token("--color-brand-300"),
    note: token("--color-neutral-600"),
  };

  const columns = years.map((year) => {
    const m = get(year);
    const billed = num(m?.net_billed) ?? 0;
    const collected = num(m?.total_collected) ?? 0;
    return { year, billed, collected, owed: billed - collected, rate: share(collected, billed) };
  });
  if (!columns.some((c) => c.billed > 0)) return <NoData message="Nothing has been billed for these years yet." />;

  const axis = linearAxis(0, Math.max(...columns.map((c) => Math.max(c.billed, c.collected))));
  const latest = columns.at(-1);
  const caption = latest.billed <= 0
    ? `Nothing has been billed for S.Y. ${latest.year} yet.`
    : latest.owed < 0.005
      ? `S.Y. ${latest.year} is paid up.`
      : states[latest.year] === "current"
        ? `S.Y. ${latest.year} is still collecting: ${peso(latest.owed)} is outstanding so far.`
        : `S.Y. ${latest.year} has ${peso(latest.owed)} outstanding.`;

  return (
    <>
      <ColumnPlot
        title={`Collected against billed, S.Y. ${years[0]}${years.length > 1 ? ` to ${latest.year}` : ""}`}
        legend={
          <Legend
            className="mb-2"
            items={[
              { key: "collected", label: "Collected", color: colors.collected },
              { key: "outstanding", label: "Outstanding", color: colors.outstanding },
              { key: "note", label: "Above each column: collection rate" },
            ]}
          />
        }
        axis={axis}
        formatTick={pesoCompact}
        labels={years.map((y) => ({ key: y, label: shortYear(y) }))}
        padTop={32}
      >
        {(geo) => columns.map((c, i) => {
          const w = Math.min(56, geo.slotW * 0.44);
          const x0 = geo.x(i) - w / 2;
          const top = geo.y(c.billed);
          const outline = columnPath(x0, top, w, geo.base - top);
          const paidTo = geo.y(Math.min(c.collected, c.billed));
          const note = c.billed <= 0 ? "Nothing billed" : c.owed >= 0.005 ? `${pesoCompact(c.owed)} left` : "Paid up";
          // Five years on a phone leave ~50px a column; a note wider than
          // that would run into the next one's. The rate stays, and the pale
          // part of the column still shows what's owed.
          const noteFits = note.length * 10.5 * 0.5 <= geo.slotW - 4;
          return (
            <g key={c.year}>
              <title>{`Billed ${peso(c.billed)} · Collected ${peso(c.collected)}`}</title>
              {c.billed > 0 && (
                <>
                  <clipPath id={`${clipId}-${i}`}>
                    <path d={outline} />
                  </clipPath>
                  <path d={outline} fill={colors.outstanding} />
                  <rect
                    x={x0} y={paidTo} width={w} height={geo.base - paidTo}
                    fill={colors.collected} clipPath={`url(#${clipId}-${i})`}
                  />
                </>
              )}
              <text
                x={geo.x(i)} y={top - 19.5}
                textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.ink}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {c.rate == null ? "—" : `${fmtOne(c.rate)}%`}
              </text>
              {noteFits && (
                <text x={geo.x(i)} y={top - 6} textAnchor="middle" fontSize="10.5" fill={colors.note}>
                  {note}
                </text>
              )}
            </g>
          );
        })}
      </ColumnPlot>
      <Caption>{caption}</Caption>
    </>
  );
}
