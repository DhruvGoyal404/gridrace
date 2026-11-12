import { CLASSIC, expect, expectAccessible, test } from "./fixtures";

test("the landing race runs all four solvers and is accessible", async ({ page, errors }) => {
  void errors;
  await page.goto("/");
  await expect(page.getByText("All arrived")).toBeVisible({ timeout: 60_000 });
  for (const code of ["BRT", "BIT", "MRV", "DLX"]) {
    await expect(page.getByRole("radio", { name: new RegExp(code) })).toContainText("Arrived");
  }
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByRole("heading", { name: "From brute force to Dancing Links" })).toBeVisible();
  await expectAccessible(page);
});

test("the replay steps through a solver's trace", async ({ page, errors }) => {
  void errors;
  await page.goto("/");
  await expect(page.getByText("All arrived")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("radio", { name: /BRT/ }).click();
  await page.getByRole("button", { name: "Pause replay" }).click();
  const status = page.getByText(/^BRT event/);
  const before = Number((await status.textContent())!.match(/event ([\d,]+)/)![1]!.replace(/,/g, ""));
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect(status).toContainText(`event ${(before + 1).toLocaleString("en-US")} of`);
  await page.getByRole("button", { name: "Step back" }).click();
  await expect(status).toContainText(`event ${before.toLocaleString("en-US")} of`);
});

test("generating a tier races a new puzzle of that tier", async ({ page, errors }) => {
  void errors;
  await page.goto("/");
  await page.getByRole("radio", { name: "Hard", exact: true }).check();
  await page.getByRole("button", { name: "New puzzle" }).click();
  await expect(page.getByText(/^Hard, needs/)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/tier=hard/);
  await expect(page.getByText("All arrived")).toBeVisible({ timeout: 60_000 });
});

test("pasting explains bad puzzles and races a good one", async ({ page, errors }) => {
  void errors;
  await page.goto("/");
  await page.getByRole("button", { name: "Paste puzzle" }).click();
  const box = page.getByRole("textbox");
  const status = page.getByRole("dialog").getByRole("status");
  await box.fill("12x");
  await expect(status).toHaveText("Character 'x' at position 3 is not a digit, '0' or '.'.");
  await box.fill(".".repeat(81));
  await expect(status).toContainText("More than one solution");
  await box.fill("55" + ".".repeat(79));
  await expect(status).toContainText("r1c1 and r1c2 both hold 5");
  await box.fill(CLASSIC);
  await expect(status).toContainText("One solution. 30 givens, graded Easy");
  await page.getByRole("button", { name: "Load puzzle" }).click();
  await expect(page.getByText(/^Easy, needs /)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`p=${CLASSIC.replace(/\./g, "\\.")}`));
});
