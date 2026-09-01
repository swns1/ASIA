// apiError.js — turn an Axios/DRF failure into something a human can act on.
//
// The app previously either swallowed load failures into console.error (so an
// outage looked identical to an empty table) or surfaced a bare
// `err.response.data.detail`, which is often a developer-facing string. This
// module centralises the "what went wrong / what can I do about it" wording
// that UsersPage was the only page to get right.

/**
 * Describe a failed request.
 *
 * @param {unknown} err     the thrown Axios error
 * @param {object}  opts
 * @param {string}  opts.subject  what failed to load, e.g. "students".
 *                                Used to build a natural sentence.
 * @returns {{title:string, message:string, kind:string, canRetry:boolean}}
 */
export function describeApiError(err, { subject = "this information" } = {}) {
  const status = err?.response?.status;

  // No response at all — the request never reached a server.
  if (!err?.response) {
    return {
      kind: "network",
      title: "Can't reach the server",
      message: `We couldn't load ${subject}. Check your internet connection, then try again.`,
      canRetry: true,
    };
  }

  if (status === 401) {
    return {
      kind: "auth",
      title: "Your session has expired",
      message: "Please sign in again to continue.",
      canRetry: false,
    };
  }

  if (status === 403) {
    return {
      kind: "permission",
      title: "You don't have access to this",
      message: `Your account isn't permitted to view ${subject}. Contact an administrator if you think this is a mistake.`,
      canRetry: false,
    };
  }

  if (status === 404) {
    return {
      kind: "missing",
      title: "Not found",
      message: `We couldn't find ${subject}. It may have been deleted or moved.`,
      canRetry: false,
    };
  }

  if (status === 429) {
    return {
      kind: "throttled",
      title: "Too many requests",
      message: "Please wait a moment and try again.",
      canRetry: true,
    };
  }

  if (status >= 500) {
    return {
      kind: "server",
      title: "Something went wrong on our end",
      message: `The server had a problem loading ${subject}. This usually resolves on its own — try again in a moment.`,
      canRetry: true,
    };
  }

  // 4xx with a useful body (validation, business-rule rejection).
  return {
    kind: "request",
    title: "That didn't work",
    message: firstMessageFrom(err) || `We couldn't load ${subject}. Please try again.`,
    canRetry: true,
  };
}

/**
 * Flatten a DRF error body into a { field: message } map for inline form
 * errors. DRF returns `{ email: ["already exists"], non_field_errors: [...] }`,
 * sometimes `{ detail: "..." }`.
 */
export function fieldErrorsFrom(err) {
  const data = err?.response?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};

  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "detail") continue;
    out[key] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return out;
}

/** The single best human-readable line from an error body, if there is one. */
export function firstMessageFrom(err) {
  const data = err?.response?.data;
  if (!data) return err?.message || "";
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);

  const first = Object.values(data)[0];
  if (Array.isArray(first)) return String(first[0]);
  if (typeof first === "string") return first;
  return err?.message || "";
}

/** Convenience for toasts: one short, human sentence. */
export function toastMessage(err, opts) {
  const { message } = describeApiError(err, opts);
  return message;
}
