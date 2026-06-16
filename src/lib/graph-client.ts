// Minimal Microsoft Graph client for SharePoint list items. The SharePoint
// backend depends only on the GraphClient INTERFACE, so its mapping logic is
// unit-testable without a tenant; the fetch implementation here is the only
// part that needs validating against a real tenant (the P-SPIKE).

export interface GraphListItem {
  id: string;
  fields: Record<string, unknown>;
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
  ): Promise<void>;
  deleteItem(listId: string, itemId: string): Promise<void>;
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
      throw new Error(`Graph ${res.status} ${path}: ${detail}`);
    }
    return res;
  }

  return {
    async listItems(listId, options) {
      // encodeURIComponent keeps OData $filter spaces as %20 (not +).
      let path = `/lists/${listId}/items?$expand=fields`;
      if (options?.filter) {
        path += `&$filter=${encodeURIComponent(options.filter)}`;
      }
      const res = await request(path);
      const json = (await res.json()) as { value?: GraphListItem[] };
      return json.value ?? [];
    },

    async createItem(listId, fields) {
      const res = await request(`/lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify({ fields }),
      });
      return (await res.json()) as GraphListItem;
    },

    async updateItem(listId, itemId, fields) {
      await request(`/lists/${listId}/items/${itemId}/fields`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
    },

    async deleteItem(listId, itemId) {
      await request(`/lists/${listId}/items/${itemId}`, { method: "DELETE" });
    },
  };
}
