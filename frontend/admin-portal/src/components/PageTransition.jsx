import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";

/**
 * Consistent page-entry animation for every routed page.
 *
 * This lives in the shell rather than in each page for a reason: only three of
 * ~27 pages had adopted `pageVariants`, so navigating around the app animated
 * sometimes and jumped other times. That inconsistency reads as a bug rather
 * than as restraint, and the fix cannot be "remember to add it to each new
 * page" — that is the same instruction the first 24 pages already missed.
 *
 * Keyed on the first path segment, not the whole pathname. Remounting is what
 * makes the animation replay, and keying on the full path would remount on any
 * parameter change too — so paging from /students/1 to /students/2 would tear
 * the page down and refetch it, turning a cosmetic choice into a behavioural
 * one. Section-level keying animates real navigation and leaves drill-downs
 * within a page alone.
 *
 * Motion here is deliberately small: 8px and 0.22s. A page transition is
 * orientation, not entertainment, and anything longer sits between the user
 * and the thing they clicked for. The OS "reduce motion" setting is honoured
 * globally by <MotionConfig reducedMotion="user"> in App.jsx.
 */
export default function PageTransition({ children }) {
  const { pathname } = useLocation();
  const section = pathname.split("/")[1] || "root";

  return (
    <motion.div
      key={section}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      // Must keep the shell's flex contract: this element becomes the flex
      // child that AppLayout sizes, so a plain wrapper would collapse every
      // page that relies on min-h-0 / flex-1 to fill the viewport.
      className="flex min-h-0 flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}
