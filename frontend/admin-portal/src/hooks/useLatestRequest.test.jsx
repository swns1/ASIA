import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import useLatestRequest from "./useLatestRequest";

describe("useLatestRequest", () => {
  it("treats only the newest call as current", () => {
    const { result } = renderHook(() => useLatestRequest());
    const first = result.current();
    expect(first()).toBe(true);

    const second = result.current();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("keeps the same function across renders, so loaders can list it as a dependency", () => {
    const { result, rerender } = renderHook(() => useLatestRequest());
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });
});
