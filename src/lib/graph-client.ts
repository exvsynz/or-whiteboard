// Minimal Microsoft Graph client for SharePoint list items. The SharePoint
// backend depends only on the GraphClient INTERFACE, so its mapping logic is
// unit-testable without a tenant; the fetch implementation here is the only
// part that needs validating against a real tenant (the P-SPIKE).

export interface GraphListItem {
  id: string;
  fields: Record<string, unknown>;
  /** The item's `@odata.etag`, used for If-Match optimistic concurrency (P4b). */
  etag?: string;
}

/**
 * Thrown when Graph rejects a conditional write (412 Precondition Failed or
 * 409 Conflict) — the If-Match ETag no longer matches, i.e. the item changed
 * underneath us. Callers catch this to re-read and reconcile.
 */
export class GraphConflictError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`Graph ${status} conflict: ${detail}`);
    this.name = "GraphConflictError";
    this.status = status;
  }
}

export interface GraphClient {
  listItems(
    listId: string,
    options?: { filter?: string },
  ): Promise<GraphListItem[]>;
  createItem(
    listId: string,
    fields: Record<string, unknown>,
  ): Promise<GraphListItem>;
  updateItem(
    listId: string,
    itemId: string,
    fields: Record<string, unknown>,
    /** When set, sent as `If-Match`; a stale ETag yields a GraphConflictError. */
    etag?: string,
  ): Promise<void>;
  deleteItem(listId: string, itemId: string, etag?: string): Promise<void>;
}

export interface GraphClientConfig {
  /** SharePoint site id the lists live under. */
  siteId: string;
  /** Returns a current Graph access token (MSAL acquires it in P1). */
  getToken: () => Promise<string>;
  /** Override the Graph endpoint (tests). */
  baseUrl?: string;
}

const DEFAULT_BASE = "https://graph.microsoft.com/v1.0";

export function createGraphClient(config: GraphClientConfig): GraphClient {
  const base = `${config.baseUrl ?? DEFAULT_BASE}/sites/${config.siteId}`;

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const token = await config.getToken();
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // A failed precondition (stale If-Match ETag) is a distinct, recoverable
      // case — surface it typed so the adapter can re-read and reconcile.
      if (res.status === 412 || res.status === 409) {
        throw new GraphConflictError(res.status, `${path}: ${detail}`);
      }
      throw new Error(`Graph ${res.status} ${path}: ${detail}`);
    }
    return res;
  }

  // Graph returns the ETag as the `@odata.etag` annotation on each item.
  type RawItem = { id: string; fields: Record<string, unknown>; "@odata.etag"?: string };
  const toItem = (raw: RawItem): GraphListItem => ({
    id: raw.id,
    fields: raw.fields,
    etag: raw["@odata.etag"],
  });

  return {
    async listItems(listId, options) {
      // encodeURIComponent keeps OData $filter spaces as %20 (not +).
      let path = `/lists/${listId}/items?$expand=fields`;
      if (options?.filter) {
        path += `&$filter=${encodeURIComponent(options.filter)}`;
      }
      const res = await request(path);
      const json = (await res.json()) as { value?: RawItem[] };
      return (json.value ?? []).map(toItem);
    },

    async createItem(listId, fields) {
      const res = await request(`/lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify({ fields }),
      });
      return toItem((await res.json()) as RawItem);
    },

    async updateItem(listId, itemId, fields, etag) {
      await request(`/lists/${listId}/items/${itemId}/fields`, {
        method: "PATCH",
        body: JSON.stringify(fields),
        headers: etag ? { "If-Match": etag } : undefined,
      });
    },

    async deleteItem(listId, itemId, etag) {
      await request(`/lists/${listId}/items/${itemId}`, {
        method: "DELETE",
        headers: etag ? { "If-Match": etag } : undefined,
      });
    },
  };
}
