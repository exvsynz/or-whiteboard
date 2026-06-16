import { describe, it, expect, vi, afterEach } from "vitest";
import { createGraphClient } from "@/lib/graph-client";

const config = {
  siteId: "site1",
  getToken: async () => "tok",
  baseUrl: "https://g.test/v1.0",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown, ok = true, status = 200) {
  const f = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("graph-client", () => {
  it("listItems GETs the items endpoint with expand + filter and a bearer token", async () => {
    const f = stubFetch({ value: [{ id: "1", fields: { A: 1 } }] });
    const items = await createGraphClient(config).listItems("L1", {
      filter: "fields/BoardDate eq '2026-06-16'",
    });
    expect(items).toEqual([{ id: "1", fields: { A: 1 } }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/sites/site1/lists/L1/items");
    expect(url).toContain("$expand=fields");
    expect(url).toContain("$filter=");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
  });

  it("createItem POSTs a fields envelope", async () => {
    const f = stubFetch({ id: "9", fields: { PersonId: "p1" } });
    const item = await createGraphClient(config).createItem("L1", {
      PersonId: "p1",
    });
    expect(item.id).toBe("9");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      fields: { PersonId: "p1" },
    });
  });

  it("throws on a non-ok response", async () => {
    stubFetch({ error: "nope" }, false, 403);
    await expect(createGraphClient(config).listItems("L1")).rejects.toThrow(
      /Graph 403/,
    );
  });
});
