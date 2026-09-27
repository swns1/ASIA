// Every grade has its own English, Mathematics and so on, so with no grade
// picked the Subject list showed "English" twelve times with nothing to choose
// between them -- and each one groups a different grade. The grade (unless
// one is already picked), and senior high's strand and semester, which repeat
// within a grade, tell them apart.
export function subjectOptionLabel(subject, gradeLevel) {
  const extra = [
    gradeLevel ? null : subject.grade_level,
    subject.strand || null,
    subject.semester ? `${subject.semester} sem` : null,
  ].filter(Boolean);
  return extra.length ? `${subject.subject_name} — ${extra.join(" · ")}` : subject.subject_name;
}
