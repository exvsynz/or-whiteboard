import { describe, it, expect, vi, afterEach } from "vitest";
import { createGraphClient, GraphConflictError } from "@/lib/graph-client";

function res(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

// Typed fetch stand-in so `mock.calls[0][1]` (the RequestInit) is well-typed.
const fetchFn = (status: number, body: unknown = {}) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    res(status, body),
  );

const cfg = { siteId: "S", getToken: async () => "tok" };

afterEach(() => vi.unstubAllGlobals());

describe("createGraphClient — ETag / If-Match", () => {
  it("listItems surfaces @odata.etag on each item", async () => {
    vi.stubGlobal(
      "fetch",
      fetchFn(200, {
        value: [{ id: "i1", "@odata.etag": 'W/"1"', fields: { PersonId: "p1" } }],
      }),
    );
    const items = await createGraphClient(cfg).listItems("L");
    expect(items[0].id).toBe("i1");
    expect(items[0].etag).toBe('W/"1"');
  });

  it("createItem surfaces @odata.etag", async () => {
    vi.stubGlobal("fetch", fetchFn(201, { id: "i9", "@odata.etag": 'W/"7"', fields: {} }));
    const created = await createGraphClient(cfg).createItem("L", { x: 1 });
    expect(created.etag).toBe('W/"7"');
  });

  it("updateItem sends an If-Match header when an etag is given", async () => {
    const fetchMock = fetchFn(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await createGraphClient(cfg).updateItem("L", "i1", { Area: "R2" }, 'W/"1"');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('W/"1"');
  });

  it("updateItem omits If-Match when no etag is passed (back-compat with P4a)", async () => {
    const fetchMock = fetchFn(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await createGraphClient(cfg).updateItem("L", "i1", { x: 1 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["If-Match"]).toBeUndefined();
  });

  it("updateItem maps a 412 to GraphConflictError", async () => {
    vi.stubGlobal("fetch", fetchFn(412, "precondition failed"));
    await expect(
      createGraphClient(cfg).updateItem("L", "i1", { Area: "R2" }, 'W/"1"'),
    ).rejects.toBeInstanceOf(GraphConflictError);
  });

  it("deleteItem maps a 409 to GraphConflictError and sends If-Match", async () => {
    const fetchMock = fetchFn(409, "conflict");
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createGraphClient(cfg).deleteItem("L", "i1", 'W/"1"'),
    ).rejects.toBeInstanceOf(GraphConflictError);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('W/"1"');
  });

  it("a non-conflict error stays a generic Error (not GraphConflictError)", async () => {
    vi.stubGlobal("fetch", fetchFn(404, "not found"));
    const err = await createGraphClient(cfg)
      .updateItem("L", "i1", { x: 1 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(GraphConflictError);
  });
});
