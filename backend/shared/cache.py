"""
A file-based cache that survives concurrent access on Windows.

Django's FileBasedCache is written for POSIX file semantics, where a file
can be unlinked or renamed over while other processes hold it open: existing
readers keep reading the old contents, and nothing fails. Windows has no
such thing. CPython opens files without FILE_SHARE_DELETE, so an open handle
*blocks* another process from deleting or replacing that file, and a handle
whose file has been marked delete-pending fails on its next read.

FileBasedCache collides with that from both directions at once:

- get() and has_key() open the cache file and hand the live handle to
  pickle.load(), keeping it open for the whole parse.
- _is_expired() deletes any file it finds expired, _cull() deletes a random
  third of the directory on every set() once MAX_ENTRIES is passed, and
  set() rewrites the destination in place (file_move_safe falls back to
  open(O_TRUNC) + re-stream, because os.rename() cannot overwrite on
  Windows).

So one worker is deleting or rewriting the exact file another worker has
open. Measured on this project's own settings -- eight processes running the
get-then-set pair DRF's SimpleRateThrottle performs on every request, all on
one throttle key -- 21% of operations raised, overwhelmingly:

    File "django/core/cache/backends/filebased.py", line 37, in get
      if not self._is_expired(f):
    File "django/core/cache/backends/filebased.py", line 152, in _is_expired
      exp = pickle.load(f)
    PermissionError: [Errno 13] Permission denied

Note where that lands: inside pickle.load(), not inside open(). The open
succeeded; the file was deleted underneath the handle before pickle got
around to reading it. Django catches EOFError there (an empty file is
"expired") and FileNotFoundError around the open, but nothing catches this,
so it escapes the cache layer entirely and 500s the request.

UserRateThrottle is in DEFAULT_THROTTLE_CLASSES in all four services, which
puts this on the path of every single request. Pages that fan several
requests out at once -- the dashboard's Promise.all calls -- put a writer
and several readers on one key simultaneously, which is why the dashboard is
where it surfaces.

Three changes close it, none needing infrastructure the project doesn't
already have (the reasoning in each service's CACHES comment for avoiding
Redis and a DB cache table still holds):

1. Reads pull the whole file in a single read() and parse from memory, so a
   handle is never held open across a parse. The window another process can
   collide with shrinks from "a pickle parse" to "one syscall", and what is
   left is retried briefly and then treated as a miss.
2. set() swaps the finished temp file in with os.replace(), which is atomic
   on both platforms -- POSIX rename(2), and MoveFileExW *with*
   MOVEFILE_REPLACE_EXISTING on Windows -- instead of truncating and
   re-streaming the live file the way file_move_safe does.
3. _delete() tolerates a file another process still has open, which plain
   os.remove() refuses to touch on Windows.

The on-disk format is unchanged, so an existing cache directory keeps
working across the switch.

This cache holds nothing but DRF throttle counters (nothing in this project
calls the cache API directly), which sets how the remaining races should be
resolved: never raise. A read that loses a race costs one throttle window,
a write that loses one costs one uncounted request. Both are strictly better
than a 500 on a page load.
"""
import io
import logging
import os
import pickle
import random
import tempfile
import time
import zlib

from django.core.cache.backends.base import DEFAULT_TIMEOUT
from django.core.cache.backends.filebased import FileBasedCache

logger = logging.getLogger(__name__)

# What pickle and zlib raise when handed a cache file that is truncated or
# garbled. Django anticipates only EOFError, which is what a *completely
# empty* file produces; a file caught partway through a write, or damaged by
# a process killed mid-write, raises one of the others instead. Catching
# this broadly is safe here because the only consequence is treating the
# entry as a miss -- the value is re-derived, never silently wrong.
UNREADABLE_ENTRY_ERRORS = (
    EOFError,
    pickle.UnpicklingError,
    zlib.error,
    AttributeError,
    ImportError,
    IndexError,
    MemoryError,
    TypeError,
    ValueError,
)

_MISSING = object()


class ResilientFileBasedCache(FileBasedCache):
    """FileBasedCache with an atomic set() and reads that cannot raise."""

    # Retry budgets for the two places a concurrent worker can get in the
    # way. Entries here are a few hundred bytes, so both windows are
    # sub-millisecond and the first retry almost always wins; the backoffs
    # are jittered so workers colliding on one key don't retry in lockstep
    # and keep colliding.
    read_attempts = 3
    read_backoff = 0.002
    replace_attempts = 8
    replace_backoff = 0.003

    def _sleep(self, backoff, attempt):
        time.sleep(backoff * (attempt + 1) * (0.5 + random.random()))

    # ── reading ──────────────────────────────────────────────────────────

    def _read_bytes(self, fname):
        """
        The whole cache file in one read(), or None if it can't be read.

        Deliberately not Django's "open it and let pickle read from the
        handle": the handle is closed again before anything is parsed, so
        the only moment another process can collide with is the read()
        itself. What still collides is transient by nature -- the file is
        mid-replace, or delete-pending from a cull -- so retry briefly, then
        call it a miss.
        """
        for attempt in range(self.read_attempts):
            try:
                with open(fname, "rb") as f:
                    return f.read()
            except FileNotFoundError:
                return None
            except OSError:
                # Windows raises PermissionError (WinError 5/32) both for a
                # delete-pending file and for one held open by a writer.
                # A retry usually finds it either gone or settled.
                if attempt == self.read_attempts - 1:
                    logger.debug("cache: gave up reading %s", fname)
                    return None
                self._sleep(self.read_backoff, attempt)
        return None

    def _live_entry(self, fname):
        """
        (expiry, compressed payload) for a usable entry, or None if the file
        is missing, unreadable, corrupt, or expired. Corrupt and expired
        files are deleted on the way out so the next set() starts clean.
        """
        data = self._read_bytes(fname)
        if not data:
            # Missing, unreadable, or the zero-byte moment of someone else's
            # write. Django calls an empty file expired and deletes it; this
            # only reports the miss, because deleting here would be racing a
            # writer that is about to fill the file in. A genuinely orphaned
            # empty file is cleared by the next _cull().
            return None
        try:
            # The file is pickle.dumps(expiry) immediately followed by
            # zlib.compress(pickle.dumps(value)) -- the same layout Django
            # writes, read back by noting where the first pickle ended
            # rather than by leaving the file open to read the rest.
            buf = io.BytesIO(data)
            expiry = pickle.load(buf)
            payload = data[buf.tell():]
        except UNREADABLE_ENTRY_ERRORS:
            logger.warning("cache: discarding unreadable entry %s", fname)
            self._delete(fname)
            return None

        if expiry is not None and expiry < time.time():
            self._delete(fname)
            return None
        return expiry, payload

    def get(self, key, default=None, version=None):
        fname = self._key_to_file(key, version)
        entry = self._live_entry(fname)
        if entry is None:
            return default
        try:
            return pickle.loads(zlib.decompress(entry[1]))
        except UNREADABLE_ENTRY_ERRORS:
            # The expiry header read cleanly but the value after it did not.
            logger.warning("cache: discarding unreadable value for key %r", key)
            self._delete(fname)
            return default

    def has_key(self, key, version=None):
        return self._live_entry(self._key_to_file(key, version)) is not None

    def touch(self, key, timeout=DEFAULT_TIMEOUT, version=None):
        """
        Re-dates an entry by reading it and writing it back, rather than
        rewriting the expiry in place under a lock the way Django does --
        holding a file open across a read-modify-write is the pattern this
        whole module exists to avoid. Nothing in this project calls touch();
        it is here so the backend stays a complete BaseCache.
        """
        value = self.get(key, _MISSING, version)
        if value is _MISSING:
            return False
        self.set(key, value, timeout, version)
        return True

    # ── writing ──────────────────────────────────────────────────────────

    def set(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        """As Django's, but the temp file is swapped in atomically."""
        self._createdir()  # Cache dir can be deleted at any time.
        fname = self._key_to_file(key, version)
        self._cull()  # make some room if necessary
        fd, tmp_path = tempfile.mkstemp(dir=self._dir)
        replaced = False
        try:
            with open(fd, "wb") as f:
                self._write_content(f, timeout, value)
            replaced = self._replace_atomic(tmp_path, fname)
        finally:
            if not replaced:
                try:
                    os.remove(tmp_path)
                except OSError:
                    logger.debug("cache: leaked temp file %s", tmp_path)

    def _replace_atomic(self, tmp_path, fname):
        """
        Move tmp_path onto fname atomically, or leave both untouched.

        os.replace() is the one overwrite primitive that is atomic on both
        platforms, provided the two paths share a volume -- which
        tempfile.mkstemp(dir=self._dir) guarantees. A reader therefore sees
        the whole old file or the whole new one, never the half-written
        middle that file_move_safe's truncate-and-re-stream fallback leaves
        exposed on Windows.

        Windows can still refuse the swap outright while a reader holds the
        destination open (PermissionError, WinError 5 or 32). That refusal
        is safe in the way the old path was not -- nothing is written and
        the previous value is left whole -- so retry, then drop the write.
        Dropping one write means one request goes uncounted by the throttle;
        the alternative Django offers is corrupting the file and failing
        every reader until it is next overwritten.
        """
        for attempt in range(self.replace_attempts):
            try:
                os.replace(tmp_path, fname)
                return True
            except PermissionError:
                if attempt == self.replace_attempts - 1:
                    break
                self._sleep(self.replace_backoff, attempt)
        # Debug, not warning: under heavy concurrency on one key this is an
        # expected, self-correcting outcome, and the next request rewrites
        # the entry anyway. At warning level it would bury the log.
        logger.debug(
            "cache: gave up replacing %s after %d attempts; dropping write",
            fname, self.replace_attempts,
        )
        return False

    def _delete(self, fname):
        """
        As Django's, but a file another process still has open is a no-op
        rather than an exception.

        os.remove() fails on Windows while any other handle to the file is
        open; Django anticipates only FileNotFoundError, because POSIX
        unlinks an open file happily. This runs from _cull() on every set()
        once a cache dir passes MAX_ENTRIES, and from _live_entry() whenever
        a reader finds a stale entry, so unguarded it turns an ordinary
        concurrent read into a 500. Leaving the file costs nothing: the next
        cull, or the next read of that key, clears it.
        """
        try:
            return super()._delete(fname)
        except PermissionError:
            logger.debug("cache: could not delete %s (open elsewhere)", fname)
            return False
