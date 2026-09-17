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

// True when only devices on the same network can open the link: a private
// IPv4 range, a local-only name, or a bare machine name. That is the LAN
// deployment, where the parent has to join the school Wi-Fi first. A public
// address (the hosted copy on Railway) opens from any network, mobile data
// included, and the instructions should not send parents looking for Wi-Fi.
export function isPrivateNetworkUrl(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (LOCAL_HOSTNAMES.includes(hostname)) return true;
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (!hostname.includes(".")) return true;
  return /\.(local|lan|home|internal|localdomain)$/.test(hostname);
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
