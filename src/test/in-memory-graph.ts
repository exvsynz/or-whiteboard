import { GraphConflictError } from "@/lib/graph-client";
import type { GraphClient, GraphListItem } from "@/lib/graph-client";

// An in-memory stand-in for the Microsoft Graph list-item API, used to drive
// the SharePoint backend's write/read paths offline (no tenant). It models the
// Graph behaviours the adapter depends on:
//   - createItem mints a server-side item id + ETag and stores the row
//   - updateItem merges fields and BUMPS the ETag (404 if absent); when an
//     If-Match etag is supplied that no longer matches, it throws
//     GraphConflictError (Graph's 412) — the basis for optimistic concurrency
//   - deleteItem removes a row (404 if absent; If-Match honoured)
//   - listItems supports the minimal OData $filter grammar the adapter emits:
//       a single  `fields/<col> eq '<value>'`  clause, optionally two such
//       clauses joined by ` and `. No other operators are supported.

interface StoredItem {
  id: string;
  fields: Record<string, unknown>;
  etag: string;
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
  let nextId = 1;
  let nextEtag = 1;
  const mintEtag = () => `etag-${nextEtag++}`;

  for (const [listId, items] of Object.entries(seed)) {
    lists.set(
      listId,
      items.map((it) => ({
        id: it.id,
        fields: { ...it.fields },
        etag: it.etag ?? mintEtag(),
      })),
    );
  }

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
    etag: it.etag,
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
      const item: StoredItem = {
        id: `item-${nextId++}`,
        fields: { ...fields },
        etag: mintEtag(),
      };
      rowsFor(listId).push(item);
      return snapshot(item);
    },

    async updateItem(listId, itemId, fields, etag) {
      const item = rowsFor(listId).find((r) => r.id === itemId);
      if (!item) throw new Error(`in-memory fake: 404 update ${listId}/${itemId}`);
      if (etag !== undefined && etag !== item.etag) {
        throw new GraphConflictError(412, `${listId}/${itemId} etag mismatch`);
      }
      Object.assign(item.fields, fields);
      item.etag = mintEtag();
    },

    async deleteItem(listId, itemId, etag) {
      const rows = rowsFor(listId);
      const idx = rows.findIndex((r) => r.id === itemId);
      if (idx === -1) {
        throw new Error(`in-memory fake: 404 delete ${listId}/${itemId}`);
      }
      if (etag !== undefined && etag !== rows[idx].etag) {
        throw new GraphConflictError(412, `${listId}/${itemId} etag mismatch`);
      }
      rows.splice(idx, 1);
    },
  };
}

// ---- controllable variant (for interleaving / in-flight tests) ----

export interface WriteGate {
  /** Let the parked write proceed (executes at release time). */
  release: () => void;
  /** Reject the parked write with a (non-conflict) error. */
  fail: (err?: unknown) => void;
}

export interface GraphControl {
  /**
   * Arm a one-shot gate: the NEXT write op (create/update/delete) parks until
   * the returned handle's release()/fail() is called. Reads pass through.
   */
  gateNextWrite(): WriteGate;
  /** Make the NEXT listItems read reject once (simulate a failed poll/refetch). */
  failNext(): void;
  /** Replace the backing store (and clear any armed gate) — re-seed per test. */
  reset(seed?: Record<string, GraphListItem[]>): void;
}

interface InternalGate {
  attach: (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
    run: () => Promise<unknown>,
  ) => void;
}

/** An in-memory GraphClient whose writes can be gated to orchestrate races. */
export function createControllableGraphClient(
  seed: Record<string, GraphListItem[]> = {},
): { client: GraphClient; control: GraphControl } {
  let base = createInMemoryGraphClient(seed);
  let armed: InternalGate | null = null;
  let failNextRead = false;

  function gate<T>(run: () => Promise<T>): Promise<T> {
    const h = armed;
    if (!h) return run();
    armed = null;
    return new Promise<T>((resolve, reject) => {
      h.attach(resolve as (v: unknown) => void, reject, run as () => Promise<unknown>);
    });
  }

  const control: GraphControl = {
    gateNextWrite() {
      let res: ((v: unknown) => void) | null = null;
      let rej: ((e: unknown) => void) | null = null;
      let exec: (() => Promise<unknown>) | null = null;
      let action: null | { ok: true } | { ok: false; err: unknown } = null;
      const settle = () => {
        if (!exec || !action) return;
        if (action.ok) exec().then(res!, rej!);
        else rej!(action.err);
      };
      armed = {
        attach: (resolve, reject, run) => {
          res = resolve;
          rej = reject;
          exec = run;
          settle();
        },
      };
      return {
        release: () => {
          action = { ok: true };
          settle();
        },
        fail: (err) => {
          action = { ok: false, err: err ?? new Error("gated write failed") };
          settle();
        },
      };
    },
    failNext() {
      failNextRead = true;
    },
    reset(newSeed = {}) {
      base = createInMemoryGraphClient(newSeed);
      armed = null;
      failNextRead = false;
    },
  };

  const client: GraphClient = {
    listItems: (listId, options) => {
      if (failNextRead) {
        failNextRead = false;
        return Promise.reject(new Error("in-memory fake: poll read failed"));
      }
      return base.listItems(listId, options);
    },
    createItem: (listId, fields) => gate(() => base.createItem(listId, fields)),
    updateItem: (listId, itemId, fields, etag) =>
      gate(() => base.updateItem(listId, itemId, fields, etag)),
    deleteItem: (listId, itemId, etag) =>
      gate(() => base.deleteItem(listId, itemId, etag)),
  };

  return { client, control };
}
