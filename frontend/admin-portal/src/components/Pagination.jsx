// Pagination.jsx
//
// Shared "page X of Y · N total records" + prev/windowed-numbers/next control,
// extracted from the near-identical inline block repeated across GradesPage,
// StudentsPage, EnrollmentsPage, and several other list pages.
import { motion } from "framer-motion";

const btnStyle = {
  width: 32, height: 32, border: "1px solid #f0e4e4", borderRadius: 8,
  background: "white", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", fontSize: 12, color: "#9a7070",
  fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
};
const btnActiveStyle = {
  background: "#fff0f0", borderColor: "#e03131", color: "#e03131", fontWeight: 700,
};

export default function Pagination({ page, totalPages, count, hasPrevious, hasNext, onPageChange }) {
  const windowSize = Math.min(totalPages, 5);
  const start = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - windowSize + 1));
  const pages = Array.from({ length: windowSize }, (_, i) => start + i);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, color: "#b09090" }}>
        Page <strong style={{ color: "#7a5050" }}>{page}</strong> of{" "}
        <strong style={{ color: "#7a5050" }}>{totalPages || 1}</strong>
        &nbsp;·&nbsp; {count.toLocaleString()} total records
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        <motion.button
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
          style={{ ...btnStyle, opacity: !hasPrevious ? 0.4 : 1, cursor: !hasPrevious ? "default" : "pointer" }}
          disabled={!hasPrevious}
          onClick={() => onPageChange(page - 1)}
        >
          <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
        </motion.button>
        {pages.map((p) => (
          <motion.button
            key={p}
            whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
            style={{ ...btnStyle, ...(p === page ? btnActiveStyle : {}) }}
            onClick={() => onPageChange(p)}
          >
            {p}
          </motion.button>
        ))}
        <motion.button
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
          style={{ ...btnStyle, opacity: !hasNext ? 0.4 : 1, cursor: !hasNext ? "default" : "pointer" }}
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
        </motion.button>
      </div>
    </div>
  );
}
