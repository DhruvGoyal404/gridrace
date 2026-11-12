import { expect, test } from "./fixtures";

test("pages carry the strict CSP and cross-origin isolation", async ({ page, request, errors }) => {
  void errors;
  for (const path of ["/", "/play", "/bench"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("unsafe-inline");
    expect(res.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
  }
  // A CSP violation would surface as a console error, which fails the test.
  await page.goto("/");
  await expect(page.getByText("All arrived")).toBeVisible({ timeout: 60_000 });
});

test("share metadata, manifest and icons resolve", async ({ page, request, errors }) => {
  void errors;
  await page.goto("/");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toBe("https://gridrace.dhruvgoyal.tech/og.png");
  for (const path of ["/og.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toContain("image/png");
  }
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  expect((await request.get("/robots.txt")).status()).toBe(200);
});

test("works offline after the first visit", async ({ page, context, errors }) => {
  void errors;
  await page.goto("/");
  await expect(page.getByText("All arrived")).toBeVisible({ timeout: 60_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await expect(page.getByText("All arrived")).toBeVisible({ timeout: 60_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("All arrived")).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.goto("/play");
  await expect(page.getByRole("grid")).toBeVisible({ timeout: 30_000 });
  await context.setOffline(false);
});
