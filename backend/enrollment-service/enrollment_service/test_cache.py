"""
Regression tests for shared.cache.ResilientFileBasedCache.

The bug these exist for: Django's stock FileBasedCache hands an open file
handle to pickle.load() and deletes cache files out from under other
workers, which on Windows (no FILE_SHARE_DELETE, no unlink-while-open) makes
concurrent access raise PermissionError from inside pickle.load(). Because
DRF's UserRateThrottle is in DEFAULT_THROTTLE_CLASSES, that landed on every
request, and any page loading several endpoints at once hit it regularly --
a 500 with the traceback ending in filebased.py `exp = pickle.load(f)`.

Measured against the stock backend with eight processes on one key, 19-21%
of operations raised. The same load against this backend raises nothing,
which is what test_concurrent_throttle_pattern_never_raises pins down.

No @pytest.mark.django_db anywhere here -- this backend touches only the
filesystem, so these run without a test database (which, per
intake/test_invites.py, this project can't build anyway).
"""
import os
import pickle
import threading
import time
import zlib

import pytest

from shared.cache import ResilientFileBasedCache

KEY = "throttle_user_1"


@pytest.fixture
def cache(tmp_path):
    return ResilientFileBasedCache(str(tmp_path / "cache"), {})


def _throttle_roundtrip(cache):
    """
    Exactly the read-modify-write SimpleRateThrottle.allow_request performs
    on every request: read the history, drop entries outside the window,
    record now, write it back.
    """
    history = cache.get(KEY, [])
    now = time.time()
    while history and history[-1] <= now - 60:
        history.pop()
    history.insert(0, now)
    cache.set(KEY, history, 60)


def _cache_file(cache, key=KEY):
    return cache._key_to_file(key)


# ── the regression ───────────────────────────────────────────────────────


def test_concurrent_throttle_pattern_never_raises(cache):
    """
    The actual bug. Eight threads running the throttle's get/set pair on one
    key, which is what a page that fans several requests out at once does to
    a single user's throttle entry. Against the stock backend this raises
    PermissionError out of pickle.load(); nothing here may raise at all.
    """
    errors = []

    def worker():
        for _ in range(150):
            try:
                _throttle_roundtrip(cache)
            except Exception as exc:  # noqa: BLE001 -- recording, not handling
                errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"{len(errors)} failures, first: {errors[0]!r}"


def test_roundtrip_is_lossless_without_contention(cache):
    """
    Every write lands when nothing is racing. Guards the retry/give-up paths
    in _replace_atomic and _read_bytes against ever firing on a quiet cache:
    entries lost here would be throttle counts silently not taken.
    """
    for _ in range(200):
        _throttle_roundtrip(cache)

    assert len(cache.get(KEY, [])) == 200


# ── unreadable and damaged entries ───────────────────────────────────────


@pytest.mark.parametrize(
    "content",
    [
        pytest.param(b"", id="empty"),
        pytest.param(b"\x80\x05\x95", id="truncated-expiry-header"),
        pytest.param(os.urandom(64), id="garbage"),
    ],
)
def test_unreadable_file_is_a_miss(cache, content):
    """
    A file that can't be parsed reports a miss rather than raising. Django
    handles only the empty case (EOFError); the others are what a file
    damaged by a process killed mid-write looks like.
    """
    cache.set(KEY, ["seed"], 60)
    with open(_cache_file(cache), "wb") as f:
        f.write(content)

    assert cache.get(KEY, "default") == "default"
    assert cache.has_key(KEY) is False
    assert cache.touch(KEY) is False


def test_corrupt_value_after_a_valid_expiry_is_a_miss(cache):
    """
    The expiry header and the value are two separate pickles; the first can
    read cleanly while the second is damaged, which _live_entry alone
    wouldn't catch.
    """
    cache.set(KEY, ["seed"], 60)
    with open(_cache_file(cache), "wb") as f:
        f.write(pickle.dumps(time.time() + 60, pickle.HIGHEST_PROTOCOL))
        f.write(b"not-valid-zlib")

    assert cache.get(KEY, "default") == "default"


def test_damaged_entry_is_cleared_so_the_next_write_starts_clean(cache):
    cache.set(KEY, ["seed"], 60)
    with open(_cache_file(cache), "wb") as f:
        f.write(b"garbage-that-is-not-a-pickle")

    assert cache.get(KEY) is None
    assert not os.path.exists(_cache_file(cache))

    cache.set(KEY, ["fresh"], 60)
    assert cache.get(KEY) == ["fresh"]


# ── Windows file-sharing rules ───────────────────────────────────────────


def test_delete_tolerates_a_file_another_reader_has_open(cache):
    """
    os.remove() fails on Windows while any handle to the file is open, and
    Django's _delete() guards only FileNotFoundError. This path runs from
    _cull() on every set() once a cache dir passes MAX_ENTRIES, so an
    unguarded failure here would surface as a 500 on an ordinary request.
    """
    cache.set(KEY, ["seed"], 60)

    with open(_cache_file(cache), "rb"):  # holds the handle open
        cache.delete(KEY)  # must not raise on any platform


def test_cull_tolerates_open_files(cache):
    """_cull() runs on every set(); one locked file must not fail the write."""
    cache._max_entries = 4
    for i in range(6):
        cache.set(f"key-{i}", [i], 60)

    # Whichever entries survived the culls above -- _cull() picks its victims
    # at random, so no particular key is guaranteed to still be there.
    survivor = cache._list_cache_files()[0]

    with open(survivor, "rb"):  # a cull victim that can't be removed
        cache.set("key-new", ["value"], 60)  # triggers _cull

    assert cache.get("key-new") == ["value"]


# ── ordinary cache behaviour still holds ─────────────────────────────────


def test_expired_entry_is_a_miss_and_is_removed(cache):
    cache.set(KEY, ["value"], 60)
    with open(_cache_file(cache), "wb") as f:
        f.write(pickle.dumps(time.time() - 1, pickle.HIGHEST_PROTOCOL))
        f.write(zlib.compress(pickle.dumps(["value"], pickle.HIGHEST_PROTOCOL)))

    assert cache.get(KEY, "default") == "default"
    assert not os.path.exists(_cache_file(cache))


def test_basic_cache_api(cache):
    assert cache.get("missing") is None
    assert cache.get("missing", "fallback") == "fallback"

    cache.set("k", {"a": 1}, 60)
    assert cache.get("k") == {"a": 1}
    assert cache.has_key("k") is True

    assert cache.add("k", "ignored", 60) is False
    assert cache.add("new", "stored", 60) is True
    assert cache.get("new") == "stored"

    assert cache.touch("k", 120) is True
    assert cache.get("k") == {"a": 1}

    cache.delete("k")
    assert cache.get("k") is None

    cache.set("gone", 1, 60)
    cache.clear()
    assert cache.get("gone") is None


def test_entries_written_by_djangos_own_backend_still_read(cache, tmp_path):
    """
    The on-disk format is unchanged, so switching backends must not orphan an
    existing cache directory.
    """
    from django.core.cache.backends.filebased import FileBasedCache

    stock = FileBasedCache(str(tmp_path / "cache"), {})
    stock.set(KEY, ["written-by-django"], 60)

    assert cache.get(KEY) == ["written-by-django"]
