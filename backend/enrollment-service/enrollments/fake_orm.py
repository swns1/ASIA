"""
A small in-memory stand-in for a Django queryset, for tests only.

This service cannot build a test database (see ai/test_risk_assessment.py),
and the views under test chain filter/exclude/order_by/values_list across
several queries. Scripting a MagicMock for each chain tests the mock, not the
view; this evaluates the lookups for real over plain objects instead.

Supports the lookups the enrollment views use: exact, iexact, in, lt, isnull,
and one level of `__` traversal (e.g. `guardian_response__response`).
"""


def _resolve(row, path):
    value = row
    for part in path:
        value = getattr(value, part, None)
        if value is None:
            return None
    return value


def _ids(values):
    """`__in` accepts ids, or rows from .values("x") (dicts) like the ORM does."""
    out = set()
    for v in values:
        out.add(next(iter(v.values())) if isinstance(v, dict) else v)
    return out


def _matches(row, key, expected):
    parts = key.split("__")
    op = "exact"
    if parts[-1] in ("exact", "iexact", "in", "lt", "isnull"):
        op = parts.pop()
    actual = _resolve(row, parts)
    if op == "exact":
        # The ORM coerces a lookup value to the field's type, so an id read
        # off a query string ("42") still matches an integer column.
        if isinstance(actual, int) and isinstance(expected, str):
            return str(actual) == expected
        return actual == expected
    if op == "iexact":
        return actual is not None and str(actual).lower() == str(expected).lower()
    if op == "in":
        return actual in _ids(expected)
    if op == "lt":
        return actual is not None and actual < expected
    if op == "isnull":
        return (actual is None) == bool(expected)
    raise AssertionError(f"unsupported lookup {key}")


class FakeQuerySet:
    def __init__(self, rows=()):
        self.rows = list(rows)

    # ── narrowing ───────────────────────────────────────────────────────────
    def filter(self, **kw):
        return FakeQuerySet(r for r in self.rows if all(_matches(r, k, v) for k, v in kw.items()))

    def exclude(self, **kw):
        return FakeQuerySet(r for r in self.rows if not all(_matches(r, k, v) for k, v in kw.items()))

    def all(self):
        return FakeQuerySet(self.rows)

    def select_related(self, *args):
        return self

    def order_by(self, *fields):
        rows = list(self.rows)
        for field in reversed(fields):
            desc = field.startswith("-")
            path = field.lstrip("-").split("__")
            rows.sort(key=lambda r: _resolve(r, path), reverse=desc)
        return FakeQuerySet(rows)

    # ── reading ─────────────────────────────────────────────────────────────
    def values(self, *fields):
        return [{f: getattr(r, f) for f in fields} for r in self.rows]

    def values_list(self, *fields, flat=False):
        if flat:
            return [getattr(r, fields[0]) for r in self.rows]
        return [tuple(getattr(r, f) for f in fields) for r in self.rows]

    def exists(self):
        return bool(self.rows)

    def first(self):
        return self.rows[0] if self.rows else None

    def __iter__(self):
        return iter(self.rows)

    def __len__(self):
        return len(self.rows)

    # ── writing ─────────────────────────────────────────────────────────────
    def update(self, **kw):
        for r in self.rows:
            for k, v in kw.items():
                setattr(r, k, v)
        return len(self.rows)
