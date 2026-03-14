import { expect, test } from "@playwright/test";

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://127.0.0.1:8000";
const scenarioId = "persistent-mounted-scenario";

test("loaded scenario can generate an export package from the export screen", async ({ page, request }) => {
  test.setTimeout(180_000);

  const loadResponse = await request.post(`${BACKEND_URL}/scenarios/load`, {
    data: { scenario_id: scenarioId },
  });
  expect(loadResponse.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.locator(`select.wizard-scenario-select option[value="${scenarioId}"]`)).toHaveCount(1, { timeout: 30_000 });
  await page.locator("select.wizard-scenario-select").selectOption(scenarioId);
  await page.getByRole("button", { name: "Load scenario" }).click();

  await expect(page.getByRole("heading", { name: "Refinement workstation" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: /Export/ }).click();

  await expect(page.getByRole("heading", { name: "Structural translation and localized export" })).toBeVisible();

  const spanishChip = page.getByRole("button", { name: "Spanish" });
  if (!(await spanishChip.getAttribute("aria-pressed")) || (await spanishChip.getAttribute("aria-pressed")) === "false") {
    await spanishChip.click();
  }

  await page.getByRole("button", { name: "Generate localized archive" }).click();

  await expect(page.getByText("Failed to fetch")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download ZIP archive" })).toBeVisible({ timeout: 180_000 });
});