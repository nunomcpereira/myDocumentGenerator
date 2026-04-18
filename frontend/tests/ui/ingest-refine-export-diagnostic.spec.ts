import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://127.0.0.1:8000";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal valid docx (from an existing upload in the project)
const SAMPLE_TEMPLATE = path.resolve(
  __dirname,
  "../../../backend/data/uploads/c66547af-2d58-474d-b35b-7d361e116af0/sample_template.docx",
);

test("backend health check", async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/health`);
  console.log("health status:", res.status());
  console.log("health body:", await res.text());
  expect(res.ok()).toBeTruthy();
});

test("ingest → refine → export full flow", async ({ page, request }) => {
  test.setTimeout(180_000);

  // Capture all API responses so we can see real error details
  const apiErrors: { url: string; status: number; body: string }[] = [];
  page.on("response", async (response) => {
    if (response.url().includes(BACKEND_URL) && !response.ok()) {
      const body = await response.text().catch(() => "(unreadable)");
      apiErrors.push({ url: response.url(), status: response.status(), body });
    }
  });

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // ── 1. Backend health ──────────────────────────────────────────────────────
  const health = await request.get(`${BACKEND_URL}/health`);
  console.log("health:", health.status(), await health.text());
  expect(health.ok(), "Backend must be reachable").toBeTruthy();

  // ── 2. Navigate → start from scratch ──────────────────────────────────────
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/01-wizard.png" });

  const scratchBtn = page.getByRole("button", { name: /start from scratch/i });
  await expect(scratchBtn).toBeVisible({ timeout: 15_000 });
  await scratchBtn.click();

  // ── 3. Ingest screen — upload template ─────────────────────────────────────
  await page.screenshot({ path: "test-results/02-ingest.png" });

  if (!fs.existsSync(SAMPLE_TEMPLATE)) {
    throw new Error(`Sample template not found at ${SAMPLE_TEMPLATE} — update the path`);
  }

  const templateInput = page.locator('input[type="file"]').first();
  await templateInput.setInputFiles(SAMPLE_TEMPLATE);

  await page.screenshot({ path: "test-results/03-file-selected.png" });

  // Intercept the ingest response for detailed error logging
  const [ingestResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/ingest"), { timeout: 60_000 }),
    page.getByRole("button", { name: /initialize session/i }).click(),
  ]);

  console.log("ingest status:", ingestResponse.status());
  const ingestBody = await ingestResponse.text().catch(() => "(unreadable)");
  console.log("ingest body:", ingestBody.slice(0, 2000));

  await page.screenshot({ path: "test-results/04-after-ingest.png" });

  if (!ingestResponse.ok()) {
    throw new Error(`Ingest failed ${ingestResponse.status()}: ${ingestBody}`);
  }

  // ── 4. Refinement screen ───────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /refinement workstation/i })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/05-refinement.png" });

  // Send a simple chat message
  const chatInput = page.getByPlaceholder(/provide the instructions/i);
  await chatInput.fill("Set the project scope to: smoke test document for CI validation.");

  const [chatResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/chat"), { timeout: 60_000 }),
    page.getByRole("button", { name: /send/i }).click(),
  ]);

  console.log("chat status:", chatResponse.status());
  const chatBody = await chatResponse.text().catch(() => "(unreadable)");
  console.log("chat body (truncated):", chatBody.slice(0, 500));

  await page.screenshot({ path: "test-results/06-after-chat.png" });

  if (!chatResponse.ok()) {
    throw new Error(`Chat failed ${chatResponse.status()}: ${chatBody}`);
  }

  // ── 5. Navigate to export ──────────────────────────────────────────────────
  await page.getByRole("link", { name: /export/i }).click();
  await expect(page.getByRole("heading", { name: /structural translation/i })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/07-export-screen.png" });

  // Ensure at least "English" is selected
  const englishChip = page.getByRole("button", { name: "English" });
  if ((await englishChip.getAttribute("aria-pressed")) !== "true") {
    await englishChip.click();
  }
  // Deselect Spanish and French to keep the test fast
  for (const lang of ["Spanish", "French", "German", "Portuguese"]) {
    const chip = page.getByRole("button", { name: lang });
    if (await chip.isVisible()) {
      if ((await chip.getAttribute("aria-pressed")) === "true") {
        await chip.click();
      }
    }
  }

  const [exportResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/export"), { timeout: 120_000 }),
    page.getByRole("button", { name: /generate localized archive/i }).click(),
  ]);

  console.log("export status:", exportResponse.status());
  const exportBody = await exportResponse.text().catch(() => "(unreadable)");
  console.log("export body (truncated):", exportBody.slice(0, 1000));

  await page.screenshot({ path: "test-results/08-after-export.png" });

  if (!exportResponse.ok()) {
    throw new Error(`Export failed ${exportResponse.status()}: ${exportBody}`);
  }

  // ── 6. Verify download link visible ───────────────────────────────────────
  await expect(page.getByRole("link", { name: /download zip archive/i })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "test-results/09-export-done.png" });

  // Final diagnostic dump
  if (apiErrors.length > 0) {
    console.warn("API errors captured during test:", JSON.stringify(apiErrors, null, 2));
  }
  if (consoleErrors.length > 0) {
    console.warn("Browser console errors:", consoleErrors.join("\n"));
  }
});
