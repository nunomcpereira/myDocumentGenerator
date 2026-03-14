import { expect, test } from "@playwright/test";

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://127.0.0.1:8000";
const scenarioId = "persistent-mounted-scenario";

async function ensureScenarioUsesFetch(request: Parameters<typeof test>[0]["request"]) {
  const loadResponse = await request.post(`${BACKEND_URL}/scenarios/load`, {
    data: { scenario_id: scenarioId },
  });
  expect(loadResponse.ok()).toBeTruthy();
  const loadedScenario = await loadResponse.json();

  const saveResponse = await request.post(`${BACKEND_URL}/scenarios/save`, {
    data: {
      session_id: loadedScenario.session_id,
      scenario_id: scenarioId,
      prompt: loadedScenario.prompt ?? "",
      mcp_servers: ["fetch"],
      target_languages: loadedScenario.target_languages ?? [],
      output_file_name: loadedScenario.output_file_name ?? "persisted-runtime-spec",
    },
  });
  expect(saveResponse.ok()).toBeTruthy();
}

test("loaded scenario with fetch MCP can refine from jn.pt content", async ({ page, request }) => {
  test.setTimeout(180_000);

  await ensureScenarioUsesFetch(request);

  await page.goto("/");
  await expect(page.locator(`select.wizard-scenario-select option[value="${scenarioId}"]`)).toHaveCount(1, { timeout: 30_000 });
  await page.locator("select.wizard-scenario-select").selectOption(scenarioId);
  await page.getByRole("button", { name: "Load scenario" }).click();

  await expect(page.getByRole("heading", { name: "Refinement workstation" })).toBeVisible();

  await page.getByPlaceholder("Add project details, constraints, user roles, edge cases, or ask the analyst to focus on a section.").fill(
    "Use the fetch MCP server to load current data from https://www.jn.pt and incorporate relevant facts into the draft. Include the source URL www.jn.pt in the refined document.",
  );
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator(".markdown-preview")).toContainText("www.jn.pt", { timeout: 120_000 });
});