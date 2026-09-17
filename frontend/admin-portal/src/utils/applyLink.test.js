import { describe, it, expect } from "vitest";
import { isLocalOnlyUrl, isPrivateNetworkUrl, resolveApplyUrl } from "./applyLink";

const INVITE = "/apply/2f6c1f84-0f3d-4d4f-9a1a-1b2c3d4e5f60";

describe("resolveApplyUrl", () => {
  it("rewrites a localhost link onto the address staff are actually using", () => {
    expect(resolveApplyUrl(`http://localhost:5173${INVITE}`, "http://192.168.1.42:5173"))
      .toBe(`http://192.168.1.42:5173${INVITE}`);
  });

  it("keeps the port staff are on, which may differ from the configured one", () => {
    expect(resolveApplyUrl(`http://localhost:5173${INVITE}`, "http://192.168.1.42:4173"))
      .toBe(`http://192.168.1.42:4173${INVITE}`);
  });

  it("leaves a configured LAN link alone even when staff use localhost", () => {
    const configured = `http://192.168.1.42:4173${INVITE}`;
    expect(resolveApplyUrl(configured, "http://localhost:5173")).toBe(configured);
  });

  it("cannot rescue a localhost link when staff are on localhost too", () => {
    const local = `http://localhost:5173${INVITE}`;
    expect(resolveApplyUrl(local, "http://localhost:5173")).toBe(local);
    expect(isLocalOnlyUrl(resolveApplyUrl(local, "http://127.0.0.1:5173"))).toBe(true);
  });

  it("passes through anything unparseable rather than throwing", () => {
    expect(resolveApplyUrl("not a url", "http://192.168.1.42:4173")).toBe("not a url");
    expect(resolveApplyUrl("", "http://192.168.1.42:4173")).toBe("");
    expect(resolveApplyUrl(`http://localhost:5173${INVITE}`, "nonsense"))
      .toBe(`http://localhost:5173${INVITE}`);
  });
});

describe("isLocalOnlyUrl", () => {
  it("knows the addresses a phone resolves to itself", () => {
    expect(isLocalOnlyUrl("http://localhost:4173/apply/x")).toBe(true);
    expect(isLocalOnlyUrl("http://127.0.0.1:4173/apply/x")).toBe(true);
    expect(isLocalOnlyUrl("http://192.168.1.42:4173/apply/x")).toBe(false);
    expect(isLocalOnlyUrl("https://slis.example.edu.ph/apply/x")).toBe(false);
  });
});

describe("isPrivateNetworkUrl", () => {
  it("treats LAN addresses as same-network-only", () => {
    for (const url of [
      "http://192.168.100.9:4173/apply/x",
      "http://10.0.0.5:4173/apply/x",
      "http://172.16.4.2/apply/x",
      "http://172.31.255.1/apply/x",
      "http://localhost:5173/apply/x",
      "http://slis-pc:4173/apply/x",
      "http://slis-pc.local:4173/apply/x",
    ]) {
      expect(isPrivateNetworkUrl(url), url).toBe(true);
    }
  });

  it("treats a hosted address as reachable from any network", () => {
    for (const url of [
      "https://frontend-production-1a2b.up.railway.app/apply/x",
      "https://app.southlakes.edu.ph/apply/x",
      "http://172.32.0.1/apply/x",
      "http://8.8.8.8/apply/x",
    ]) {
      expect(isPrivateNetworkUrl(url), url).toBe(false);
    }
  });

  it("does not throw on garbage", () => {
    expect(isPrivateNetworkUrl("not a url")).toBe(false);
    expect(isPrivateNetworkUrl("")).toBe(false);
  });
});
