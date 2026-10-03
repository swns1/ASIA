import { describe, expect, it } from "vitest";

import { OBSERVED_VALUES, observedMark, observedValueMeta } from "./observedValues";

describe("observedValues", () => {
  it("offers the four DepEd marks, in the order SF9 prints them", () => {
    expect(OBSERVED_VALUES.map((v) => v.value)).toEqual(["AO", "SO", "RO", "NO"]);
  });

  it("finds a saved DepEd mark", () => {
    // Every rating the school holds is one of these. The old screens matched
    // none of them, so every rated student looked unrated.
    expect(observedValueMeta("SO").label).toBe("Sometimes Observed");
    expect(observedValueMeta("NO").label).toBe("Not Observed");
  });

  it("reads an older row's word as the mark SF9 prints for it", () => {
    expect(observedMark("outstanding")).toBe("AO");
    expect(observedMark("satisfactory")).toBe("SO");
    expect(observedMark("needs_improvement")).toBe("RO");
  });

  it("has nothing to show for a missing rating", () => {
    expect(observedMark(null)).toBeNull();
    expect(observedMark("")).toBeNull();
    expect(observedValueMeta(undefined)).toBeNull();
  });
});
