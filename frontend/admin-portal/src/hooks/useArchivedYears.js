import { useCallback } from "react";
import { useSchoolYear } from "../context/SchoolYearContext";

/**
 * `isArchived(label)`: whether a school year is archived, and so read-only.
 *
 *   const isArchived = useArchivedYears();
 *   {!isArchived(row.school_year) && <Button icon="ti-pencil" … />}
 *
 * From the registry's year states (SchoolYearContext). A year the registry
 * hasn't loaded yet reads as open -- the server refuses the write regardless
 * (409), so this only spares people a form they couldn't save.
 */
export default function useArchivedYears() {
  const { yearStates } = useSchoolYear();
  return useCallback((year) => Boolean(year) && yearStates?.[year] === "archived", [yearStates]);
}
