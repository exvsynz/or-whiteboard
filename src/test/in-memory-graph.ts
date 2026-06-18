import type { GraphClient, GraphListItem } from "@/lib/graph-client";

// An in-memory stand-in for the Microsoft Graph list-item API, used to drive
// the SharePoint backend's write/read paths offline (no tenant). It models the
// only Graph behaviours the adapter depends on:
//   - createItem mints a server-side item id and stores the row
//   - updateItem merges fields into an existing row (404 if absent)
//   - deleteItem removes a row (404 if absent)
//   - listItems supports the minimal OData $filter grammar the adapter emits:
//       a single  `fields/<col> eq '<value>'`  clause, optionally two such
//       clauses joined by ` and `. No other operators are supported.
// ETag / If-Match concurrency is intentionally out of scope here — it lands in
// P4b (JOS-203) on top of this same fake.

interface StoredItem {
  id: string;
  fields: Record<string, unknown>;
}

const CLAUSE = /^fields\/(\w+) eq '(.*)'$/;

/** Evaluate the adapter's minimal `fields/X eq 'v' [and fields/Y eq 'w']` filter. */
function matchesFilter(fields: Record<string, unknown>, filter: string): boolean {
  return filter.split(" and ").every((raw) => {
    const m = CLAUSE.exec(raw.trim());
    if (!m) throw new Error(`in-memory fake: unsupported filter clause: ${raw}`);
    const [, col, value] = m;
    return String(fields[col] ?? "") === value;
  });
}

export function createInMemoryGraphClient(
  seed: Record<string, GraphListItem[]> = {},
): GraphClient {
  // listId -> rows. Seed is deep-copied so callers can't alias the store.
  const lists = new Map<string, StoredItem[]>();
  for (const [listId, items] of Object.entries(seed)) {
    lists.set(
      listId,
      items.map((it) => ({ id: it.id, fields: { ...it.fields } })),
    );
  }
  let nextId = 1;

  const rowsFor = (listId: string): StoredItem[] => {
    let rows = lists.get(listId);
    if (!rows) {
      rows = [];
      lists.set(listId, rows);
    }
    return rows;
  };

  const snapshot = (it: StoredItem): GraphListItem => ({
    id: it.id,
    fields: { ...it.fields },
  });

  return {
    async listItems(listId, options) {
      const rows = rowsFor(listId);
      const filtered = options?.filter
        ? rows.filter((r) => matchesFilter(r.fields, options.filter as string))
        : rows;
      return filtered.map(snapshot);
    },

    async createItem(listId, fields) {
      const item: StoredItem = { id: `item-${nextId++}`, fields: { ...fields } };
      rowsFor(listId).push(item);
      return snapshot(item);
    },

    async updateItem(listId, itemId, fields) {
      const item = rowsFor(listId).find((r) => r.id === itemId);
      if (!item) throw new Error(`in-memory fake: 404 update ${listId}/${itemId}`);
      Object.assign(item.fields, fields);
    },

    async deleteItem(listId, itemId) {
      const rows = rowsFor(listId);
      const idx = rows.findIndex((r) => r.id === itemId);
      if (idx === -1) {
        throw new Error(`in-memory fake: 404 delete ${listId}/${itemId}`);
      }
      rows.splice(idx, 1);
    },
  };
}
