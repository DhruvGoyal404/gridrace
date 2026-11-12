import { CLASSIC, expect, expectAccessible, test } from "./fixtures";

const cell = (r: number, c: number) => `Row ${r}, column ${c}`;

test("play by keyboard: enter, notes, undo, redo, mistakes", async ({ page, errors }) => {
  void errors;
  await page.goto(`/play?p=${CLASSIC}`);
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  await page.getByRole("gridcell", { name: cell(1, 3) }).click();
  await page.keyboard.press("1"); // wrong: the solution has 4 here
  await expect(page.getByRole("gridcell", { name: `${cell(1, 3)}, 1` })).toBeVisible();
  await page.getByRole("button", { name: /Show mistakes/ }).click();
  await expect(page.getByRole("gridcell", { name: `${cell(1, 3)}, 1` }).locator("span")).toHaveClass(/text-danger/);
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("gridcell", { name: `${cell(1, 3)}, empty` })).toBeVisible();
  await page.keyboard.press("Control+y");
  await expect(page.getByRole("gridcell", { name: `${cell(1, 3)}, 1` })).toBeVisible();
  await page.getByRole("gridcell", { name: cell(1, 3) }).click();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("gridcell", { name: `${cell(1, 3)}, empty` })).toBeVisible();
  await page.keyboard.press("n");
  await page.keyboard.press("2");
  await page.keyboard.press("4");
  await expect(page.getByRole("gridcell", { name: `${cell(1, 3)}, empty, notes 2 4` })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("gridcell", { name: cell(1, 4) })).toBeFocused();
  await expectAccessible(page);
});

test("the hint ladder reveals step by step, then solves the puzzle", async ({ page, errors }) => {
  void errors;
  await page.goto(`/play?p=${CLASSIC}`);
  const hint = page.getByRole("button", { name: /^(Give me a hint|Show where to look|Show why|Apply this move)$/ });
  await hint.click();
  await expect(page.getByText(/^The next digit comes from a /)).toBeVisible();
  await hint.click();
  await expect(page.getByText(/^Look at /)).toBeVisible();
  await hint.click();
  await expect(page.getByText(/^Place \d in r\dc\d\.$/)).toBeVisible();
  await expectAccessible(page);
  // Apply hints until the board is complete: 51 placements for this puzzle.
  for (let i = 0; i < 51 * 4 && !(await page.getByText(/^Solved in/).isVisible()); i++) {
    await hint.click();
  }
  await expect(page.getByText(/^Solved in/)).toBeVisible();
});

test("a new game of a chosen tier, and the bench page", async ({ page, errors }) => {
  void errors;
  await page.goto("/play");
  await expect(page.getByRole("grid")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: "Expert", exact: true }).check();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText(/^Expert, seed \d+/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Bench" }).click();
  await expect(page.getByRole("button", { name: "Run the bench" })).toBeEnabled();
  await expect(page.getByText(/670 puzzles in 8 sets/)).toBeVisible();
  await expectAccessible(page);
});
