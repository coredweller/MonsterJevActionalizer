/** T066: the tracker sidebar duplicates and deletes trackers, and becomes a drawer below the xl breakpoint. */
import { expect, test, type Page } from "@playwright/test";
import { STORAGE_KEY } from "@/app/useTrackers";
import { StoreSchema } from "@/lib/encounter/storage";
import { MAESTRO, loadMonster, stored } from "./helpers";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Trackers" });

/** A tracker's select button in the sidebar. Its name is the tracker name followed by its HP and round. */
const row = (page: Page, name: string) => sidebar(page).getByRole("button", { name: new RegExp(`^${name}\\s*HP`) });

async function savedNames(page: Page): Promise<string[]> {
  const text = await stored(page, STORAGE_KEY);
  if (text === null) throw new Error("savedNames: nothing saved yet");
  return StoreSchema.parse(JSON.parse(text)).trackers.map((t) => t.name);
}

test("duplicating a damaged tracker gives a fresh, selected copy and leaves the original alone", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  await page.getByLabel("HP", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Level 3: use one" }).click();
  await page.getByRole("button", { name: "Start turn" }).click();
  await expect(row(page, "Maestro Drazzuk")).toContainText("HP 100/136 · Round 2");

  await sidebar(page).getByRole("button", { name: "Duplicate Maestro Drazzuk" }).click();

  await expect(page.getByRole("heading", { name: "Maestro Drazzuk 2", exact: true })).toBeVisible();
  await expect(row(page, "Maestro Drazzuk 2")).toHaveAttribute("aria-current", "true");
  await expect(row(page, "Maestro Drazzuk 2")).toContainText("HP 136/136 · Round 1");
  await expect(page.getByLabel("HP", { exact: true })).toHaveValue("136");
  await expect(page.getByText("Round 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Level 3: restore one" })).toBeDisabled();
  await expect.poll(() => savedNames(page)).toEqual(["Maestro Drazzuk", "Maestro Drazzuk 2"]);

  await row(page, "Maestro Drazzuk").click();
  await expect(page.getByRole("heading", { name: "Maestro Drazzuk", exact: true })).toBeVisible();
  await expect(row(page, "Maestro Drazzuk")).toHaveAttribute("aria-current", "true");
  await expect(page.getByLabel("HP", { exact: true })).toHaveValue("100");
  await expect(page.getByText("Round 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Level 3: restore one" })).toBeEnabled();
});

test("deleting a tracker asks first: cancelling keeps it, confirming removes it", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  await sidebar(page).getByRole("button", { name: "Duplicate Maestro Drazzuk" }).click();
  await expect.poll(() => savedNames(page)).toEqual(["Maestro Drazzuk", "Maestro Drazzuk 2"]);

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Delete Maestro Drazzuk?");
    void dialog.dismiss();
  });
  await sidebar(page).getByRole("button", { name: "Delete Maestro Drazzuk", exact: true }).click();
  await expect(row(page, "Maestro Drazzuk")).toBeVisible();
  expect(await savedNames(page)).toEqual(["Maestro Drazzuk", "Maestro Drazzuk 2"]);

  page.once("dialog", (dialog) => void dialog.accept());
  await sidebar(page).getByRole("button", { name: "Delete Maestro Drazzuk", exact: true }).click();
  await expect(row(page, "Maestro Drazzuk")).toHaveCount(0);
  await expect(row(page, "Maestro Drazzuk 2")).toBeVisible();
  await expect.poll(() => savedNames(page)).toEqual(["Maestro Drazzuk 2"]);
});

test.describe("at tablet width", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("the sidebar is a drawer opened from the header", async ({ page }) => {
    await loadMonster(page, MAESTRO, "Maestro Drazzuk");
    const toggle = page.getByRole("button", { name: "Trackers", exact: true });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(row(page, "Maestro Drazzuk")).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(row(page, "Maestro Drazzuk")).toBeVisible();
    await row(page, "Maestro Drazzuk").click();
    await expect(row(page, "Maestro Drazzuk")).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(row(page, "Maestro Drazzuk")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(row(page, "Maestro Drazzuk")).toBeHidden();

    await toggle.click();
    await sidebar(page).getByRole("button", { name: "Close trackers" }).click();
    await expect(row(page, "Maestro Drazzuk")).toBeHidden();

    await toggle.click();
    await expect(row(page, "Maestro Drazzuk")).toBeVisible();
    // The backdrop covers the page to the right of the drawer.
    await page.mouse.click(900, 400);
    await expect(row(page, "Maestro Drazzuk")).toBeHidden();

    for (const width of [1024, 768]) {
      await page.setViewportSize({ width, height: 768 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal scroll at ${width}px`).toBe(true);
    }
  });
});

test("at desktop width the sidebar is a column and the drawer button is hidden", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  await expect(page.getByRole("button", { name: "Trackers", exact: true })).toBeHidden();
  await expect(row(page, "Maestro Drazzuk")).toBeVisible();
});
