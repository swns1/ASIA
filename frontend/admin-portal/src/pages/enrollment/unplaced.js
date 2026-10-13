// Learners with no class in a school year (GET /enrollments/unplaced/): the
// Enrollments page's "not yet placed" list and the home pages' count read
// them the same way.

/** Completed the 2nd semester of Grade 12: finished, not waiting for a class. */
export function isGrade12Finisher(st) {
  const last = st.last_enrollment;
  return Boolean(
    last && last.grade_level === "Grade 12" && last.semester === "2nd" && last.enrollment_status === "completed",
  );
}
