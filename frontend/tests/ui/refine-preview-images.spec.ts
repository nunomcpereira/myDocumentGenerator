import { expect, test } from "@playwright/test";
import path from "node:path";

const templatePath = path.resolve(__dirname, "../../../backend/tests/fixtures/docx/sample_template.docx");
const enhancementPath = path.resolve(__dirname, "../../../backend/tests/fixtures/docx/sample_enhancement_with_image.docx");

test("refine preview renders images imported from an enhancement document", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/");
  await page.getByRole("button", { name: "Start from scratch" }).click();
  await expect(page.getByRole("heading", { name: "Initialize ingestion and local retrieval context" })).toBeVisible();

  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles(templatePath);
  await fileInputs.nth(1).setInputFiles(enhancementPath);

  await page.getByRole("button", { name: "Initialize session" }).click();

  await expect(page.getByRole("heading", { name: "Refinement workstation" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "HTML" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".markdown-preview img")).toHaveCount(1, { timeout: 30_000 });

  await page.getByRole("button", { name: "Markdown" }).click();
  await expect(page.locator("pre")).toContainText("/sessions/");
  await expect(page.locator("pre")).toContainText("enhancement_image");
});