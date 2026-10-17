// SF10_GROUP_LABELS / autoSubjectGroup —
//
// The school's senior high SF10 lists each semester's subjects under three
// headings. A subject's own setting (Subjects page) wins; left on "Automatic",
// the export works the heading out from the name and strand. This is that
// rule, kept in step with the export's (backend school_forms/sf10.py,
// subject_group), so the Subjects form can say what "Automatic" will print.
export const SF10_GROUP_LABELS = {
  core: "Core",
  applied: "Contextualized",
  specialized: "Specialization",
};

// DepEd's applied subjects, under the names DepEd and the school give them.
const APPLIED_NAMES = [
  "english for academic", "eapp", "practical research", "research in daily life",
  "piling larangan", "empowerment technolog", "entrepreneurship",
  "inquiries, investigations", "inquiries investigations", "3is", "3 is",
];
// Specialized in every track, whether or not they were tied to a strand.
const SPECIALIZED_NAMES = ["work immersion", "culminating activity", "capstone"];

export function autoSubjectGroup(name, strand) {
  const low = String(name ?? "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  if (APPLIED_NAMES.some((w) => low.includes(w))) return "applied";
  if (SPECIALIZED_NAMES.some((w) => low.includes(w)) || String(strand ?? "").trim()) return "specialized";
  return "core";
}
