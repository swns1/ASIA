import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { getSchoolSettings } from "../api/billingApi";
import { motion } from "framer-motion";
import { pageVariants } from "../utils/motion";

const C = {
  dark: "#1a0a0a", muted: "#7a5050", border: "#f5eaea", red: "#e03131",
};

const GRADE_LEVELS = [
  "Nursery", "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10",
  "Grade 11", "Grade 12",
];

const OTHER_FORMS = [
  {
    code: "SF9", name: "Learner's Report Card",
    desc: "Periodic report card issued to learners at the end of each grading period.",
    icon: "ti-file-certificate", color: "#2e6b0d", bg: "#e8f5e0", status: "available",
  },
  {
    code: "SF10", name: "Learner's Permanent Record",
    desc: "Cumulative academic record maintained for each learner throughout their schooling.",
    icon: "ti-archive", color: "#7c3aed", bg: "#f0e8fd", status: "coming_soon",
  },
];

const inputStyle = {
  width: "100%", height: 40, border: "1.5px solid #fde2de", borderRadius: 10,
  padding: "0 12px", fontSize: 13, color: "#1a0a0a", fontFamily: "'DM Sans',sans-serif",
  outline: "none", boxSizing: "border-box", background: "white",
};

const labelStyle = {
  display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
};

function Field({ label, el }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {el}
    </div>
  );
}

export default function SchoolFormsPage() {
  const navigate    = useNavigate();
  const hasAnimated = useRef(false);

  // Shared
  const [schoolYear, setSchoolYear] = useState("");

  // SF1
  const [gradeLevel, setGradeLevel] = useState("");
  const [section,    setSection]    = useState("");
  const [adviser,    setAdviser]    = useState("");
  const [division,   setDivision]   = useState("");
  const [region,     setRegion]     = useState("");
  const [sf1Error,   setSf1Error]   = useState("");

  // SF2
  const [sf2GradeLevel, setSf2GradeLevel] = useState("");
  const [sf2Section,    setSf2Section]    = useState("");
  const [sf2Month,      setSf2Month]      = useState(new Date().toISOString().slice(0, 7));
  const [sf2Adviser,    setSf2Adviser]    = useState("");
  const [sf2Division,   setSf2Division]   = useState("");
  const [sf2Region,     setSf2Region]     = useState("");
  const [sf2Error,      setSf2Error]      = useState("");
  const [sf9EnrollmentId, setSf9EnrollmentId] = useState("");

  useEffect(() => {
    getSchoolSettings()
      .then((s) => { if (s?.current_school_year) setSchoolYear(s.current_school_year); })
      .catch(() => {});
  }, []);

  const isFirstRender = !hasAnimated.current;
  if (isFirstRender) hasAnimated.current = true;

  function handleOpenSF1() {
    if (!schoolYear.trim() || !gradeLevel || !section.trim()) {
      setSf1Error("School Year, Grade Level, and Section are required.");
      return;
    }
    setSf1Error("");
    const params = new URLSearchParams({
      school_year: schoolYear.trim(),
      grade_level: gradeLevel,
      section:     section.trim(),
      ...(adviser.trim()  ? { adviser:  adviser.trim()  } : {}),
      ...(division.trim() ? { division: division.trim() } : {}),
      ...(region.trim()   ? { region:   region.trim()   } : {}),
    });
    window.open(`/print/sf1?${params.toString()}`, "_blank");
  }

  function handleOpenSF2() {
    if (!schoolYear.trim() || !sf2GradeLevel || !sf2Section.trim() || !sf2Month) {
      setSf2Error("School Year, Grade Level, Section, and Month are required.");
      return;
    }
    setSf2Error("");
    const params = new URLSearchParams({
      school_year: schoolYear.trim(),
      grade_level: sf2GradeLevel,
      section:     sf2Section.trim(),
      month:       sf2Month,
      ...(sf2Adviser.trim()  ? { adviser:  sf2Adviser.trim()  } : {}),
      ...(sf2Division.trim() ? { division: sf2Division.trim() } : {}),
      ...(sf2Region.trim()   ? { region:   sf2Region.trim()   } : {}),
    });
    window.open(`/print/sf2?${params.toString()}`, "_blank");
  }

  return (
    <AppLayout>
      {/* Topbar */}
      <div style={{ background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}>
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: -8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>School Forms</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>DepEd Official School Forms (SF Documents)</div>
        </motion.div>
      </div>

      {/* Content */}
      <motion.div
        style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}
        variants={pageVariants.container}
        initial={isFirstRender ? "hidden" : false}
        animate="visible"
      >
        {/* Shared school year */}
        <motion.div variants={pageVariants.item} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 0, whiteSpace: "nowrap" }}>School Year (all forms)</label>
          <input
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder="e.g. 2025-2026"
            style={{ ...inputStyle, width: 160 }}
          />
        </motion.div>

        {/* ── SF1 ── */}
        <motion.div variants={pageVariants.item} style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(to right,#fdfafa,white)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-clipboard-list" style={{ fontSize: 20, color: C.red }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>SF1 — School Register</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 50, background: "#fff0f0", color: C.red }}>Available</span>
              </div>
              <div style={{ fontSize: 12, color: "#b09090", marginTop: 2 }}>
                Official class list of all enrolled learners per section. Required per grade level and section every school year.
              </div>
            </div>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 20px", marginBottom: 16 }}>
              <Field label="Grade Level *" el={
                <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={{ ...inputStyle, color: gradeLevel ? "#1a0a0a" : "#aaa", cursor: "pointer" }}>
                  <option value="">Select grade level…</option>
                  {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              } />
              <Field label="Section *" el={
                <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. STEM-B" style={inputStyle} />
              } />
              <Field label="Adviser's Name" el={
                <input value={adviser} onChange={(e) => setAdviser(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
              <Field label="Division" el={
                <input value={division} onChange={(e) => setDivision(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
              <Field label="Region" el={
                <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
            </div>

            {sf1Error && (
              <div style={{ marginBottom: 14, padding: "9px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 12, color: "#b91c1c", display: "flex", alignItems: "center", gap: 7 }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{sf1Error}
              </div>
            )}

            <motion.button
              onClick={handleOpenSF1}
              whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
            >
              <i className="ti ti-external-link" style={{ fontSize: 14 }} /> Open SF1
            </motion.button>
          </div>
        </motion.div>

        {/* ── SF2 ── */}
        <motion.div variants={pageVariants.item} style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", overflow: "hidden", boxShadow: "0 2px 16px rgba(20,85,160,0.06)" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(to right,#f5f8fd,white)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#e3f0fd", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-calendar-stats" style={{ fontSize: 20, color: "#1455a0" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>SF2 — Daily Attendance Register</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 50, background: "#e3f0fd", color: "#1455a0" }}>Available</span>
              </div>
              <div style={{ fontSize: 12, color: "#b09090", marginTop: 2 }}>
                Monthly learner attendance record per class. Pulls data from the Attendance module.
              </div>
            </div>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 20px", marginBottom: 16 }}>
              <Field label="Grade Level *" el={
                <select value={sf2GradeLevel} onChange={(e) => setSf2GradeLevel(e.target.value)} style={{ ...inputStyle, color: sf2GradeLevel ? "#1a0a0a" : "#aaa", cursor: "pointer" }}>
                  <option value="">Select grade level…</option>
                  {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              } />
              <Field label="Section *" el={
                <input value={sf2Section} onChange={(e) => setSf2Section(e.target.value)} placeholder="e.g. STEM-B" style={inputStyle} />
              } />
              <Field label="Month *" el={
                <input type="month" value={sf2Month} onChange={(e) => setSf2Month(e.target.value)} style={inputStyle} />
              } />
              <Field label="Adviser's Name" el={
                <input value={sf2Adviser} onChange={(e) => setSf2Adviser(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
              <Field label="Division" el={
                <input value={sf2Division} onChange={(e) => setSf2Division(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
              <Field label="Region" el={
                <input value={sf2Region} onChange={(e) => setSf2Region(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
            </div>

            {sf2Error && (
              <div style={{ marginBottom: 14, padding: "9px 14px", background: "#eef3fc", border: "1px solid #93b4f5", borderRadius: 8, fontSize: 12, color: "#1455a0", display: "flex", alignItems: "center", gap: 7 }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{sf2Error}
              </div>
            )}

            <motion.button
              onClick={handleOpenSF2}
              whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(20,85,160,0.30)" }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#1455a0,#0e4080)", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(20,85,160,0.24)" }}
            >
              <i className="ti ti-external-link" style={{ fontSize: 14 }} /> Open SF2
            </motion.button>
          </div>
        </motion.div>

        {/* ── SF9 / SF10 ── */}
        <motion.div variants={pageVariants.item} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {OTHER_FORMS.map((form) => (
            <div key={form.code} style={{ background: "white", borderRadius: 14, border: "1px solid #f5eaea", padding: "20px 22px", boxShadow: "0 2px 12px rgba(224,49,49,0.05)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: form.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={`ti ${form.icon}`} style={{ fontSize: 18, color: form.color }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 50, background: form.status === "coming_soon" ? "#f0ede8" : form.bg, color: form.status === "coming_soon" ? "#5c5752" : form.color }}>
                  {form.status === "coming_soon" ? "Coming Soon" : "Available"}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 5 }}>{form.code} — {form.name}</div>
              <div style={{ fontSize: 12, color: "#b09090", lineHeight: 1.6, marginBottom: 16 }}>{form.desc}</div>
              {form.code === "SF9" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={sf9EnrollmentId}
                    onChange={(e) => setSf9EnrollmentId(e.target.value)}
                    placeholder="Enrollment ID"
                    style={{ ...inputStyle, width: 130, height: 34 }}
                  />
                  <motion.button
                    onClick={() => {
                      if (!sf9EnrollmentId.trim()) return;
                      window.open(`/print/sf9/${sf9EnrollmentId.trim()}`, "_blank");
                    }}
                    whileHover={sf9EnrollmentId.trim() ? { scale: 1.02 } : {}}
                    whileTap={sf9EnrollmentId.trim() ? { scale: 0.97 } : {}}
                    transition={{ duration: 0.12 }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: sf9EnrollmentId.trim() ? form.bg : "#f0ede8", border: `1.5px solid ${sf9EnrollmentId.trim() ? form.color + "40" : "#ddd"}`, color: sf9EnrollmentId.trim() ? form.color : "#aaa", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: sf9EnrollmentId.trim() ? "pointer" : "default", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}
                  >
                    <i className="ti ti-printer" style={{ fontSize: 12 }} /> Print SF9
                  </motion.button>
                </div>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f0ede8", color: "#7a6a5a", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600 }}>
                  <i className="ti ti-clock" style={{ fontSize: 12 }} /> In Development
                </div>
              )}
            </div>
          ))}
        </motion.div>
      </motion.div>
    </AppLayout>
  );
}