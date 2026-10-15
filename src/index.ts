import type { Env, LinkResponse } from "./types.ts";
import {
  isAuthenticated,
  createSessionToken,
  createSessionCookie,
  createClearSessionCookie,
  timingSafeEqualString,
} from "./auth.ts";
import {
  ensureSchema,
  getLinkBySlug,
  getLinkById,
  listLinks,
  createLinkRecord,
  updateLinkRecord,
  deleteLinkRecord,
  recordClick,
  getStatsData,
} from "./db.ts";
import { generateQrSvg } from "./qr.ts";

const RESERVED_SLUGS: Record<string, true> = {
  "": true,
  api: true,
  login: true,
  dashboard: true,
  assets: true,
  qr: true,
  "favicon.ico": true,
  "favicon.svg": true,
  "robots.txt": true,
  health: true,
  "404": true,
  "index.html": true,
  "app.js": true,
  "style.css": true,
};

const SLUG_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;

function jsonResponse(data: unknown, status: number = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

function isValidHttpUrl(string: string): boolean {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function generateRandomSlug(length: number = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function renderNotFoundHtml(slug: string, origin: string): Response {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Tidak Ditemukan - 404</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-[100dvh] flex items-center justify-center p-4 antialiased">
  <main class="w-full max-w-md bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-center">
    <div class="w-14 h-14 mx-auto mb-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
      <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    </div>
    <span class="inline-block text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold mb-2">Error 404</span>
    <h1 class="text-2xl font-bold tracking-tight text-white mb-3">Tautan Tidak Ditemukan</h1>
    <p class="text-sm text-zinc-400 leading-relaxed mb-6">
      Tautan pendek <code class="px-2 py-0.5 rounded bg-zinc-800 text-emerald-300 font-mono text-xs font-medium">/${slug}</code> tidak ada atau telah dihapus oleh pemiliknya.
    </p>
    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a href="/" class="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-emerald-500 text-zinc-950 font-semibold text-sm hover:bg-emerald-400 transition-colors active:scale-[0.98]">
        Kembali ke Beranda
      </a>
    </div>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;
    const pathname = url.pathname;

    const adminPassword = env.ADMIN_PASSWORD || "admin123";
    const sessionSecret = env.SESSION_SECRET || adminPassword;
    const requireAuthToCreate = (env.REQUIRE_AUTH_TO_CREATE || "false").toLowerCase() === "true";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Health check
    if (pathname === "/health") {
      return jsonResponse({
        status: "ok",
        app: env.APP_NAME || "KlipLink",
        timestamp: new Date().toISOString(),
      });
    }

    // SVG QR Code generator endpoint: /qr/:slug
    if (pathname.startsWith("/qr/")) {
      const slug = pathname.substring(4);
      if (!slug) return errorResponse("Slug parameter required", 400);

      const targetShortUrl = `${origin}/${slug}`;
      const svg = generateQrSvg(targetShortUrl, 320);
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // API Routes
    if (pathname.startsWith("/api/")) {
      // 1. Auth Status: GET /api/auth/me
      if (pathname === "/api/auth/me" && request.method === "GET") {
        const authed = await isAuthenticated(request, adminPassword, sessionSecret);
        return jsonResponse({
          authenticated: authed,
          username: env.ADMIN_USERNAME || "admin",
          require_auth_to_create: requireAuthToCreate,
          is_default_password: adminPassword === "admin123",
          app_name: env.APP_NAME || "KlipLink",
        });
      }

      // 2. Auth Login: POST /api/auth/login
      if (pathname === "/api/auth/login" && request.method === "POST") {
        try {
          const body = (await request.json()) as { password?: string; username?: string };
          const password = (body.password || "").trim();

          const isMatch = timingSafeEqualString(password, adminPassword);
          if (!isMatch) {
            return errorResponse("Password yang Anda masukkan salah.", 401);
          }

          const username = body.username || env.ADMIN_USERNAME || "admin";
          const token = await createSessionToken(username, sessionSecret);
          const cookieHeader = createSessionCookie(token);

          return jsonResponse(
            {
              success: true,
              message: "Login berhasil",
              username,
              token,
            },
            200,
            { "Set-Cookie": cookieHeader }
          );
        } catch {
          return errorResponse("Payload JSON login tidak valid.", 400);
        }
      }

      // 3. Auth Logout: POST /api/auth/logout
      if (pathname === "/api/auth/logout" && request.method === "POST") {
        return jsonResponse(
          { success: true, message: "Logout berhasil" },
          200,
          { "Set-Cookie": createClearSessionCookie() }
        );
      }

      // 4. Statistics: GET /api/stats (Requires Auth)
      if (pathname === "/api/stats" && request.method === "GET") {
        const authed = await isAuthenticated(request, adminPassword, sessionSecret);
        if (!authed) return errorResponse("Unauthorized. Silakan login terlebih dahulu.", 401);

        const stats = await getStatsData(env.DB, origin);
        return jsonResponse(stats);
      }

      // 5. List Links: GET /api/links (Requires Auth)
      if (pathname === "/api/links" && request.method === "GET") {
        const authed = await isAuthenticated(request, adminPassword, sessionSecret);
        if (!authed) return errorResponse("Unauthorized. Silakan login terlebih dahulu.", 401);

        const search = url.searchParams.get("q") || undefined;
        const sort = (url.searchParams.get("sort") || "created_desc") as
          | "created_desc"
          | "created_asc"
          | "clicks_desc"
          | "clicks_asc";

        const records = await listLinks(env.DB, search, sort);
        const links: LinkResponse[] = records.map((r) => ({
          ...r,
          short_url: `${origin}/${r.slug}`,
        }));

        return jsonResponse({ links, count: links.length });
      }

      // 6. Create Link: POST /api/links
      if (pathname === "/api/links" && request.method === "POST") {
        const authed = await isAuthenticated(request, adminPassword, sessionSecret);
        if (requireAuthToCreate && !authed) {
          return errorResponse("Unauthorized. Anda harus login untuk membuat shortlink.", 401);
        }

        try {
          const body = (await request.json()) as {
            url?: string;
            slug?: string;
            title?: string;
          };

          const rawUrl = (body.url || "").trim();
          if (!rawUrl || !isValidHttpUrl(rawUrl)) {
            return errorResponse(
              "URL tujuan tidak valid. Pastikan dimulai dengan http:// atau https://",
              400
            );
          }

          let slug = (body.slug || "").trim();
          if (slug) {
            if (!SLUG_REGEX.test(slug)) {
              return errorResponse(
                "Slug kustom hanya boleh berisi huruf, angka, tanda minus (-), dan garis bawah (_), dengan panjang 2-64 karakter.",
                400
              );
            }
            if (RESERVED_SLUGS[slug.toLowerCase()]) {
              return errorResponse(`Slug "${slug}" adalah kata sistem yang dicadangkan.`, 400);
            }

            const existing = await getLinkBySlug(env.DB, slug);
            if (existing) {
              return errorResponse(
                `Slug "${slug}" sudah digunakan. Silakan gunakan slug lain.`,
                409
              );
            }
          } else {
            // Auto generate slug and retry if collided
            let attempts = 0;
            let candidate = "";
            while (attempts < 5) {
              candidate = generateRandomSlug(6);
              if (!RESERVED_SLUGS[candidate.toLowerCase()]) {
                const existing = await getLinkBySlug(env.DB, candidate);
                if (!existing) {
                  slug = candidate;
                  break;
                }
              }
              attempts++;
            }
            if (!slug) {
              slug = generateRandomSlug(8);
            }
          }

          const id = crypto.randomUUID();
          const title = body.title ? body.title.trim().slice(0, 120) : null;
          const created = await createLinkRecord(env.DB, { id, slug, url: rawUrl, title });

          const responseData: LinkResponse = {
            ...created,
            short_url: `${origin}/${created.slug}`,
          };

          return jsonResponse({ success: true, link: responseData }, 201);
        } catch (err) {
          console.error("Create link error details:", err);
          return errorResponse("Gagal memproses pembuatan link. Pastikan JSON valid.", 400);
        }
      }

      // 7. Update Link: PUT /api/links/:id (Requires Auth)
      if (pathname.startsWith("/api/links/") && request.method === "PUT") {
        const authed = await isAuthenticated(request, adminPassword, sessionSecret);
        if (!authed) return errorResponse("Unauthorized. Silakan login terlebih dahulu.", 401);

        const id = pathname.substring(11);
        if (!id) return errorResponse("ID link diperlukan.", 400);

        try {
          const body = (await request.json()) as {
            url?: string;
            slug?: string;
            title?: string | null;
          };

          const existing = await getLinkById(env.DB, id);
          if (!existing) return errorResponse("Link tidak ditemukan.", 404);

          let nextSlug = existing.slug;
          if (body.slug !== undefined) {
            const trimmedSlug = body.slug.trim();
            if (!SLUG_REGEX.test(trimmedSlug)) {
              return errorResponse(
                "Slug hanya boleh berisi huruf, angka, minus (-), dan garis bawah (_), 2-64 karakter.",
                400
              );
            }
            if (RESERVED_SLUGS[trimmedSlug.toLowerCase()]) {
              return errorResponse(`Slug "${trimmedSlug}" dicadangkan untuk sistem.`, 400);
            }
            if (trimmedSlug !== existing.slug) {
              const duplicate = await getLinkBySlug(env.DB, trimmedSlug);
              if (duplicate && duplicate.id !== id) {
                return errorResponse(`Slug "${trimmedSlug}" sudah digunakan oleh link lain.`, 409);
              }
            }
            nextSlug = trimmedSlug;
          }

          let nextUrl = existing.url;
          if (body.url !== undefined) {
            const trimmedUrl = body.url.trim();
            if (!isValidHttpUrl(trimmedUrl)) {
              return errorResponse("URL tujuan tidak valid (harus http:// atau https://).", 400);
            }
            nextUrl = trimmedUrl;
          }

          const nextTitle =
            body.title !== undefined ? (body.title ? body.title.trim().slice(0, 120) : null) : existing.title;

          const updated = await updateLinkRecord(env.DB, id, {
            slug: nextSlug,
            url: nextUrl,
            title: nextTitle,
          });

          if (!updated) return errorResponse("Gagal memperbarui link.", 500);

          return jsonResponse({
            success: true,
            link: {
              ...updated,
              short_url: `${origin}/${updated.slug}`,
            },
          });
        } catch {
          return errorResponse("Payload JSON update tidak valid.", 400);
        }
      }

      // 8. Delete Link: DELETE /api/links/:id (Requires Auth)
      if (pathname.startsWith("/api/links/") && request.method === "DELETE") {
        const authed = await isAuthenticated(request, adminPassword, sessionSecret);
        if (!authed) return errorResponse("Unauthorized. Silakan login terlebih dahulu.", 401);

        const id = pathname.substring(11);
        if (!id) return errorResponse("ID link diperlukan.", 400);

        const deleted = await deleteLinkRecord(env.DB, id);
        if (!deleted) return errorResponse("Link tidak ditemukan atau sudah dihapus.", 404);

        return jsonResponse({ success: true, message: "Link berhasil dihapus." });
      }

      return errorResponse("Endpoint API tidak ditemukan.", 404);
    }

    // Shortlink redirection handling
    const potentialSlug = pathname.slice(1);
    if (potentialSlug && !potentialSlug.includes("/") && !RESERVED_SLUGS[potentialSlug.toLowerCase()]) {
      const link = await getLinkBySlug(env.DB, potentialSlug);
      if (link) {
        // Asynchronously record click count and timestamp without blocking redirection
        ctx.waitUntil(recordClick(env.DB, potentialSlug));

        return Response.redirect(link.url, 302);
      }

      // If not found in DB, return high-craft 404 page
      return renderNotFoundHtml(potentialSlug, origin);
    }

    // Static Assets & Web App UI handling
    if (env.ASSETS) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }

        // SPA routing: return /index.html for /login or /dashboard
        if (pathname === "/login" || pathname === "/dashboard") {
          const indexRequest = new Request(new URL("/", request.url), request);
          return await env.ASSETS.fetch(indexRequest);
        }

        return assetResponse;
      } catch (err) {
        console.error("Asset fetch error:", err);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
