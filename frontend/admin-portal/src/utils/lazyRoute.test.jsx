/**
 * lazyRoute — the self-heal for stale chunks after a deploy.
 *
 * The build already proves every route's import path resolves (it emits a
 * chunk per page). What it cannot check is this: that a failed chunk fetch
 * reloads exactly once, and that a second failure gives up and surfaces a real
 * error rather than putting the tab in a reload loop.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Component, Suspense } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import lazyRoute from "./lazyRoute";

class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? <div>caught: {this.state.error.message}</div> : this.props.children;
  }
}

const chunkError = () => Promise.reject(new Error("Failed to fetch dynamically imported module"));

let reloads;

beforeEach(() => {
  sessionStorage.clear();
  reloads = 0;
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      reload: () => {
        reloads += 1;
      },
    },
  });
});

function renderLazy(load, { withBoundary = false } = {}) {
  const Lazy = lazyRoute(load);
  const tree = (
    <Suspense fallback={<div>Loading chunk</div>}>
      <Lazy />
    </Suspense>
  );
  return render(withBoundary ? <Boundary>{tree}</Boundary> : tree);
}

describe("lazyRoute", () => {
  it("renders the route once its chunk arrives", async () => {
    renderLazy(async () => ({ default: () => <div>Grades page</div> }));

    expect(await screen.findByText("Grades page")).toBeTruthy();
    expect(reloads).toBe(0);
  });

  it("reloads once when the chunk is missing, and stays suspended meanwhile", async () => {
    renderLazy(chunkError);

    await waitFor(() => expect(reloads).toBe(1));
    // Deliberately never resolves: the tab is navigating away, and resolving
    // with anything here would flash a half-rendered route on the way out.
    expect(screen.queryByText("Loading chunk")).not.toBeNull();
    expect(sessionStorage.getItem("chunk_reload_at")).not.toBeNull();
  });

  it("gives up and surfaces the error when a reload just happened", async () => {
    // The reload already ran and the chunk is still gone — a bad deploy or a
    // blocked request, not a stale manifest. Looping here would trap the user.
    sessionStorage.setItem("chunk_reload_at", String(Date.now()));

    renderLazy(chunkError, { withBoundary: true });

    expect(await screen.findByText(/caught: Failed to fetch/)).toBeTruthy();
    expect(reloads).toBe(0);
  });

  it("self-heals again when the previous reload was long ago", async () => {
    // A different deploy, days later — this user has earned another retry.
    sessionStorage.setItem("chunk_reload_at", String(Date.now() - 60_000));

    renderLazy(chunkError);

    await waitFor(() => expect(reloads).toBe(1));
  });

  it("still reloads when sessionStorage is unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    renderLazy(chunkError);

    // One needless reload beats a dead-end error screen for a user whose
    // browser blocks storage.
    await waitFor(() => expect(reloads).toBe(1));

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
