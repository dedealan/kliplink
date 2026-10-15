import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";
import type { Env, LinkResponse, StatsResponse } from "../src/types.ts";
import { createMockD1Database } from "./mock-d1.ts";

interface HealthCheckData {
  status: string;
  app: string;
}

interface AuthMeData {
  authenticated: boolean;
  username?: string;
  require_auth_to_create?: boolean;
}

interface LinkCreateResult {
  success: boolean;
  link: LinkResponse;
  error?: string;
}

interface LinkListResult {
  links: LinkResponse[];
  count: number;
}

function createMockContext(): ExecutionContext {
  const promises: Promise<unknown>[] = [];
  // Mock execution context boundary for unit test
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      promises.push(promise);
    },
    passThroughOnException() {},
    props: {},
  };
  return ctx as unknown as ExecutionContext;
}

function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createMockD1Database(),
    ADMIN_PASSWORD: "secret-test-password",
    ADMIN_USERNAME: "admin",
    SESSION_SECRET: "test-hmac-secret-1234567890",
    REQUIRE_AUTH_TO_CREATE: "false",
    APP_NAME: "KlipLink",
    ...overrides,
  };
}

test("Worker: Health Check", async () => {
  const env = createTestEnv();
  const ctx = createMockContext();
  const req = new Request("https://link.test/health");
  const res = await worker.fetch(req, env, ctx);

  assert.equal(res.status, 200);
  const data = (await res.json()) as HealthCheckData;
  assert.equal(data.status, "ok");
  assert.equal(data.app, "KlipLink");
});

test("Worker: Auth Flow (Login, Check Me, Logout, Bearer Token)", async () => {
  const env = createTestEnv();
  const ctx = createMockContext();

  // 1. Initial auth status
  const meReq1 = new Request("https://link.test/api/auth/me");
  const meRes1 = await worker.fetch(meReq1, env, ctx);
  const meData1 = (await meRes1.json()) as AuthMeData;
  assert.equal(meData1.authenticated, false);

  // 2. Login with wrong password
  const failLoginReq = new Request("https://link.test/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong-password" }),
  });
  const failLoginRes = await worker.fetch(failLoginReq, env, ctx);
  assert.equal(failLoginRes.status, 401);

  // 3. Login with correct password
  const loginReq = new Request("https://link.test/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "secret-test-password" }),
  });
  const loginRes = await worker.fetch(loginReq, env, ctx);
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get("Set-Cookie");
  assert.ok(cookie && cookie.includes("shortlink_session="));
  const loginBody = (await loginRes.json()) as { token: string };
  assert.ok(loginBody.token);

  // 4. Check auth status with cookie
  const meReq2 = new Request("https://link.test/api/auth/me", {
    headers: { Cookie: cookie },
  });
  const meRes2 = await worker.fetch(meReq2, env, ctx);
  const meData2 = (await meRes2.json()) as AuthMeData;
  assert.equal(meData2.authenticated, true);
  assert.equal(meData2.username, "admin");

  // 5. Check auth with Bearer token
  const meBearerReq = new Request("https://link.test/api/auth/me", {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  const meBearerRes = await worker.fetch(meBearerReq, env, ctx);
  const meBearerData = (await meBearerRes.json()) as AuthMeData;
  assert.equal(meBearerData.authenticated, true);

  // 6. Direct password as Bearer token for CLI/API testing
  const meDirectReq = new Request("https://link.test/api/auth/me", {
    headers: { Authorization: "Bearer secret-test-password" },
  });
  const meDirectRes = await worker.fetch(meDirectReq, env, ctx);
  const meDirectData = (await meDirectRes.json()) as AuthMeData;
  assert.equal(meDirectData.authenticated, true);

  // 7. Logout
  const logoutReq = new Request("https://link.test/api/auth/logout", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const logoutRes = await worker.fetch(logoutReq, env, ctx);
  assert.equal(logoutRes.status, 200);
  const clearCookie = logoutRes.headers.get("Set-Cookie");
  assert.ok(clearCookie && clearCookie.includes("Max-Age=0"));
});

test("Worker: Require Auth To Create Mode", async () => {
  const env = createTestEnv({ REQUIRE_AUTH_TO_CREATE: "true" });
  const ctx = createMockContext();

  // Attempt creation without auth -> must be rejected 401
  const unauthRes = await worker.fetch(
    new Request("https://link.test/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    }),
    env,
    ctx
  );
  assert.equal(unauthRes.status, 401);

  // Attempt creation with auth -> accepted 201
  const authRes = await worker.fetch(
    new Request("https://link.test/api/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-test-password",
      },
      body: JSON.stringify({ url: "https://example.com", slug: "auth-link" }),
    }),
    env,
    ctx
  );
  assert.equal(authRes.status, 201);
});

test("Worker: Link Creation, Validation, and Redirection", async () => {
  const env = createTestEnv();
  const ctx = createMockContext();

  // 1. Create a custom slug shortlink
  const createReq = new Request("https://link.test/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://example.com/target-page",
      slug: "custom-promo",
      title: "Promo Link",
    }),
  });
  const createRes = await worker.fetch(createReq, env, ctx);
  assert.equal(createRes.status, 201);
  const createData = (await createRes.json()) as LinkCreateResult;
  assert.equal(createData.success, true);
  assert.equal(createData.link.slug, "custom-promo");
  assert.equal(createData.link.url, "https://example.com/target-page");
  assert.equal(createData.link.clicks, 0);

  // 2. Reject duplicate slug
  const dupReq = new Request("https://link.test/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://different.com",
      slug: "custom-promo",
    }),
  });
  const dupRes = await worker.fetch(dupReq, env, ctx);
  assert.equal(dupRes.status, 409);

  // 3. Reject invalid URL
  const invalidUrlReq = new Request("https://link.test/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "not-a-valid-url" }),
  });
  const invalidUrlRes = await worker.fetch(invalidUrlReq, env, ctx);
  assert.equal(invalidUrlRes.status, 400);

  // 4. Reject reserved slug
  const reservedReq = new Request("https://link.test/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://example.com",
      slug: "login",
    }),
  });
  const reservedRes = await worker.fetch(reservedReq, env, ctx);
  assert.equal(reservedRes.status, 400);

  // 5. Reject invalid slug characters
  const badSlugReq = new Request("https://link.test/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://example.com",
      slug: "invalid slug with spaces!",
    }),
  });
  const badSlugRes = await worker.fetch(badSlugReq, env, ctx);
  assert.equal(badSlugRes.status, 400);

  // 6. Test redirection
  const redirectReq = new Request("https://link.test/custom-promo");
  const redirectRes = await worker.fetch(redirectReq, env, ctx);
  assert.equal(redirectRes.status, 302);
  assert.equal(redirectRes.headers.get("Location"), "https://example.com/target-page");

  // 7. Test 404 on nonexistent slug
  const notFoundReq = new Request("https://link.test/nonexistent-link");
  const notFoundRes = await worker.fetch(notFoundReq, env, ctx);
  assert.equal(notFoundRes.status, 404);
  const notFoundText = await notFoundRes.text();
  assert.ok(notFoundText.includes("Tautan Tidak Ditemukan"));
});

test("Worker: Admin Link Management (List, Edit, Delete, Stats)", async () => {
  const env = createTestEnv();
  const ctx = createMockContext();

  // Login as admin
  const loginReq = new Request("https://link.test/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "secret-test-password" }),
  });
  const loginRes = await worker.fetch(loginReq, env, ctx);
  const authCookie = loginRes.headers.get("Set-Cookie");
  assert.ok(authCookie);

  // Create two links
  const res1 = await worker.fetch(
    new Request("https://link.test/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://blog.example.com",
        slug: "blog",
        title: "Official Blog",
      }),
    }),
    env,
    ctx
  );
  const res1Data = (await res1.json()) as LinkCreateResult;
  const link1 = res1Data.link;

  const res2 = await worker.fetch(
    new Request("https://link.test/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://github.com/dedealan",
        slug: "github",
        title: "GitHub Profile",
      }),
    }),
    env,
    ctx
  );
  const res2Data = (await res2.json()) as LinkCreateResult;
  const link2 = res2Data.link;

  // Simulate clicks on link1
  await worker.fetch(new Request("https://link.test/blog"), env, ctx);
  await worker.fetch(new Request("https://link.test/blog"), env, ctx);

  // Verify unauthorized list rejection
  const unauthListRes = await worker.fetch(new Request("https://link.test/api/links"), env, ctx);
  assert.equal(unauthListRes.status, 401);

  // Authorized list
  const listRes = await worker.fetch(
    new Request("https://link.test/api/links", {
      headers: { Cookie: authCookie },
    }),
    env,
    ctx
  );
  assert.equal(listRes.status, 200);
  const listData = (await listRes.json()) as LinkListResult;
  assert.equal(listData.count, 2);

  // Verify search
  const searchRes = await worker.fetch(
    new Request("https://link.test/api/links?q=github", {
      headers: { Cookie: authCookie },
    }),
    env,
    ctx
  );
  const searchData = (await searchRes.json()) as LinkListResult;
  assert.equal(searchData.count, 1);
  assert.equal(searchData.links[0]?.slug, "github");

  // Verify Stats
  const statsRes = await worker.fetch(
    new Request("https://link.test/api/stats", {
      headers: { Cookie: authCookie },
    }),
    env,
    ctx
  );
  assert.equal(statsRes.status, 200);
  const statsData = (await statsRes.json()) as StatsResponse;
  assert.equal(statsData.total_links, 2);
  assert.equal(statsData.total_clicks, 2);

  // Reject editing link with an already taken slug
  const conflictEditRes = await worker.fetch(
    new Request(`https://link.test/api/links/${link2.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({ slug: "blog" }),
    }),
    env,
    ctx
  );
  assert.equal(conflictEditRes.status, 409);

  // Edit Link (Update slug and URL)
  const editRes = await worker.fetch(
    new Request(`https://link.test/api/links/${link2.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        slug: "git-updated",
        url: "https://github.com/dedealan/kliplink",
        title: "Updated Repo",
      }),
    }),
    env,
    ctx
  );
  assert.equal(editRes.status, 200);
  const editData = (await editRes.json()) as LinkCreateResult;
  assert.equal(editData.link.slug, "git-updated");
  assert.equal(editData.link.url, "https://github.com/dedealan/kliplink");

  // Verify redirection uses updated slug
  const updatedRedirect = await worker.fetch(new Request("https://link.test/git-updated"), env, ctx);
  assert.equal(updatedRedirect.status, 302);
  assert.equal(updatedRedirect.headers.get("Location"), "https://github.com/dedealan/kliplink");

  // Old slug should now 404
  const oldRedirect = await worker.fetch(new Request("https://link.test/github"), env, ctx);
  assert.equal(oldRedirect.status, 404);

  // Delete Link
  const deleteRes = await worker.fetch(
    new Request(`https://link.test/api/links/${link1.id}`, {
      method: "DELETE",
      headers: { Cookie: authCookie },
    }),
    env,
    ctx
  );
  assert.equal(deleteRes.status, 200);

  // Deleted link should 404
  const deletedRedirect = await worker.fetch(new Request("https://link.test/blog"), env, ctx);
  assert.equal(deletedRedirect.status, 404);
});

test("Worker: QR Code SVG Generation", async () => {
  const env = createTestEnv();
  const ctx = createMockContext();

  const qrRes = await worker.fetch(new Request("https://link.test/qr/my-test-slug"), env, ctx);
  assert.equal(qrRes.status, 200);
  assert.equal(qrRes.headers.get("Content-Type"), "image/svg+xml");
  const svgContent = await qrRes.text();
  assert.ok(svgContent.includes("<svg"));
  assert.ok(svgContent.includes("</svg>"));
});
