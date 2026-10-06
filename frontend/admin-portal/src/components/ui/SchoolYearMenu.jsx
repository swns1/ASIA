import FilterMenu from "./FilterMenu";
import { useSchoolYear } from "../../context/SchoolYearContext";
import useArchivedYears from "../../hooks/useArchivedYears";
import { groupYears } from "../../utils/schoolYear";

// SchoolYearMenu — the school year control that sits in a StatusBand's top
// right (Enrollments, Grades), where the band's numbers are counted for it.
//
// The same years as SchoolYearPicker, in its order: the current year first
// and marked, then recent, then earlier, with archived years marked, and
// "All years" last. Pair it with hooks/useYearFilter, which decides where the
// page opens; `""` is All years.
export default function SchoolYearMenu({ value, onChange }) {
  const { options = [], currentYear } = useSchoolYear();
  const isArchived = useArchivedYears();

  const menuOptions = [
    ...groupYears(options, currentYear).flatMap(([, years]) => years).map((y) => ({
      value: y,
      label: `S.Y. ${y}`,
      note: y === currentYear ? (
        <span className="text-[11px] font-bold text-success-500">Current</span>
      ) : isArchived(y) ? (
        <span className="text-[11px] font-semibold text-neutral-500">Archived</span>
      ) : null,
    })),
    { value: "", label: "All years" },
  ];

  return (
    <FilterMenu
      tone="dark"
      label="School year"
      valueLabel={value || "All years"}
      options={menuOptions}
      value={value}
      onChange={onChange}
      align="end"
      menuWidth={220}
    />
  );
}
