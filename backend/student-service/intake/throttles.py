"""
Throttles for the public applicant-facing endpoints, keyed on the invite id
rather than IP.

Why per-invite: NUM_PROXIES defaults to 0 (the LAN deployment, where
REMOTE_ADDR is the client) and is 1 on Railway, where a proxy sits in
front. A per-IP-only limit has two problems this project cares about
either way. First, a shared LAN/NAT (a school's own
wifi, a mall, a barangay hall with a public terminal) collapses every
applicant behind it into one IP, so one slow/bad actor can lock out
everyone else trying to apply from the same place. Second — and this is
the one that matters once a reverse proxy does show up — an IP-keyed limit
silently breaks the moment REMOTE_ADDR becomes the proxy's address for
every request; an invite-keyed limit doesn't care what NUM_PROXIES is set
to. See student_service/settings.py's REST_FRAMEWORK docstring and the
plan's concurrency table.

Each throttle falls back to IP-keyed AnonRateThrottle behaviour when no
invite id is available yet (e.g. a malformed URL) — DEFAULT_THROTTLE_CLASSES
still includes AnonRateThrottle as a backstop either way.
"""
from rest_framework.throttling import SimpleRateThrottle


class InviteKeyedThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        invite_id = getattr(view, "kwargs", {}).get("invite_id")
        if not invite_id:
            return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}
        return self.cache_format % {"scope": self.scope, "ident": str(invite_id)}


class ApplicantVerifyThrottle(InviteKeyedThrottle):
    scope = "applicant_verify"


class ApplicantDraftThrottle(InviteKeyedThrottle):
    scope = "applicant_draft"


class ApplicantSubmitThrottle(InviteKeyedThrottle):
    scope = "applicant_submit"
