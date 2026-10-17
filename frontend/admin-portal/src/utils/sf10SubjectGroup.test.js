/**
 * The Subjects page's "Automatic" SF10 group: the same examples the export's
 * own rule is tested on (backend school_forms/test_sf10.py), so the two can't
 * drift apart unnoticed.
 */
import { describe, it, expect } from "vitest";
import { autoSubjectGroup, SF10_GROUP_LABELS } from "./sf10SubjectGroup";

describe("autoSubjectGroup", () => {
  it.each([
    ["Oral Communication in Context", null, "core"],
    ["Physical Education and Health 1", null, "core"],
    ["Empowerment Technologies", null, "applied"],
    ["Research in Daily Life 1", "HUMSS", "applied"],
    ["Research Project/3Is", null, "applied"],
    ["Pagsulat sa Filipino sa Piling Larangan (Akademik)", null, "applied"],
    ["Pre-Calculus", "STEM", "specialized"],
    ["Culminating Activity", null, "specialized"],
    ["Research/Capstone Project", "STEM", "specialized"],
  ])("puts %s (%s) under %s", (name, strand, group) => {
    expect(autoSubjectGroup(name, strand)).toBe(group);
  });

  it("labels the groups the way the school's record heads them", () => {
    expect(Object.values(SF10_GROUP_LABELS)).toEqual(["Core", "Contextualized", "Specialization"]);
  });
});
