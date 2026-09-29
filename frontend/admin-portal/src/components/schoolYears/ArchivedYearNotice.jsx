import { Link } from "react-router-dom";
import Alert from "../ui/Alert";
import useArchivedYears from "../../hooks/useArchivedYears";
import { getCurrentUser, STAFF_ADMIN } from "../../utils/auth";

// Said up front, on a page showing an archived year, that its records are
// read-only -- rather than only in the refusal after someone fills in a form
// and presses Save. Renders nothing for an open year.
//
// `records` names what the page edits ("enrollments", "grades"...). Admins
// get a link to the year's page, where it can be unarchived; the School Years
// pages are admin-only, so everyone else is told who can.
export default function ArchivedYearNotice({ schoolYear, records = "records", className = "" }) {
  const isArchived = useArchivedYears();
  if (!isArchived(schoolYear)) return null;
  const canUnarchive = STAFF_ADMIN.includes(getCurrentUser()?.role);

  return (
    <Alert variant="info" icon="ti-archive" title={`S.Y. ${schoolYear} is archived`} className={className}>
      Its {records} are read-only. Viewing, searching and printing still work.{" "}
      {canUnarchive ? (
        <Link to={`/school-years/${schoolYear}`} className="font-bold underline underline-offset-2">
          Open S.Y. {schoolYear}
        </Link>
      ) : (
        "An admin can unarchive it under School Years."
      )}
    </Alert>
  );
}
