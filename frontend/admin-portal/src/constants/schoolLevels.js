// LEVEL_LABELS — human-readable school-level names.
//
// Shared by the guardian-facing pages (GuardianHomePage, GuardianChildPage),
// which previously each declared an identical copy of this map.
export const LEVEL_LABELS = {
  nursery: "Nursery",
  kindergarten: "Kindergarten",
  elementary: "Elementary",
  junior_highschool: "Junior High School",
  senior_highschool: "Senior High School",
};

// GRADE_LEVELS_BY_LEVEL / SHS_STRANDS / schoolLevelForGrade —
//
// The canonical DepEd grade ladder. Promoted here out of EnrollmentFormPage
// (which owned the only copy) once the applicant kiosk needed the same list
// to ask what grade a family is applying for — same reason LEVEL_LABELS
// moved here. AnalyticsPage keeps its own map deliberately: that one is a
// filter-options list with an extra "All grades" entry, not this ladder.
export const GRADE_LEVELS_BY_LEVEL = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

export const SHS_STRANDS = [
  "STEM","ABM","HUMSS","GAS","TVL-ICT","TVL-HE","TVL-IA","TVL-AFA","Arts and Design","Sports",
];

// Which school level a grade label belongs to, or null if it isn't one of
// ours. Lets a caller ask a family only for the grade — the level they'd
// have to be taught to name is derived rather than asked for.
export function schoolLevelForGrade(grade) {
  for (const [level, grades] of Object.entries(GRADE_LEVELS_BY_LEVEL)) {
    if (grades.includes(grade)) return level;
  }
  return null;
}
