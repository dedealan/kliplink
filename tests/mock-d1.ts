import { DatabaseSync } from "node:sqlite";

type SqliteParam = string | number | bigint | null | Uint8Array;

export function createMockD1Database(): D1Database {
  const db = new DatabaseSync(":memory:");

  // Mock D1Database test harness backed by in-memory SQLite
  const mockDb = {
    async exec(query: string): Promise<D1ExecResult> {
      db.exec(query);
      return { count: 0, duration: 0 };
    },
    prepare(query: string): D1PreparedStatement {
      let boundValues: SqliteParam[] = [];

      const stmt = {
        bind(...values: unknown[]) {
          boundValues = values.map((v) => {
            if (v === undefined || v === null) return null;
            if (typeof v === "string" || typeof v === "number" || typeof v === "bigint") return v;
            if (v instanceof Uint8Array) return v;
            return String(v);
          });
          return stmt;
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          const prepared = db.prepare(query);
          const row = prepared.get(...boundValues) as Record<string, unknown> | undefined;
          if (!row) return null;
          if (colName) return (row[colName] as T) ?? null;
          return row as T;
        },
        async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
          const prepared = db.prepare(query);
          const rows = prepared.all(...boundValues) as T[];
          return {
            results: rows,
            success: true,
            meta: {
              duration: 0,
              size_after: 0,
              rows_read: rows.length,
              rows_written: 0,
              last_row_id: 0,
              changes: 0,
              served_by: "mock",
              changed_db: false,
            },
          };
        },
        async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
          const prepared = db.prepare(query);
          const info = prepared.run(...boundValues);
          const changes = typeof info.changes === "bigint" ? Number(info.changes) : info.changes;
          const lastRowId = typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid;
          return {
            results: [],
            success: true,
            meta: {
              duration: 0,
              size_after: 0,
              rows_read: 0,
              rows_written: changes,
              last_row_id: lastRowId,
              changes,
              served_by: "mock",
              changed_db: changes > 0,
            },
          };
        },
        async raw(): Promise<unknown[]> {
          return [];
        },
      };

      return stmt as unknown as D1PreparedStatement;
    },
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    withSession: () => ({
      prepare: (q: string) => mockDb.prepare(q),
      batch: async () => [],
      getBookmark: () => null,
    }),
  };

  return mockDb as unknown as D1Database;
}
