/**
 * apiClient — token attach, 401 refresh-and-replay, and the refresh mutex.
 *
 * This file had no tests at all despite being the one place every request in
 * the app passes through. The mutex tests below are the point: each backend
 * gets its own axios instance, so "one refresh at a time" is a property of the
 * *module*, not of a client, and only a test that drives several clients at
 * once can tell the difference.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Bare `axios.post` — the refresh call the interceptor makes directly.
const postMock = vi.fn();

vi.mock("axios", () => {
  const create = vi.fn(() => {
    // A client is callable (the interceptor replays via `client(original)`)
    // and carries the two interceptor registries.
    const client = vi.fn((config) => Promise.resolve({ replayedWith: config }));
    client.interceptors = {
      request: {
        use: vi.fn((onRequest) => {
          client.onRequest = onRequest;
        }),
      },
      response: {
        use: vi.fn((onSuccess, onError) => {
          client.onSuccess = onSuccess;
          client.onError = onError;
        }),
      },
    };
    return client;
  });
  return { default: { create, post: postMock } };
});

/** A 401 as axios shapes it, with the `headers` object the interceptor writes to. */
function unauthorized(url = "/whatever") {
  return { response: { status: 401 }, config: { url, headers: {} } };
}

let hrefAssignments;

beforeEach(() => {
  vi.resetModules(); // drop the module-level refreshPromise between tests
  postMock.mockReset();
  sessionStorage.clear();

  hrefAssignments = [];
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      get href() {
        return "/";
      },
      set href(value) {
        hrefAssignments.push(value);
      },
    },
  });
});

/** Fresh module instance + N clients, as the real app's api/*.js files do. */
async function freshClients(count = 3) {
  const { createApiClient } = await import("./apiClient");
  return Array.from({ length: count }, (_, i) =>
    createApiClient({ baseURL: `http://localhost:800${i}/api` })
  );
}

describe("request interceptor", () => {
  it("attaches the stored access token as a bearer header", async () => {
    sessionStorage.setItem("access_token", "tok-abc");
    const [client] = await freshClients(1);

    const config = client.onRequest({ headers: {} });

    expect(config.headers.Authorization).toBe("Bearer tok-abc");
  });

  it("sends no Authorization header when there is no token", async () => {
    const [client] = await freshClients(1);

    const config = client.onRequest({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });
});

describe("refresh mutex", () => {
  it("issues ONE refresh for concurrent 401s across different clients", async () => {
    postMock.mockResolvedValue({ data: { access: "new-token" } });
    const clients = await freshClients(3);

    await Promise.all(clients.map((c) => c.onError(unauthorized())));

    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("replays every waiting request with the refreshed token", async () => {
    postMock.mockResolvedValue({ data: { access: "new-token" } });
    const clients = await freshClients(3);

    const results = await Promise.all(clients.map((c) => c.onError(unauthorized())));

    for (const result of results) {
      expect(result.replayedWith.headers.Authorization).toBe("Bearer new-token");
    }
    expect(sessionStorage.getItem("access_token")).toBe("new-token");
  });

  it("redirects to /login exactly once when the shared refresh fails", async () => {
    postMock.mockRejectedValue(new Error("refresh rejected"));
    const clients = await freshClients(3);

    const settled = await Promise.allSettled(clients.map((c) => c.onError(unauthorized())));

    // Every caller still learns it failed...
    expect(settled.every((r) => r.status === "rejected")).toBe(true);
    // ...but the user is sent to /login once, not three times. Before the
    // mutex this was one navigation per in-flight request, and each one
    // discarded whatever the user had unsaved.
    expect(hrefAssignments).toEqual(["/login"]);
    expect(sessionStorage.getItem("access_token")).toBeNull();
  });

  it("starts a new refresh for a later expiry instead of reusing the settled one", async () => {
    postMock.mockResolvedValue({ data: { access: "token-1" } });
    const [client] = await freshClients(1);

    await client.onError(unauthorized());
    postMock.mockResolvedValue({ data: { access: "token-2" } });
    const second = await client.onError(unauthorized());

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(second.replayedWith.headers.Authorization).toBe("Bearer token-2");
  });

  it("does not refresh again for a request that already retried", async () => {
    postMock.mockResolvedValue({ data: { access: "new-token" } });
    const [client] = await freshClients(1);

    const alreadyRetried = unauthorized();
    alreadyRetried.config._retry = true;

    await expect(client.onError(alreadyRetried)).rejects.toBe(alreadyRetried);
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe("error message rewriting", () => {
  it("uses the backend's detail for a 403", async () => {
    const [client] = await freshClients(1);
    const error = {
      response: { status: 403, data: { detail: "You may not view this student." } },
      config: { headers: {} },
    };

    await expect(client.onError(error)).rejects.toBe(error);
    expect(error.message).toBe("You may not view this student.");
  });

  it("flattens DRF field errors on a 400 into one line", async () => {
    const [client] = await freshClients(1);
    const error = {
      response: { status: 400, data: { lrn: ["Must be 12 digits."], sex: ["Invalid."] } },
      config: { headers: {} },
    };

    await expect(client.onError(error)).rejects.toBe(error);
    expect(error.message).toBe("Must be 12 digits. Invalid.");
  });

  it("labels a 5xx as a server error, not a network problem", async () => {
    const [client] = await freshClients(1);
    // An unhandled backend exception renders an HTML debug page, so there is
    // no `.detail` to read — call sites that fall back to "Network error"
    // would otherwise blame the user's connection for a server bug.
    const error = { response: { status: 500, data: "<html>Traceback</html>" }, config: { headers: {} } };

    await expect(client.onError(error)).rejects.toBe(error);
    expect(error.message).toMatch(/server/i);
  });
});
