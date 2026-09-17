import { describe, it, expect, vi } from "vitest";
import fetchAllPages from "./fetchAllPages";

describe("fetchAllPages", () => {
  it("follows next until the last page", async () => {
    const fetchPage = vi.fn(({ page }) =>
      Promise.resolve({ results: [`row-${page}`], next: page < 3 ? `?page=${page + 1}` : null }),
    );
    expect(await fetchAllPages(fetchPage, { school_year: "2026-2027" })).toEqual(["row-1", "row-2", "row-3"]);
    expect(fetchPage).toHaveBeenLastCalledWith({ school_year: "2026-2027", page: 3, page_size: 500 });
  });

  it("takes an unpaginated array as the whole list", async () => {
    const fetchPage = vi.fn(() => Promise.resolve(["a", "b"]));
    expect(await fetchAllPages(fetchPage)).toEqual(["a", "b"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops at the page limit", async () => {
    const fetchPage = vi.fn(() => Promise.resolve({ results: ["x"], next: "more" }));
    expect(await fetchAllPages(fetchPage, {}, { maxPages: 2 })).toEqual(["x", "x"]);
  });
});
