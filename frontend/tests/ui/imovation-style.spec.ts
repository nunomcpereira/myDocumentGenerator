import { expect, test } from "@playwright/test";

// Imovation design tokens — source of truth
const TOKENS = {
  // MD3 primary blue
  primary: "rgb(32, 92, 172)",        // #205cac
  // Neutral surfaces
  bgBody: "rgb(255, 255, 255)",        // #ffffff — clean white
  surfaceContainerLow: "rgb(244, 243, 245)", // #f4f3f5
  // Text
  onSurface: "rgb(26, 28, 29)",        // #1a1c1d  (ink)
  onSurfaceVariant: "rgb(66, 71, 81)", // #424751  (steel)
  // Border
  outlineVariant: "rgb(194, 198, 211)", // #c2c6d3
  // Fonts
  bodyFont: "Inter",
  headlineFont: "Manrope",
  // Forbidden warm orange/amber values (from old palette)
  forbidden: {
    emberOrange: "rgb(201, 111, 57)",   // #c96f39 — old ember
    warmInk: "rgb(23, 49, 55)",         // #173137 — old ink
    warmSand: "rgb(244, 239, 230)",     // #f4efe6 — old sand
  },
} as const;

function mockRoutes(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
  page.route("**/scenarios", (r) => r.fulfill({ json: [] }));
  page.route("**/config/translation", (r) =>
    r.fulfill({
      json: {
        active_provider: "llm",
        options: [],
        custom_css: { enabled: false, file_name: null, updated_at: null },
        source: ".env",
        restart_required: false,
      },
    })
  );
  page.route("**/config/custom-css", (r) =>
    r.fulfill({
      json: { enabled: false, file_name: null, updated_at: null, css_text: null },
    })
  );
  page.route("**/mcp/servers", (r) => r.fulfill({ json: { servers: [] } }));
}

test.beforeEach(async ({ page }) => {
  await mockRoutes(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("body uses imovation neutral background (not warm sand)", async ({ page }) => {
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );
  expect(bg).toBe(TOKENS.bgBody);
});

test("body uses Inter as base font (not Space Grotesk or Fraunces)", async ({ page }) => {
  const font = await page.evaluate(() =>
    getComputedStyle(document.body).fontFamily
  );
  expect(font.toLowerCase()).toContain(TOKENS.bodyFont.toLowerCase());
  expect(font.toLowerCase()).not.toContain("fraunces");
  expect(font.toLowerCase()).not.toContain("space grotesk");
});

test("headings use Manrope (font-headline)", async ({ page }) => {
  const h1 = page.locator("h1").first();
  await expect(h1).toBeVisible();
  const font = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font.toLowerCase()).toContain(TOKENS.headlineFont.toLowerCase());
  expect(font.toLowerCase()).not.toContain("fraunces");
});

test("ink text uses MD3 on-surface color (not warm dark teal)", async ({ page }) => {
  const el = page.locator(".text-ink").first();
  await expect(el).toBeVisible();
  const color = await el.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe(TOKENS.onSurface);
  expect(color).not.toBe(TOKENS.forbidden.warmInk);
});

test("steel text uses MD3 on-surface-variant (not warm teal-gray)", async ({ page }) => {
  const el = page.locator(".text-steel").first();
  await expect(el).toBeVisible();
  const color = await el.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe(TOKENS.onSurfaceVariant);
});

test("ember accent uses MD3 primary blue (not orange)", async ({ page }) => {
  const el = page.locator(".text-ember").first();
  await expect(el).toBeVisible();
  const color = await el.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe(TOKENS.primary);
  expect(color).not.toBe(TOKENS.forbidden.emberOrange);
});

test("primary blue background (bg-ember) renders correct blue (not dark teal)", async ({ page }) => {
  const el = page.locator(".bg-ember").first();
  await expect(el).toBeVisible();
  const bg = await el.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe(TOKENS.primary);
  expect(bg).not.toBe(TOKENS.forbidden.warmInk);
});

test("wizard light card uses neutral surface (not warm cream)", async ({ page }) => {
  const card = page.locator(".wizard-entry-card-light").first();
  await expect(card).toBeVisible();
  const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  // Should be neutral (#f4f3f5) not warm (#fff8ef / #f4efe6)
  expect(bg).toBe(TOKENS.surfaceContainerLow);
  expect(bg).not.toBe(TOKENS.forbidden.warmSand);
});

test("no warm orange/amber used anywhere on initial render", async ({ page }) => {
  const warmColors = await page.evaluate(() => {
    const warm = [
      "rgb(201, 111, 57)",  // old ember orange
      "rgb(217, 93, 57)",   // old ember alt
      "rgb(221, 170, 76)",  // old gold
    ];
    const issues: string[] = [];
    document.querySelectorAll("*").forEach((el) => {
      const s = getComputedStyle(el);
      for (const prop of ["color", "backgroundColor", "borderColor", "outlineColor"]) {
        const val = s.getPropertyValue(prop);
        if (warm.some((w) => val.includes(w))) {
          issues.push(`${el.tagName}.${el.className}: ${prop}=${val}`);
        }
      }
    });
    return issues.slice(0, 10); // cap report
  });
  expect(warmColors).toEqual([]);
});

test("inputs use neutral border and white background (not warm)", async ({ page }) => {
  const input = page.locator("input").first();
  if (await input.count() === 0) return;
  const border = await input.evaluate((el) => getComputedStyle(el).borderColor);
  const bg = await input.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(border).toBe(TOKENS.outlineVariant);
  expect(bg).toBe("rgb(255, 255, 255)");
});
