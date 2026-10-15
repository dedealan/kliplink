export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  APP_NAME?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  REQUIRE_AUTH_TO_CREATE?: string;
}

export interface LinkRecord {
  id: string;
  slug: string;
  url: string;
  title: string | null;
  clicks: number;
  created_at: string;
  updated_at: string;
  last_clicked_at: string | null;
}

export interface LinkResponse extends LinkRecord {
  short_url: string;
}

export interface StatsResponse {
  total_links: number;
  total_clicks: number;
  top_links: LinkResponse[];
  latest_created: LinkResponse[];
}
