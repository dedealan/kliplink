import type { LinkRecord, StatsResponse } from "./types.ts";

const initializedDbs = new WeakSet<D1Database>();

export async function ensureSchema(db: D1Database): Promise<void> {
  if (initializedDbs.has(db)) return;
  await db.exec("CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, url TEXT NOT NULL, title TEXT, clicks INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_clicked_at TEXT);");
  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_links_slug ON links (slug);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at DESC);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_links_clicks ON links (clicks DESC);");
  initializedDbs.add(db);
}

export async function getLinkBySlug(db: D1Database, slug: string): Promise<LinkRecord | null> {
  await ensureSchema(db);
  const result = await db
    .prepare("SELECT * FROM links WHERE slug = ? LIMIT 1")
    .bind(slug)
    .first<LinkRecord>();
  return result || null;
}

export async function getLinkById(db: D1Database, id: string): Promise<LinkRecord | null> {
  await ensureSchema(db);
  const result = await db
    .prepare("SELECT * FROM links WHERE id = ? LIMIT 1")
    .bind(id)
    .first<LinkRecord>();
  return result || null;
}

export async function listLinks(
  db: D1Database,
  query?: string,
  sort: "created_desc" | "created_asc" | "clicks_desc" | "clicks_asc" = "created_desc"
): Promise<LinkRecord[]> {
  await ensureSchema(db);

  let orderBy = "ORDER BY created_at DESC";
  if (sort === "created_asc") orderBy = "ORDER BY created_at ASC";
  else if (sort === "clicks_desc") orderBy = "ORDER BY clicks DESC";
  else if (sort === "clicks_asc") orderBy = "ORDER BY clicks ASC";

  if (query && query.trim().length > 0) {
    const pattern = `%${query.trim()}%`;
    const stmt = db.prepare(
      `SELECT * FROM links WHERE slug LIKE ? OR url LIKE ? OR title LIKE ? ${orderBy}`
    ).bind(pattern, pattern, pattern);
    const result = await stmt.all<LinkRecord>();
    return result.results || [];
  }

  const result = await db.prepare(`SELECT * FROM links ${orderBy}`).all<LinkRecord>();
  return result.results || [];
}

export async function createLinkRecord(
  db: D1Database,
  link: { id: string; slug: string; url: string; title: string | null }
): Promise<LinkRecord> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO links (id, slug, url, title, clicks, created_at, updated_at, last_clicked_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, NULL)`
    )
    .bind(link.id, link.slug, link.url, link.title, now, now)
    .run();

  return {
    id: link.id,
    slug: link.slug,
    url: link.url,
    title: link.title,
    clicks: 0,
    created_at: now,
    updated_at: now,
    last_clicked_at: null,
  };
}

export async function updateLinkRecord(
  db: D1Database,
  id: string,
  fields: { slug?: string; url?: string; title?: string | null }
): Promise<LinkRecord | null> {
  await ensureSchema(db);
  const existing = await getLinkById(db, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextSlug = fields.slug !== undefined ? fields.slug : existing.slug;
  const nextUrl = fields.url !== undefined ? fields.url : existing.url;
  const nextTitle = fields.title !== undefined ? fields.title : existing.title;

  await db
    .prepare(
      `UPDATE links SET slug = ?, url = ?, title = ?, updated_at = ? WHERE id = ?`
    )
    .bind(nextSlug, nextUrl, nextTitle, now, id)
    .run();

  return {
    ...existing,
    slug: nextSlug,
    url: nextUrl,
    title: nextTitle,
    updated_at: now,
  };
}

export async function deleteLinkRecord(db: D1Database, id: string): Promise<boolean> {
  await ensureSchema(db);
  const res = await db.prepare("DELETE FROM links WHERE id = ?").bind(id).run();
  return (res.meta.changes || 0) > 0;
}

export async function recordClick(db: D1Database, slug: string): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      "UPDATE links SET clicks = clicks + 1, last_clicked_at = ? WHERE slug = ?"
    )
    .bind(now, slug)
    .run();
}

export async function getStatsData(db: D1Database, origin: string): Promise<StatsResponse> {
  await ensureSchema(db);

  const countRow = await db
    .prepare("SELECT COUNT(*) as total_links, COALESCE(SUM(clicks), 0) as total_clicks FROM links")
    .first<{ total_links: number; total_clicks: number }>();

  const topRows = await db
    .prepare("SELECT * FROM links ORDER BY clicks DESC LIMIT 5")
    .all<LinkRecord>();

  const latestRows = await db
    .prepare("SELECT * FROM links ORDER BY created_at DESC LIMIT 5")
    .all<LinkRecord>();

  return {
    total_links: countRow?.total_links || 0,
    total_clicks: countRow?.total_clicks || 0,
    top_links: (topRows.results || []).map((r) => ({
      ...r,
      short_url: `${origin}/${r.slug}`,
    })),
    latest_created: (latestRows.results || []).map((r) => ({
      ...r,
      short_url: `${origin}/${r.slug}`,
    })),
  };
}
