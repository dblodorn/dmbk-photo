/**
 * Headless verification of the admin UI.
 *
 * Plants an admin session cookie, then drives the actual pages in Chromium.
 * Requires a server whose DMBK_GRAPHQL_API_URL points at a local dmbk GraphQL
 * API, and two sessions for that API's test admin — see `pnpm verify:admin`.
 *
 * Writes to the real dmbk-photos database and the real Space, through the
 * API, and cleans up after itself. `ready` photos it did not create are never
 * touched.
 *
 * The app itself no longer reads the photo library's database, but setup and
 * the before/after accounting here still do: `VERIFY_MONGODB_URI` is a
 * connection with access to it, which the runner takes from the API checkout.
 */
import { chromium, type Page } from "playwright";
import { MongoClient, type Document } from "mongodb";
import { SESSION_COOKIE } from "@/server/auth/session";
import { fromPhotoGlobalId, toPhotoGlobalId } from "@/lib/photos/photo-id";
import sharp from "sharp";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3100";
const FIXTURES = process.env.VERIFY_FIXTURES!;
const API_URL = process.env.VERIFY_API_URL ?? "http://localhost:4000/graphql";
/** The browser's session. Sign-out at the end revokes it. */
const VERIFY_TOKEN = process.env.VERIFY_SESSION_TOKEN!;
/** A second session for the same admin, for direct API calls and cleanup. */
const API_TOKEN = process.env.VERIFY_API_TOKEN!;

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${detail && ` — ${detail}`}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  FAIL ${label}${detail && ` — ${detail}`}`);
  }
}

/**
 * The admin session cookie, holding a real API session for the API's test
 * admin. Google sign-in itself can't be driven headless; everything after it —
 * the cookie, the per-request check against the API, writes through the
 * proxy, sign-out — is the real path.
 */
function sessionCookies() {
  return [
    {
      name: SESSION_COOKIE,
      value: VERIFY_TOKEN,
      domain: new URL(BASE).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    },
  ];
}

const text = (page: Page) => page.locator("body").innerText();

// The photo library's database, for setup and before/after accounting only.
const mongo = new MongoClient(process.env.VERIFY_MONGODB_URI!);
const PHOTOS_DB = process.env.VERIFY_PHOTOS_DB ?? "dmbk-photos";
type Doc = Document & { _id: string };
async function photosCollection() {
  await mongo.connect();
  return mongo.db(PHOTOS_DB).collection<Doc>("photos");
}
async function keywordsCollection() {
  await mongo.connect();
  return mongo.db(PHOTOS_DB).collection<Doc>("keywords");
}

// Writes for setup and teardown, straight to the dmbk GraphQL API with the
// second session — the same mutations the screens send through the proxy.
type ApiResult<T> = { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };

async function api<T = Record<string, unknown>>(query: string, variables: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function apiOk<T = Record<string, unknown>>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await api<T>(query, variables);
  if (r.errors?.length || !r.data) throw new Error(`${r.errors?.[0]?.extensions?.code}: ${r.errors?.[0]?.message}`);
  return r.data;
}

async function apiCode(query: string, variables: Record<string, unknown> = {}): Promise<string> {
  const r = await api(query, variables);
  return r.errors?.[0]?.extensions?.code ?? "NO_ERROR";
}

// Reads straight from the API, for asserting on state without driving the UI.
// The browser checks are what verify the screens; these are for the data
// behind them. Ids come back as UUIDs, as the screens use them.
async function anonOk<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const r = (await res.json()) as ApiResult<T>;
  if (r.errors?.length || !r.data) throw new Error(`${r.errors?.[0]?.extensions?.code}: ${r.errors?.[0]?.message}`);
  return r.data;
}

async function publicPhotos(first: number) {
  const data = await anonOk<{ dmbkPhotos: { edges: { node: { id: string; title: string | null } }[] } }>(
    "query($first: Int!) { dmbkPhotos(first: $first) { edges { node { id title } } } }",
    { first },
  );
  return data.dmbkPhotos.edges.map(({ node }) => ({ ...node, id: fromPhotoGlobalId(node.id) }));
}

async function publicKeywords() {
  return (await anonOk<{ dmbkPhotosKeywords: { slug: string; count: number }[] }>(
    "{ dmbkPhotosKeywords { slug count } }",
  )).dmbkPhotosKeywords;
}

const NODE = `query($id: ID!) { node(id: $id) { ... on Photo { id title hidden thumbUrl displayUrl } } }`;
type NodePhoto = { id: string; title: string | null; hidden: boolean | null; thumbUrl: string | null; displayUrl: string | null };

/** A ready, visible photo by UUID, or null — as an anonymous caller sees it. */
async function publicPhoto(uuid: string) {
  const { node } = await anonOk<{ node: NodePhoto | null }>(NODE, { id: toPhotoGlobalId(uuid) });
  return node?.id ? { ...node, id: fromPhotoGlobalId(node.id) } : null;
}

/** Any photo by UUID, as the test admin sees it. */
async function adminPhoto(uuid: string) {
  const { node } = await apiOk<{ node: NodePhoto | null }>(NODE, { id: toPhotoGlobalId(uuid) });
  return node?.id ? { ...node, id: fromPhotoGlobalId(node.id) } : null;
}

const RESERVE = `mutation($input: DmbkPhotosReservePhotoUploadInput!) {
  dmbkPhotosReservePhotoUpload(input: $input) { photo { id } uploadUrl } }`;
const FINALIZE = `mutation($input: DmbkPhotosFinalizePhotoInput!) {
  dmbkPhotosFinalizePhoto(input: $input) { photo { id status } } }`;
const SET_HIDDEN = `mutation($input: DmbkPhotosSetPhotoHiddenInput!) {
  dmbkPhotosSetPhotoHidden(input: $input) { photo { id hidden } } }`;
const DELETE = `mutation($input: DmbkPhotosDeletePhotoInput!) {
  dmbkPhotosDeletePhoto(input: $input) { deletedPhotoId } }`;

/** Reserve an upload; returns the photo's UUID and its presigned URL. */
async function reserve(input: { contentType: string; byteSize: number; title?: string | null; keywords?: string[] }) {
  const d = await apiOk<{ dmbkPhotosReservePhotoUpload: { photo: { id: string }; uploadUrl: string } }>(RESERVE, { input });
  return { id: fromPhotoGlobalId(d.dmbkPhotosReservePhotoUpload.photo.id), uploadUrl: d.dmbkPhotosReservePhotoUpload.uploadUrl };
}

const finalize = (id: string) => apiOk(FINALIZE, { input: { id: toPhotoGlobalId(id) } });
const setHidden = (id: string, hidden: boolean) => apiOk(SET_HIDDEN, { input: { id: toPhotoGlobalId(id), hidden } });

/** Reserve and upload a photo without going through the UI (not finalized). */
async function upload(opts: {
  w: number;
  h: number;
  title?: string;
  keywords?: string[];
}) {
  const bytes = await sharp({
    create: { width: opts.w, height: opts.h, channels: 3, background: "#4477aa" },
  })
    .jpeg({ quality: 85 })
    .toBuffer();

  const res = await reserve({
    contentType: "image/jpeg",
    byteSize: bytes.byteLength,
    title: opts.title ?? null,
    keywords: opts.keywords ?? [],
  });
  const put = await fetch(res.uploadUrl, {
    method: "PUT",
    body: new Uint8Array(bytes),
    headers: { "content-type": "image/jpeg" },
  });
  if (!put.ok) throw new Error(`presigned PUT failed: ${put.status}`);
  return res;
}

async function main() {
  const cookies = sessionCookies();
  console.log(`Using the API test admin's session (${SESSION_COOKIE}) against ${API_URL}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  // Collected across every signed-in screen, checked before sign-out.
  const adminPageErrors: string[] = [];
  page.on("pageerror", (e) => adminPageErrors.push(e.message));

  const created: string[] = [];
  // Captured before anything is created, so the run can prove it put the
  // library back. The public vocabulary is compared rather than the raw
  // keywords collection: a slug's document survives at count 0 by design, and
  // `listKeywords` already excludes those, so what is compared is what anyone
  // can actually see.
  const startPhotos = await (await photosCollection()).countDocuments();
  const startVocabulary = JSON.stringify(
    (await publicKeywords()).map((k) => `${k.slug}:${k.count}`).sort(),
  );

  try {
    // Sign-in surface, in a context with no session. This is the only check
    // that exercises Google Identity Services: if its script fails to load or
    // the client ID was not built in, the page renders no Google button, and
    // every cookie-based check below would still pass while real sign-in was
    // broken.
    console.log("=== sign-in surface (anonymous) ===");
    const anonBrowser = await browser.newContext();
    const anonPage = await anonBrowser.newPage();
    await anonPage.goto(`${BASE}/admin/upload`);
    await anonPage
      .waitForFunction(() => /admin sign-in/i.test(document.body.innerText), null, { timeout: 20_000 })
      .catch(() => {});
    const anonBody = await anonPage.locator("body").innerText();
    check("anonymous visitor sees sign-in", /admin sign-in/i.test(anonBody), JSON.stringify(anonBody.slice(0, 100)));
    check("no admin content leaked", !/upload a photo/i.test(anonBody));
    check("sign-in is configured", !/not configured|could not load/i.test(anonBody), JSON.stringify(anonBody.slice(0, 160)));
    const googleButton = await anonPage
      .waitForSelector('[data-testid="google-sign-in"] iframe[src*="accounts.google.com"]', { state: "attached", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    check("Google sign-in button rendered", googleButton);
    const pageErrors: string[] = [];
    anonPage.on("pageerror", (e) => pageErrors.push(e.message));
    await anonPage.reload();
    await anonPage.waitForTimeout(1500);
    check("no uncaught page errors", pageErrors.length === 0, pageErrors.join("; "));
    await anonBrowser.close();

    // 9.5 — /admin sends a signed-in visitor onward.
    console.log("=== 9.5 redirect from /admin ===");
    await page.goto(`${BASE}/admin`);
    await page.waitForURL("**/admin/upload", { timeout: 10_000 }).catch(() => {});
    check("/admin redirects to /admin/upload", page.url().endsWith("/admin/upload"), page.url());
    // Wait for hydration before asserting on content — the gate renders
    // "Checking session…" first, so an immediate read sees nothing. The file
    // input belongs to the drop area and is visually hidden, so this waits for
    // it to be attached rather than visible; setInputFiles drives it either way.
    await page.waitForSelector("#photo-file", { state: "attached", timeout: 20_000 });
    const uploadBody = await text(page);
    check("upload form is shown", /upload photos/i.test(uploadBody), JSON.stringify(uploadBody.slice(0, 120)));
    const dropArea = page.locator('[aria-describedby="photo-dropzone-formats"]');
    check(
      "a drop area is offered, naming the formats and the limit",
      (await dropArea.count()) === 1 && /drop photos here/i.test(await dropArea.innerText()) && /up to 10 files/i.test(await dropArea.innerText()),
      (await dropArea.innerText().catch(() => "")).replace(/\s+/g, " "),
    );
    check("the drop area is reachable from the keyboard", (await dropArea.getAttribute("tabindex")) === "0");

    // 9.7 — rejection before uploading.
    console.log("\n=== 9.7 pre-upload rejection ===");
    const before = await (await photosCollection()).countDocuments();

    await page.setInputFiles("#photo-file", `${FIXTURES}/too-big.jpg`);
    let body = await text(page);
    check("oversized file rejected on choose", /over the 50 MB limit/i.test(body), body.split("\n").find((l) => /limit/i.test(l)) ?? "");
    check(
      "the rejection is announced as an alert",
      /over the 50 MB limit/i.test(await page.locator('[role="alert"]').first().innerText().catch(() => "")),
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    check(
      "oversized file created no record",
      (await (await photosCollection()).countDocuments()) === before,
    );

    await page.setInputFiles("#photo-file", `${FIXTURES}/not-an-image.pdf`);
    body = await text(page);
    check("unsupported type rejected", /not supported/i.test(body), body.split("\n").find((l) => /supported/i.test(l)) ?? "");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    check(
      "unsupported type created no record",
      (await (await photosCollection()).countDocuments()) === before,
    );

    check(
      "rejected file is not previewed",
      (await page.locator('[data-testid="upload-preview"]').count()) === 0,
    );

    // 9.6 — a real upload lands on the edit view.
    console.log("\n=== 9.6 upload ===");
    await page.setInputFiles("#photo-file", `${FIXTURES}/test-photo.jpg`);
    check("valid file clears the earlier error", !/not supported|over the/i.test(await text(page)));

    console.log("\n=== preview before upload ===");
    const previewImg = page.locator('[data-testid="upload-preview"]');
    await previewImg.waitFor({ timeout: 10_000 }).catch(() => {});
    check("chosen file is previewed", (await previewImg.count()) === 1);
    const firstSrc = await previewImg.getAttribute("src").catch(() => null);
    check("preview uses a local object URL", !!firstSrc?.startsWith("blob:"), firstSrc ?? "none");
    check(
      "preview renders actual pixels",
      await previewImg.evaluate((img: HTMLImageElement) => img.naturalWidth > 0),
    );
    check("file name and size shown", /test-photo\.jpg/.test(await text(page)));

    // Choosing another file must replace it, not stack a second preview.
    await page.setInputFiles("#photo-file", `${FIXTURES}/second-photo.jpg`);
    await page.waitForTimeout(300);
    const secondSrc = await previewImg.getAttribute("src").catch(() => null);
    check("choosing another file replaces the preview", !!secondSrc && secondSrc !== firstSrc);
    check("only one preview is shown", (await previewImg.count()) === 1);
    check("name updates to the new file", /second-photo\.jpg/.test(await text(page)));

    // Back to the real fixture for the upload itself.
    await page.setInputFiles("#photo-file", `${FIXTURES}/test-photo.jpg`);
    await page.waitForTimeout(300);
    await page.fill("#photo-title", "  Harbor at dusk  ");
    await page.fill("#photo-keywords", "Film, film, Black and White");
    await page.click('button[type="submit"]');

    await page.waitForURL("**/admin/photos/**", { timeout: 60_000 });
    const id = page.url().split("/").pop()!;
    created.push(id);
    check("landed on the edit view", /\/admin\/photos\/[0-9a-f-]{36}$/.test(page.url()), page.url());

    await page.waitForSelector("#edit-title", { timeout: 20_000 });
    check("title carried across and trimmed", (await page.inputValue("#edit-title")) === "Harbor at dusk", await page.inputValue("#edit-title"));
    const kw = await page.inputValue("#edit-keywords");
    check("keywords normalized and deduped", kw.includes("black-and-white") && kw.includes("film") && !kw.includes("Film"), kw);
    check("preview image rendered", (await page.locator("img").count()) > 0);

    // 9.8 — the landing URL is shareable.
    console.log("\n=== 9.8 reload the edit URL ===");
    await page.reload();
    await page.waitForSelector("#edit-title", { timeout: 20_000 });
    check("same photo loads on reload", (await page.inputValue("#edit-title")) === "Harbor at dusk");

    // 9.9 — editing.
    console.log("\n=== 9.9 edit title and remove a keyword ===");
    await page.fill("#edit-title", "Harbor at dawn");
    await page.fill("#edit-keywords", "film");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.innerText.includes("Saved."), null, { timeout: 20_000 });
    check("save reported", (await text(page)).includes("Saved."));
    check("keywords replaced wholesale", (await page.inputValue("#edit-keywords")).trim() === "film", await page.inputValue("#edit-keywords"));
    await page.reload();
    await page.waitForSelector("#edit-title", { timeout: 20_000 });
    check("title change persisted", (await page.inputValue("#edit-title")) === "Harbor at dawn");
    check("keyword removal persisted", (await page.inputValue("#edit-keywords")).trim() === "film");

    // 9.10 — clearing keywords.
    console.log("\n=== 9.10 clear all keywords ===");
    await page.fill("#edit-keywords", "");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.innerText.includes("Saved."), null, { timeout: 20_000 });
    await page.reload();
    await page.waitForSelector("#edit-keywords", { timeout: 20_000 });
    check("photo carries no keywords", (await page.inputValue("#edit-keywords")) === "");

    // 9.11 — a refused save keeps the typed value.
    console.log("\n=== 9.11 over-long title ===");
    const longTitle = "x".repeat(250);
    await page.fill("#edit-title", longTitle);
    await page.click('button[type="submit"]');
    await page
      .waitForFunction(() => /character limit/i.test(document.body.innerText), null, { timeout: 20_000 })
      .catch(() => {});
    body = await text(page);
    check(
      "error names the problem",
      /character limit/i.test(body),
      body.split("\n").find((l) => /character limit/i.test(l)) ?? JSON.stringify(body.slice(0, 160)),
    );
    check("typed value kept in the form", (await page.inputValue("#edit-title")) === longTitle);
    await page.reload();
    await page.waitForSelector("#edit-title", { timeout: 20_000 });
    check("stored title unchanged", (await page.inputValue("#edit-title")) === "Harbor at dawn");

    // 9.12 — bad identifiers.
    console.log("\n=== 9.12 unknown and malformed ids ===");
    await page.goto(`${BASE}/admin/photos/f47ac10b-58cc-4372-a567-0e02b2c3d479`);
    await page.waitForFunction(
      () =>
        /No photo found/i.test(document.body.innerText) ||
        document.querySelector("#edit-title") !== null,
      null,
      { timeout: 20_000 },
    );
    {
      const body = await text(page);
      check("unknown id shows not-found", /No photo found/i.test(body), JSON.stringify(body.slice(0, 200)));
    }
    await page.goto(`${BASE}/admin/photos/not-a-real-id`);
    await page.waitForFunction(
      () =>
        /No photo found/i.test(document.body.innerText) ||
        document.querySelector("#edit-title") !== null,
      null,
      { timeout: 20_000 },
    );
    {
      const body = await text(page);
      check("malformed id shows not-found", /No photo found/i.test(body), JSON.stringify(body.slice(0, 200)));
    }

    // Chrome suppression, while we are here.
    console.log("\n=== site chrome ===");
    await page.goto(`${BASE}/admin/upload`);
    await page.waitForSelector("#photo-file", { state: "attached", timeout: 20_000 });
    check(
      "preview cleared after uploading",
      (await page.locator('[data-testid="upload-preview"]').count()) === 0,
    );
    check("no footer on admin", (await page.locator("footer").count()) === 0);
    check("no player bar on admin", (await page.locator(".sc-player-bar").count()) === 0);
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("domcontentloaded");
    check("footer present on public pages", (await page.locator("footer").count()) > 0);

    // 9.14 — the photo is publicly listable.
    console.log("\n=== 9.14 public listing ===");
    const photos = await publicPhotos(50);
    check("uploaded photo is publicly listed", photos.some((p) => p.id === id));

    // ---- Hiding, the gallery, and the retired local surfaces ----
    console.log("\n=== Reads come from the dmbk GraphQL API ===");
    const anonCtx = await browser.newContext();
    for (const retired of ["/api/graphql", "/api/trpc/photos.list"]) {
      const res = await anonCtx.request.fetch(`${BASE}${retired}`, {
        method: retired === "/api/graphql" ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        data: retired === "/api/graphql" ? { query: "{ __typename }" } : undefined,
      });
      check(`${retired} no longer exists`, res.status() === 404, String(res.status()));
    }
    const pageHtml = await (await anonCtx.request.fetch(`${BASE}/`)).text();
    const newest = (await publicPhotos(1))[0];
    check("the gallery renders the API's newest photo", !!newest && pageHtml.includes(newest.id), newest?.id);
    check(
      "anonymous callers get null for privileged fields",
      (await publicPhoto(newest.id))?.hidden === null,
    );

    console.log("\n=== Hiding ===");
    // Re-upload a photo to hide, since the earlier one is edited by then.
    const h = await upload({ w: 500, h: 400, title: "Hide me", keywords: ["hidetest"] });
    await finalize(h.id);
    const hidden = { id: h.id };
    created.push(hidden.id);

    const kwBefore = (await publicKeywords()).find((k) => k.slug === "hidetest")?.count ?? 0;
    check("keyword counted while visible", kwBefore === 1, String(kwBefore));

    await setHidden(hidden.id, true);
    check("hidden photo leaves the public listing", !(await publicPhotos(100)).some((p) => p.id === hidden.id));
    check("hidden photo resolves to nothing publicly by id", (await publicPhoto(hidden.id)) === null);
    const kwAfter = (await publicKeywords()).find((k) => k.slug === "hidetest")?.count ?? 0;
    check("keyword count falls when hidden", kwAfter === 0, String(kwAfter));
    check("administrator still sees it", (await adminPhoto(hidden.id))?.hidden === true);

    await setHidden(hidden.id, false);
    const restored = await publicPhoto(hidden.id);
    check("unhiding restores the photo", restored?.id === hidden.id && restored?.title === "Hide me");
    check("unhiding restores its images", !!restored?.thumbUrl && !!restored?.displayUrl);
    check("keyword count rises again", ((await publicKeywords()).find((k) => k.slug === "hidetest")?.count ?? 0) === 1);
    await setHidden(hidden.id, false);
    check("hiding is idempotent", (await adminPhoto(hidden.id))?.hidden === false);

    console.log("\n=== Admin gallery ===");
    await page.goto(`${BASE}/admin/photos`);
    await page.waitForSelector('[data-testid="gallery-grid"], [data-testid="gallery-empty"]', { timeout: 30_000 });
    const entries = await page.locator("[data-photo-id]").count();
    check("gallery lists photos", entries > 0, `${entries} entr(ies)`);
    check("state is shown per entry", (await page.locator('[data-testid="gallery-state"]').count()) === entries);
    check("gallery links to the edit view", (await page.locator(`a[href="/admin/photos/${hidden.id}"]`).count()) > 0);

    // Toggle inline and confirm the row stays put, marked hidden.
    const row = page.locator(`[data-photo-id="${hidden.id}"]`);
    await row.getByRole("button", { name: /^Hide$/ }).click();
    await page.waitForFunction(
      (id) => document.querySelector(`[data-photo-id="${id}"] [data-testid="gallery-state"]`)?.textContent === "hidden",
      hidden.id,
      { timeout: 20_000 },
    ).catch(() => {});
    check("inline toggle updates without reload", (await row.locator('[data-testid="gallery-state"]').innerText()) === "hidden");
    check("hidden photo stays listed in the unfiltered gallery", (await row.count()) === 1);

    await page.selectOption("#gallery-visibility", "VISIBLE");
    await page.waitForTimeout(1200);
    check("visibility filter excludes the hidden photo", (await page.locator(`[data-photo-id="${hidden.id}"]`).count()) === 0);
    await page.selectOption("#gallery-visibility", "HIDDEN");
    await page.waitForTimeout(1200);
    check("hidden filter includes it", (await page.locator(`[data-photo-id="${hidden.id}"]`).count()) === 1);
    await page.selectOption("#gallery-visibility", "ANY");
    await page.waitForTimeout(1200);

    console.log("\n=== Gallery shows unfinished uploads ===");
    // Create the two records that never reach `ready`: one whose bytes are not
    // an image, and one whose bytes were never uploaded at all.
    const badRes = await reserve({
      contentType: "image/jpeg",
      byteSize: 100,
    });
    created.push(badRes.id);
    await fetch(badRes.uploadUrl, {
      method: "PUT",
      body: "definitely not an image",
      headers: { "content-type": "image/jpeg" },
    });
    check("non-image finalize fails", (await apiCode(FINALIZE, { input: { id: toPhotoGlobalId(badRes.id) } })) === "BAD_USER_INPUT");

    const neverUploaded = await reserve({
      contentType: "image/jpeg",
      byteSize: 100,
    });
    created.push(neverUploaded.id);

    await page.goto(`${BASE}/admin/photos`);
    await page.waitForSelector('[data-testid="gallery-grid"]', { timeout: 30_000 });
    const failedRow = page.locator(`[data-photo-id="${badRes.id}"]`);
    const pendingRow = page.locator(`[data-photo-id="${neverUploaded.id}"]`);
    check("failed upload is listed", (await failedRow.count()) === 1);
    check("failed state is shown", (await failedRow.locator('[data-testid="gallery-state"]').innerText()) === "failed");
    check("pending upload is listed", (await pendingRow.count()) === 1);
    check("pending state is shown", (await pendingRow.locator('[data-testid="gallery-state"]').innerText()) === "pending");
    check("unfinished upload shows no broken image", (await failedRow.locator("img").count()) === 0);

    console.log("\n=== Paging preserves filters (API) ===");
    type Conn = { dmbkPhotos: { edges: { node: { id: string; status: string | null } }[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } } };
    const PAGE = `query($after: String, $states: [PhotoStatus!]) {
      dmbkPhotos(first: 1, after: $after, visibility: ANY, states: $states) {
        edges { node { id status } } pageInfo { endCursor hasNextPage } } }`;
    const all = ["READY", "PENDING", "FAILED"];
    const p1 = (await apiOk<Conn>(PAGE, { states: all })).dmbkPhotos;
    check("first page honors the limit", p1.edges.length === 1, `${p1.edges.length}`);
    check("a further page is reported", p1.pageInfo.hasNextPage === true);
    const p2 = (await apiOk<Conn>(PAGE, { states: all, after: p1.pageInfo.endCursor })).dmbkPhotos;
    check("second page does not repeat the first", p2.edges[0]?.node.id !== p1.edges[0].node.id);
    // Filtered paging must not widen: every page still matches the filter.
    const ready = (await apiOk<Conn>(PAGE, { states: ["READY"] })).dmbkPhotos;
    check("filtered paging keeps its filter", ready.edges.every(({ node }) => node.status === "READY"));

    console.log("\n=== Edit form toggle ===");
    await page.goto(`${BASE}/admin/photos/${hidden.id}`);
    await page.waitForSelector("#edit-title", { timeout: 20_000 });
    check("hidden photo is editable", (await page.inputValue("#edit-title")) === "Hide me");
    await page.getByRole("button", { name: /^Unhide$/ }).click();
    await page.waitForFunction(() => /(^|\s)visible(\s|$)/.test(document.body.innerText), null, { timeout: 20_000 }).catch(() => {});
    check("edit form toggle flips visibility", (await adminPhoto(hidden.id))?.hidden === false);

    console.log("\n=== Delete from the edit view ===");
    // Cancel first: nothing goes, and an unsaved draft survives.
    await page.fill("#edit-title", "Unsaved draft");
    await page.getByRole("button", { name: /^Delete photo$/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 10_000 });
    check("deleting asks for confirmation", /can.t be undone/i.test(await dialog.innerText()), (await dialog.innerText()).replace(/\s+/g, " "));
    check("the confirmation offers hiding instead", /hiding/i.test(await dialog.innerText()));
    await dialog.getByRole("button", { name: /^Cancel$/ }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    check("cancel keeps the photo", (await adminPhoto(hidden.id))?.id === hidden.id);
    check("cancel keeps the unsaved draft", (await page.inputValue("#edit-title")) === "Unsaved draft");

    console.log("\n=== Failures read in the administrator's terms ===");
    // Unreachable: the proxy request never completes.
    await page.route("**/api/admin/graphql", (route) => route.abort());
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /couldn.t reach the photo service/i.test(document.body.innerText), null, { timeout: 10_000 }).catch(() => {});
    check("an unreachable service is reported as such", /couldn.t reach the photo service/i.test(await text(page)));
    check("…and the draft survives it", (await page.inputValue("#edit-title")) === "Unsaved draft");
    await page.unroute("**/api/admin/graphql");

    // Session ended: the cookie is gone by the time the save is sent.
    await context.clearCookies();
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /session ended/i.test(document.body.innerText), null, { timeout: 10_000 }).catch(() => {});
    check("an ended session is reported as such", /session ended/i.test(await text(page)));
    await context.addCookies(cookies);

    // Not found: the photo is deleted behind the open edit view's back.
    const gone = await upload({ w: 400, h: 300, title: "Gone already" });
    await finalize(gone.id);
    created.push(gone.id);
    await page.goto(`${BASE}/admin/photos/${gone.id}`);
    await page.waitForSelector("#edit-title", { timeout: 20_000 });
    await apiOk(DELETE, { input: { id: toPhotoGlobalId(gone.id) } });
    created.splice(created.indexOf(gone.id), 1);
    await page.getByRole("button", { name: /^Delete photo$/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Delete$/ }).click();
    await page.waitForFunction(() => /no longer exists/i.test(document.body.innerText), null, { timeout: 10_000 }).catch(() => {});
    check("deleting a photo deleted elsewhere reports not found", /no longer exists/i.test(await text(page)));
    check("…and stays on the edit view", page.url().endsWith(`/admin/photos/${gone.id}`), page.url());

    await page.goto(`${BASE}/admin/photos/${hidden.id}`);
    await page.waitForSelector("#edit-title", { timeout: 20_000 });

    // Then confirm.
    await page.getByRole("button", { name: /^Delete photo$/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Delete$/ }).click();
    await page.waitForURL("**/admin/photos", { timeout: 30_000 }).catch(() => {});
    check("a confirmed delete returns to the library", page.url().endsWith("/admin/photos"), page.url());
    await page.waitForFunction(() => /Photo deleted\./.test(document.body.innerText), null, { timeout: 10_000 }).catch(() => {});
    check("the delete is confirmed in a toast", /Photo deleted\./.test(await text(page)));
    await page.waitForSelector('[data-testid="gallery-grid"], [data-testid="gallery-empty"]', { timeout: 30_000 });
    check("the deleted photo is absent from the library", (await page.locator(`[data-photo-id="${hidden.id}"]`).count()) === 0);
    check("the record is gone", (await (await photosCollection()).countDocuments({ _id: hidden.id })) === 0);
    check(
      "its keyword is no longer counted",
      ((await publicKeywords()).find((k) => k.slug === "hidetest")?.count ?? 0) === 0,
    );
    created.splice(created.indexOf(hidden.id), 1);

    console.log("\n=== Delete whose files outlive the record ===");
    // A key over storage's 1024-byte limit can never exist, so removing it
    // fails without touching anything real — the API's own test does the same.
    const stuckId = crypto.randomUUID();
    const stuckNow = new Date().toISOString();
    await (await photosCollection()).insertOne({
      _id: stuckId, title: "Stuck files", keywords: [], status: "pending", hidden: false,
      originalKey: `photos/${stuckId}/${"x".repeat(1100)}.jpg`, displayKey: null, gridKey: null, thumbKey: null,
      width: null, height: null, byteSize: null, contentType: "image/jpeg", failureReason: null,
      createdAt: stuckNow, updatedAt: stuckNow, schemaVersion: 3,
    } as never);
    created.push(stuckId);
    await page.goto(`${BASE}/admin/photos/${stuckId}`);
    await page.waitForSelector("#edit-title", { timeout: 20_000 });
    await page.getByRole("button", { name: /^Delete photo$/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Delete$/ }).click();
    await page.waitForURL("**/admin/photos", { timeout: 30_000 }).catch(() => {});
    await page.waitForFunction(() => /files left behind/i.test(document.body.innerText), null, { timeout: 10_000 }).catch(() => {});
    check("leftover files are reported, not a clean delete", /files left behind/i.test(await text(page)), JSON.stringify((await text(page)).slice(0, 200)));
    check("…and the view still leaves for the library", page.url().endsWith("/admin/photos"), page.url());
    check("…since the record is gone", (await (await photosCollection()).countDocuments({ _id: stuckId })) === 0);
    created.splice(created.indexOf(stuckId), 1);

    console.log("\n=== The proxy forwards only what the admin sends ===");
    const proxy = (headers: Record<string, string>, body: unknown) =>
      fetch(`${BASE}/api/admin/graphql`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, code: (await r.json()).errors?.[0]?.extensions?.code }));
    const cookie = `${SESSION_COOKIE}=${API_TOKEN}`;
    const noCookie = await proxy({ origin: BASE }, { id: "x" });
    check("no session cookie is refused", noCookie.status === 401 && noCookie.code === "UNAUTHENTICATED", JSON.stringify(noCookie));
    const crossOrigin = await proxy({ origin: "https://evil.example", cookie }, { id: "x" });
    check("a cross-origin request is refused", crossOrigin.status === 403, JSON.stringify(crossOrigin));
    const noOrigin = await proxy({ cookie }, { id: "x" });
    check("a request naming no origin is refused", noOrigin.status === 403, JSON.stringify(noOrigin));
    const unknownOp = await proxy({ origin: BASE, cookie }, { id: "not-a-persisted-operation", variables: {} });
    check("an operation the admin never compiled is refused", unknownOp.status === 400 && unknownOp.code === "PERSISTED_QUERY_NOT_FOUND", JSON.stringify(unknownOp));
    const asText = await proxy({ origin: BASE, cookie }, { query: "mutation { signOut }" });
    check("query text is not forwarded", asText.status === 400, JSON.stringify(asText));

    await anonCtx.close();

    // ---- Batch upload ----
    // Named apart from the `photos` array 9.14 binds in this same scope.
    const photoDocs = await photosCollection();
    const countPhotos = () => photoDocs.countDocuments();
    const allIds = async () =>
      (await photoDocs.find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
    const fx = (n: number) => `${FIXTURES}/batch-${String(n).padStart(2, "0")}.jpg`;

    console.log("\n=== Batch: over the limit ===");
    await page.goto(`${BASE}/admin/upload`);
    await page.waitForSelector("#photo-file", { state: "attached", timeout: 20_000 });
    const beforeBatch = await countPhotos();

    await page.setInputFiles(
      "#photo-file",
      Array.from({ length: 11 }, (_, i) => fx(i + 1)),
    );
    body = await text(page);
    check("eleven files are refused", /at most 10 at a time/i.test(body), body.split("\n").find((l) => /at most/i.test(l)) ?? "");
    check("the refusal names how many were chosen", /you chose 11 files/i.test(body));
    check(
      "nothing is previewed after an over-limit refusal",
      (await page.locator('[data-testid="upload-preview"]').count()) === 0,
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    check("over-limit selection created no record", (await countPhotos()) === beforeBatch);

    console.log("\n=== Batch: one bad file among several ===");
    await page.setInputFiles("#photo-file", [fx(1), fx(2), `${FIXTURES}/not-an-image.pdf`]);
    body = await text(page);
    check("the rejection names the bad file", /not-an-image\.pdf/.test(body) && /not supported/i.test(body), body.split("\n").find((l) => /not supported/i.test(l)) ?? "");
    check(
      "the whole selection is refused — nothing is previewed",
      (await page.locator('[data-testid="upload-preview"]').count()) === 0,
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    check("refused selection created no record", (await countPhotos()) === beforeBatch);

    console.log("\n=== Batch: ten files with shared keywords ===");
    await page.setInputFiles(
      "#photo-file",
      Array.from({ length: 10 }, (_, i) => fx(i + 1)),
    );
    await page.waitForSelector('[data-testid="batch-item"]', { timeout: 20_000 });
    check("ten files are accepted", (await page.locator('[data-testid="batch-item"]').count()) === 10);
    check("no title field is offered for a batch", (await page.locator("#photo-title").count()) === 0);
    check("every chosen file is previewed", (await page.locator('[data-testid="upload-preview"]').count()) === 10);

    await page.fill("#photo-keywords", "Batch Test, film");
    await page.click('button[type="submit"]');

    // Watch it run: per-file states, a disabled submit, and a forced resubmit
    // that must upload nothing a second time.
    // Kept so the check can print the snapshot it actually fired on. Printing
    // the final one would show ten rows reading "done" as the evidence that
    // progress is per file, which is exactly how a vacuous check looks.
    let mixedSnapshot = "";
    let sawDisabled = false;
    let forcedResubmit = false;
    let finalStates: string[] = [];
    for (let i = 0; i < 240; i++) {
      const states = await page.$$eval('[data-testid="batch-item"]', (els) =>
        els.map((e) => (e as HTMLElement).dataset.state ?? ""),
      );
      finalStates = states;
      const finished = states.length === 10 && states.every((s) => s === "done" || s === "failed");
      if (!finished) {
        if (!mixedSnapshot && new Set(states).size > 1) mixedSnapshot = states.join(",");
        if (await page.locator('button[type="submit"]').isDisabled()) sawDisabled = true;
        if (!forcedResubmit && states.some((s) => s === "uploading" || s === "processing")) {
          // Past the disabled button, straight at the form: the guard in the
          // handler is what has to hold, not just the button's state.
          await page.evaluate(() =>
            (document.querySelector("form") as HTMLFormElement).requestSubmit(),
          );
          forcedResubmit = true;
        }
      }
      if (finished) break;
      await page.waitForTimeout(250);
    }

    check("progress is reported per file, not per batch", mixedSnapshot !== "", mixedSnapshot);
    check("the upload control is disabled while a batch runs", sawDisabled);
    check("a resubmit was forced mid-batch", forcedResubmit);
    check("all ten uploaded", finalStates.filter((s) => s === "done").length === 10, finalStates.join(","));
    check("the summary reports every file", finalStates.length === 10);
    check("a batch does not navigate away", page.url().endsWith("/admin/upload"), page.url());

    const batchHrefs = await page.$$eval(
      '[data-testid="batch-item"] a[href^="/admin/photos/"]',
      (els) => els.map((e) => e.getAttribute("href") ?? ""),
    );
    check("each success links to its edit view", batchHrefs.length === 10, `${batchHrefs.length} link(s)`);
    const batchIds = batchHrefs.map((h) => h.split("/").pop()!);
    created.push(...batchIds);
    check(
      "ten files produced ten records, none uploaded twice",
      (await countPhotos()) === beforeBatch + 10,
      `${beforeBatch} → ${await countPhotos()}`,
    );

    const batchDocs = await photoDocs.find({ _id: { $in: batchIds } }).toArray();
    check(
      "every photo carries the shared keywords",
      batchDocs.length === 10 &&
        batchDocs.every((d) => d.keywords.includes("batch-test") && d.keywords.includes("film")),
      batchDocs.map((d) => d.keywords.join("+")).join(" | "),
    );
    check(
      "shared keywords are normalized identically",
      new Set(batchDocs.map((d) => [...d.keywords].sort().join(","))).size === 1,
    );
    const batchCount = (await publicKeywords()).find((k) => k.slug === "batch-test")?.count ?? 0;
    check("the vocabulary counts all ten", batchCount === 10, String(batchCount));
    check(
      "every photo in the batch is publicly listable",
      (await publicPhotos(100)).filter((p) => batchIds.includes(p.id)).length === 10,
    );

    console.log("\n=== Batch: a file that fails while the rest succeed ===");
    const idsBeforeMixed = new Set(await allIds());
    await page.setInputFiles("#photo-file", [fx(11), `${FIXTURES}/broken.jpg`, fx(12)]);
    await page.waitForSelector('[data-testid="batch-item"]', { timeout: 20_000 });
    await page.fill("#photo-keywords", "mixedtest");
    await page.click('button[type="submit"]');
    await page
      .waitForFunction(
        () => {
          const els = [...document.querySelectorAll('[data-testid="batch-item"]')];
          return (
            els.length === 3 &&
            els.every((e) => {
              const s = (e as HTMLElement).dataset.state;
              return s === "done" || s === "failed";
            })
          );
        },
        null,
        { timeout: 120_000 },
      )
      .catch(() => {});

    const rows = await page.$$eval('[data-testid="batch-item"]', (els) =>
      els.map((e) => ({
        state: (e as HTMLElement).dataset.state ?? "",
        name: e.querySelector('[data-testid="batch-item-name"]')?.textContent ?? "",
        error: e.querySelector('[data-testid="batch-item-error"]')?.textContent ?? "",
        href: e.querySelector('a[href^="/admin/photos/"]')?.getAttribute("href") ?? "",
      })),
    );
    check("every file in the batch is accounted for", rows.length === 3, `${rows.length} row(s)`);
    const failedRows = rows.filter((r) => r.state === "failed");
    check("the failing file is reported failed", failedRows.length === 1 && failedRows[0].name === "broken.jpg", rows.map((r) => `${r.name}:${r.state}`).join(" "));
    check("the failure gives a reason", failedRows[0]?.error.length > 0, failedRows[0]?.error ?? "");
    const okRows = rows.filter((r) => r.state === "done");
    check("one failure did not discard the others", okRows.length === 2);
    check("a batch with a failure still does not navigate away", page.url().endsWith("/admin/upload"), page.url());

    const newIds = (await allIds()).filter((id) => !idsBeforeMixed.has(id));
    for (const id of newIds) if (!created.includes(id)) created.push(id);
    check("three files produced three records", newIds.length === 3, `${newIds.length}`);

    const mixedIds = okRows.map((r) => r.href.split("/").pop()!);
    const listedNow = await publicPhotos(100);
    check(
      "the successes are stored and publicly listable",
      mixedIds.length === 2 && mixedIds.every((id) => listedNow.some((p) => p.id === id)),
    );
    const mixedCount = (await publicKeywords()).find((k) => k.slug === "mixedtest")?.count ?? 0;
    check("keyword counts reflect only the photos that exist", mixedCount === 2, String(mixedCount));

    console.log("\n=== Single upload is unchanged ===");
    await page.setInputFiles("#photo-file", `${FIXTURES}/second-photo.jpg`);
    await page.waitForSelector('[data-testid="batch-item"]', { timeout: 20_000 });
    check("a title is offered for one file", (await page.locator("#photo-title").count()) === 1);
    await page.fill("#photo-title", "Just the one");
    await page.fill("#photo-keywords", "singletest");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/admin/photos/**", { timeout: 60_000 });
    const singleId = page.url().split("/").pop()!;
    created.push(singleId);
    check("a single file still lands on the edit view", /\/admin\/photos\/[0-9a-f-]{36}$/.test(page.url()), page.url());
    await page.waitForSelector("#edit-title", { timeout: 20_000 });
    check("its title carried across", (await page.inputValue("#edit-title")) === "Just the one");
    check("its keywords carried across", (await page.inputValue("#edit-keywords")).includes("singletest"));

    console.log("\n=== AVIF finalizes ===");
    await page.goto(`${BASE}/admin/upload`);
    await page.waitForSelector("#photo-file", { state: "attached", timeout: 20_000 });
    await page.setInputFiles("#photo-file", `${FIXTURES}/photo.avif`);
    await page.waitForSelector('[data-testid="batch-item"]', { timeout: 20_000 });
    await page.click('button[type="submit"]');
    const avifLanded = await page
      .waitForURL("**/admin/photos/**", { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    check("an AVIF upload lands on its edit view", avifLanded, avifLanded ? "" : JSON.stringify((await text(page)).slice(0, 240)));
    if (avifLanded) {
      const avifId = page.url().split("/").pop()!;
      created.push(avifId);
      const avifDoc = await (await photosCollection()).findOne({ _id: avifId });
      check("…and is ready, recorded as image/avif", avifDoc?.status === "ready" && avifDoc?.contentType === "image/avif", `${avifDoc?.status} ${avifDoc?.contentType}`);
    }

    check("no uncaught errors on any admin screen", adminPageErrors.length === 0, adminPageErrors.join("; "));

    // 9.13 — sign out, last because it ends the session.
    console.log("\n=== 9.13 sign out ===");
    await page.goto(`${BASE}/admin/upload`);
    await page.waitForSelector("text=Sign out", { timeout: 20_000 });
    await page.click("text=Sign out");
    const returned = await page
      .waitForFunction(() => /admin sign-in/i.test(document.body.innerText), null, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    check("sign-out returns to sign-in", returned, returned ? "" : JSON.stringify((await text(page)).slice(0, 160)));
    await page.goto(`${BASE}/admin/photos/${id}`);
    await page.waitForFunction(() => !document.body.innerText.includes("Checking session"), null, { timeout: 20_000 });
    check("admin routes gated after sign-out", /admin sign-in/i.test(await text(page)));
  } finally {
    await browser.close();

    // Clean up everything this run created, in the database and in Spaces.
    const photos = await photosCollection();
    for (const id of created) {
      // Through the API's delete, so keyword counts are decremented and the
      // stored objects go too. Removing the document directly leaves counts
      // stranded — the vocabulary then advertises keywords no photo carries.
      const code = await apiCode(DELETE, { input: { id: toPhotoGlobalId(id) } });
      if (code === "NO_ERROR" || code === "NOT_FOUND") continue;
      console.error(`  ! could not delete test photo ${id} (${code})`);
      await photos.deleteOne({ _id: id });
    }
    console.log(`\nCleaned up ${created.length} test photo(s).`);
    const remaining = await photos.countDocuments();
    const kw = await (await keywordsCollection()).countDocuments();
    console.log(`Library now holds ${remaining} photo(s), ${kw} keyword(s).`);

    check("the library is left as it was found", remaining === startPhotos, `${startPhotos} → ${remaining}`);
    const endVocabulary = JSON.stringify(
      (await publicKeywords()).map((k) => `${k.slug}:${k.count}`).sort(),
    );
    check("the vocabulary is left as it was found", endVocabulary === startVocabulary, endVocabulary);
  }

  await mongo.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log("Failed:", failures.join("; "));
  process.exit(fail ? 1 : 0);
}

await main();
