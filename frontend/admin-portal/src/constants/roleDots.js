// roleDots.js — one colour per account role, so a role reads the same in the
// Users band and rows and in the Audit Trail.
//
// Roles are categories, not statuses, so they take the validated categorical
// series (tokens.css `--color-series-*`), handed out in rank order and never
// by how many accounts a role has.
import { seriesDot } from "./statusTones";

export const ROLE_ORDER = ["super_admin", "admin", "registrar", "accounting", "teacher", "guardian"];

export const ROLE_DOT = Object.fromEntries(ROLE_ORDER.map((role, i) => [role, seriesDot(i)]));
