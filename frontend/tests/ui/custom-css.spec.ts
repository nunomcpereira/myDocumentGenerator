import { expect, test } from "@playwright/test";

test("custom css upload and clear updates the UI", async ({ page }) => {
  let cssText: string | null = null;
  let fileName: string | null = null;
  let updatedAt: string | null = null;

  const translationConfigurationPayload = () => ({
    active_provider: "llm",
    options: [
      {
        id: "llm",
        label: "Current LLM",
        description: "Uses the existing JSON-based translation prompt against the configured chat model.",
        configured: true,
        required_env: ["TRANSLATION_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"],
      },
      {
        id: "azure",
        label: "Azure Translator",
        description: "Calls the Azure AI Translator Text API directly for section title and body translation.",
        configured: false,
        required_env: ["TRANSLATION_PROVIDER", "AZURE_TRANSLATOR_ENDPOINT", "AZURE_TRANSLATOR_KEY", "AZURE_TRANSLATOR_REGION"],
      },
      {
        id: "google",
        label: "Google Translate",
        description: "Calls the Google Cloud Translation REST API directly for section title and body translation.",
        configured: false,
        required_env: ["TRANSLATION_PROVIDER", "GOOGLE_TRANSLATE_API_KEY"],
      },
    ],
    custom_css: {
      enabled: Boolean(cssText),
      file_name: fileName,
      updated_at: updatedAt,
    },
    source: ".env",
    restart_required: true,
  });

  await page.route("**/scenarios", async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route("**/config/translation", async (route) => {
    await route.fulfill({ json: translationConfigurationPayload() });
  });

  await page.route("**/config/custom-css", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        json: {
          enabled: Boolean(cssText),
          file_name: fileName,
          updated_at: updatedAt,
          css_text: cssText,
        },
      });
      return;
    }

    if (method === "POST") {
      fileName = "theme.css";
      cssText = '[data-testid="app-shell"] { outline: 6px solid rgb(9, 17, 34) !important; }';
      updatedAt = new Date("2026-03-14T10:00:00Z").toISOString();
      await route.fulfill({ json: translationConfigurationPayload() });
      return;
    }

    if (method === "DELETE") {
      fileName = null;
      cssText = null;
      updatedAt = null;
      await route.fulfill({ json: translationConfigurationPayload() });
      return;
    }

    await route.fallback();
  });

  await page.goto("/");

  const appShell = page.getByTestId("app-shell");
  await expect(appShell).toHaveCSS("outline-style", "none");

  await page.getByRole("button", { name: "Configuration" }).click();
  await expect(page.getByRole("heading", { name: "Configure translation and UI theming" })).toBeVisible();

  await page.locator('input[type="file"][accept=".css,text/css"]').setInputFiles({
    name: "theme.css",
    mimeType: "text/css",
    buffer: Buffer.from('[data-testid="app-shell"] { outline: 6px solid rgb(9, 17, 34) !important; }'),
  });

  await expect(page.getByText("Active stylesheet: theme.css")).toBeVisible();
  await expect(appShell).toHaveCSS("outline-style", "solid");
  await expect(appShell).toHaveCSS("outline-color", "rgb(9, 17, 34)");

  await page.getByRole("button", { name: "Clear custom CSS" }).click();

  await expect(page.getByText("No custom CSS uploaded")).toBeVisible();
  await expect(appShell).toHaveCSS("outline-style", "none");
});