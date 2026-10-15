// The requests behind the home pages' shared pieces (./HomeParts.jsx), so
// every home asks for the same numbers the same way. Each answers a map of
// promises for settleAll (./adminHomeData.js).

import {
  getCalendarEvents, getDashboardSummary, getEnrollments, getEnrollmentScholarships, getPersonalEvents,
} from "../../api/enrollmentApi";
import { getStudents } from "../../api/studentApi";
import { comingUpWindow } from "./adminHomeData";

/** Today's quarter, for the header (quarterOn): always the current year's. */
export function quarterRequests(currentYear) {
  return { quarters: getCalendarEvents({ school_year: currentYear, event_type: "grading_period", page_size: 20 }) };
}

/**
 * Coming up (./ComingUp.jsx): the school calendar and the person's own
 * events over the days ahead. Asked for by date, so near a year's end it
 * shows the next one's opening days too.
 */
export function comingUpRequests() {
  const { from, to } = comingUpWindow();
  const days = { end_date__gte: from, start_date__lte: to, page_size: 500 };
  return { calendar: getCalendarEvents(days), personal: getPersonalEvents(days) };
}

/** The Trends section: the pipeline, risk and attendance of the year. */
export function trendRequests(schoolYear) {
  return { summary: getDashboardSummary({ school_year: schoolYear }) };
}

/**
 * The four enrollment tiles and the recent-enrollments table. `pending`: a
 * home that already counts pending enrollments as a queue (attention.js)
 * passes false, and the tile reads the queue's count.
 */
export function enrollmentGlanceRequests(schoolYear, { pending = true } = {}) {
  return {
    // Every year: the student registry, not the year's roll.
    students:     getStudents({ page_size: 1 }),
    active:       getStudents({ status: "active", page_size: 1 }),
    enrolled:     getEnrollments({ enrollment_status: "enrolled", school_year: schoolYear, page_size: 1 }),
    scholarships: getEnrollmentScholarships({ school_year: schoolYear, page_size: 1 }),
    recent:       getEnrollments({ school_year: schoolYear, page_size: 5, ordering: "-enrollment_id" }),
    ...(pending
      ? { pendingCount: getEnrollments({ enrollment_status: "pending", school_year: schoolYear, page_size: 1 }) }
      : {}),
  };
}
