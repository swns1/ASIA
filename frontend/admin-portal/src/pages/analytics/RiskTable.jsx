import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Table, { TableCell, TableRow } from "../../components/ui/Table";
import Button from "../../components/ui/Button";
import ChipGroup from "../../components/ui/ChipGroup";
import Pagination from "../../components/Pagination";
import { Input } from "../../components/FormField";
import { getAvatarPalette, initialsFrom } from "../../utils/avatarPalette";
import {
  RISK_LEVELS,
  attendanceToneClass,
  confidenceFor,
  deltaIcon,
  deltaToneClass,
  downloadRiskCSV,
  formatAttendance,
  formatDelta,
  formatGrade,
  gradeToneClass,
  isFlagged,
  riskLevelMeta,
} from "./riskVocabulary";

// RiskTable — the follow-up list, and the table-view twin for every chart on
// the Overview tab.
//
// What this replaced showed three columns headed "Grade", "Attendance" and
// "Narrative" whose values were *inverted risk contributions* — a 90 average
// rendered as "10" — directly under a second table using those same three
// words for the raw figures. Every column here shows the number it is named
// after, and the "Why" column carries the sentence the backend generated, so
// the table answers "who do I follow up, and about what" without anyone
// needing to know how the score is computed.

const PAGE_SIZE = 15;

const COLUMNS = [
  { key: "student_name", label: "Student", width: "22%", sortable: true },
  { key: "risk_score", label: "Status", width: "16%", sortable: true },
  { key: "reasons", label: "Why", width: "30%" },
  { key: "average_grade", label: "Average", width: "9%", align: "right", sortable: true },
  { key: "attendance_rate", label: "Attendance", width: "10%", align: "right", sortable: true },
  { key: "grade_delta", label: "Change", width: "9%", align: "right", sortable: true },
  { key: "signals_present", label: "Based on", width: "4%", align: "center" },
];

/**
 * The status pill. The reserved status hexes read under 3:1 on a light
 * surface, so the colour only ever fills the icon and a soft tint behind
 * dark ink — the icon and the word are what carry the meaning.
 */
export function RiskBadge({ level, size = "md" }) {
  const meta = riskLevelMeta(level);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold leading-none text-neutral-900 ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      }`}
      // Tint is a per-level alpha over the reserved status hex; a dynamic
      // Tailwind class name would not survive static extraction (tokens.css
      // rule 1), so this stays an inline style on purpose.
      style={{ background: meta.tint }}
    >
      <i className={`ti ${meta.icon} text-[12px]`} style={{ color: meta.color }} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function ReasonCell({ reasons }) {
  const [expanded, setExpanded] = useState(false);
  const list = reasons ?? [];
  if (!list.length) {
    return <span className="text-sm italic text-neutral-500">Nothing flagged</span>;
  }

  const shown = expanded ? list : list.slice(0, 2);
  const hidden = list.length - shown.length;

  return (
    <div className="flex flex-col gap-1">
      {shown.map((r) => (
        <span key={r.code} className="flex items-start gap-1.5 text-xs leading-snug text-neutral-700">
          <i
            className={`ti ${
              r.severity === "high" ? "ti-point-filled" : "ti-point"
            } mt-px shrink-0 text-[13px] ${
              r.severity === "high" ? "text-error-500" : "text-neutral-500"
            }`}
            aria-hidden="true"
          />
          {r.text}
        </span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="focus-ring self-start rounded-sm text-xs font-semibold text-brand-500 hover:underline"
        >
          +{hidden} more
        </button>
      )}
    </div>
  );
}

function ConfidenceDot({ signalsPresent }) {
  const c = confidenceFor(signalsPresent ?? 0);
  const tone =
    c.key === "complete"
      ? "bg-success-dot"
      : c.key === "partial"
        ? "bg-warning-dot"
        : "bg-neutral-400";
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-neutral-500"
      title={`${c.label} — ${c.hint}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      <span className="tabular-nums">{signalsPresent ?? 0}/4</span>
    </span>
  );
}

function sortValue(row, key) {
  if (key === "risk_score") return row.risk_score;
  if (key === "student_name") return row.student_name ?? `Student #${row.student_id}`;
  return row[key];
}

export default function RiskTable({
  run,
  loading,
  error,
  onRetry,
  selectedStudentId,
  onSelectStudent,
}) {
  const [band, setBand] = useState("flagged");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "risk_score", dir: "desc" });

  const all = useMemo(() => run?.scores ?? [], [run]);

  const bandOptions = useMemo(() => {
    const counts = run?.summary?.by_level ?? {};
    return [
      {
        value: "flagged",
        label: "Needs follow-up",
        icon: "ti-flag",
        count: run?.summary?.flagged_count ?? 0,
      },
      { value: "all", label: "Everyone", icon: "ti-users", count: all.length },
      ...RISK_LEVELS.map((level) => ({
        value: level,
        label: riskLevelMeta(level).label,
        count: counts[level] ?? 0,
      })),
    ];
  }, [run, all.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = all.filter((r) => {
      if (band === "flagged" && !isFlagged(r.risk_level)) return false;
      if (band !== "flagged" && band !== "all" && r.risk_level !== band) return false;
      if (!q) return true;
      return (
        (r.student_name ?? "").toLowerCase().includes(q) ||
        (r.student_number ?? "").toLowerCase().includes(q) ||
        (r.section ?? "").toLowerCase().includes(q) ||
        (r.grade_level ?? "").toLowerCase().includes(q)
      );
    });

    return [...rows].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      // Rows with no data sort last in BOTH directions — a missing value is
      // not "the smallest", it's absent, and burying it under a descending
      // sort would hide exactly the students nobody has recorded data for.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [all, band, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
    setPage(1);
  }

  function changeBand(value) {
    setBand(value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipGroup
          options={bandOptions}
          value={band}
          onChange={changeBand}
          label="Filter by status"
          size="sm"
        />
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, number or section…"
            className="w-56"
            aria-label="Search students"
          />
          <Button
            variant="secondary"
            size="sm"
            icon="ti-table-export"
            disabled={!filtered.length}
            onClick={() =>
              downloadRiskCSV(filtered, {
                schoolYear: run?.school_year,
                gradingPeriod: run?.grading_period,
              })
            }
          >
            Export
          </Button>
        </div>
      </div>

      {/* One fade on the container, never a per-row stagger: this list is
          uncapped, and a 0.04s stagger per row meant the last of 300 students
          appeared twelve seconds after the table did. */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
        <Table
          columns={COLUMNS}
          loading={loading}
          error={error}
          onRetry={onRetry}
          errorSubject="the follow-up list"
          isEmpty={!pageRows.length}
          sortKey={sort.key}
          sortDir={sort.dir}
          onSort={handleSort}
          empty={{
            icon: band === "flagged" ? "ti-mood-happy" : "ti-search",
            title:
              band === "flagged"
                ? "Nobody needs following up"
                : query
                  ? "No students match that search"
                  : "No students in this group",
            subtitle:
              band === "flagged"
                ? "No student in this selection crossed into Needs attention or Needs urgent help."
                : "Try a different status filter or clear the search.",
            withAvatar: false,
          }}
        >
          {pageRows.map((row) => {
            const name = row.student_name ?? `Student #${row.student_id}`;
            const [last = "", first = ""] = name.split(",").map((s) => s.trim());
            const palette = getAvatarPalette(name);
            const selected = selectedStudentId === row.student_id;
            const icon = deltaIcon(row.grade_delta);

            return (
              <TableRow
                key={row.student_id}
                onClick={() => onSelectStudent?.(row)}
                className={selected ? "bg-brand-50" : ""}
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{ background: palette.bg, color: palette.color }}
                      aria-hidden="true"
                    >
                      {initialsFrom(first, last)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-neutral-900">{name}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {[row.student_number, row.grade_level, row.section].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <RiskBadge level={row.risk_level} />
                </TableCell>

                <TableCell>
                  <ReasonCell reasons={row.reasons} />
                </TableCell>

                <TableCell align="right">
                  <span className={`tabular-nums ${gradeToneClass(row.average_grade)}`}>
                    {formatGrade(row.average_grade)}
                  </span>
                </TableCell>

                <TableCell align="right">
                  <span className={`tabular-nums ${attendanceToneClass(row.attendance_rate)}`}>
                    {formatAttendance(row.attendance_rate)}
                  </span>
                </TableCell>

                <TableCell align="right">
                  <span className={`inline-flex items-center gap-1 tabular-nums ${deltaToneClass(row.grade_delta)}`}>
                    {icon && <i className={`ti ${icon} text-[13px]`} aria-hidden="true" />}
                    {formatDelta(row.grade_delta)}
                  </span>
                </TableCell>

                <TableCell align="center">
                  <ConfidenceDot signalsPresent={row.signals_present} />
                </TableCell>
              </TableRow>
            );
          })}
        </Table>
      </motion.div>

      {!loading && !error && filtered.length > PAGE_SIZE && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          count={filtered.length}
          hasPrevious={safePage > 1}
          hasNext={safePage < totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
