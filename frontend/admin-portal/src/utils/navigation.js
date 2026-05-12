import { canViewAuditTrail, getCurrentUser } from "./auth";

const AUDIT_TRAIL_ITEM = {
  label: "Audit Trail",
  icon: "ti-shield-check",
  path: "/audit-trail",
  adminOnly: true,
};

export function withAuditTrailNav(navGroups = []) {
  return navGroups.map((group) => {
    if (group.section !== "Settings") return group;

    const hasAuditTrail = group.items.some((item) => item.path === AUDIT_TRAIL_ITEM.path);
    if (hasAuditTrail) return group;

    const [firstItem, ...restItems] = group.items;
    return {
      ...group,
      items: firstItem ? [firstItem, AUDIT_TRAIL_ITEM, ...restItems] : [AUDIT_TRAIL_ITEM],
    };
  });
}

export function getVisibleNavGroups(navGroups = [], user = getCurrentUser()) {
  return withAuditTrailNav(navGroups)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || canViewAuditTrail(user)),
    }))
    .filter((group) => group.items.length > 0);
}