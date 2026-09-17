// The address a parent's phone should open for the applicant form.
//
// student-service builds `apply_url` from its FRONTEND_BASE_URL setting, which
// defaults to localhost -- an address every phone resolves to *itself*, so the
// QR code leads nowhere. The registrar's own browser already knows a working
// address: whatever they are viewing the portal on. So a localhost link is
// rewritten onto that origin, which makes the QR work from a phone as soon as
// staff open the portal by the machine's network address, with no .env change.
//
// A non-localhost `apply_url` is always left alone: it is the deployment's
// configured public address and may be deliberately different from the origin
// the staff device happens to use.

const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"];

export function isLocalOnlyUrl(url) {
  try {
    return LOCAL_HOSTNAMES.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function resolveApplyUrl(applyUrl, origin) {
  if (!applyUrl) return applyUrl;
  if (!isLocalOnlyUrl(applyUrl)) return applyUrl;
  if (!origin || isLocalOnlyUrl(origin)) return applyUrl;
  try {
    const target = new URL(applyUrl);
    const base = new URL(origin);
    target.protocol = base.protocol;
    target.host = base.host;
    return target.toString();
  } catch {
    return applyUrl;
  }
}
