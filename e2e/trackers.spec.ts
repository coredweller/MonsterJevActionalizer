/** T066: the tracker sidebar duplicates and deletes trackers, and becomes a drawer below the xl breakpoint. */
import { expect, test, type Page } from "@playwright/test";
import { STORAGE_KEY } from "@/app/useTrackers";
import { StoreSchema } from "@/lib/encounter/storage";
import { MAESTRO, loadMonster, stored } from "./helpers";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Trackers" });

/** A tracker's select button in the sidebar. Its name is the tracker name followed by its HP and round. */
const row = (page: Page, name: string) => sidebar(page).getByRole("button", { name: new RegExp(`^${name}\\s*HP`) });

/** The sidebar button that opens the collapsed trackers list. Its name ends in the count, e.g. "Show all (2)". */
const showAll = (page: Page) => sidebar(page).getByRole("button", { name: /^Show all/ });

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

  await showAll(page).click();
  await row(page, "Maestro Drazzuk").click();
  await expect(page.getByRole("heading", { name: "Maestro Drazzuk", exact: true })).toBeVisible();
  await expect(row(page, "Maestro Drazzuk")).toHaveAttribute("aria-current", "true");
  await expect(page.getByLabel("HP", { exact: true })).toHaveValue("100");
  await expect(page.getByText("Round 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Level 3: restore one" })).toBeEnabled();
});

test("with a tracker selected the others are collapsed until the DM shows them all", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  // A single tracker needs no toggle.
  await expect(showAll(page)).toHaveCount(0);

  await sidebar(page).getByRole("button", { name: "Duplicate Maestro Drazzuk" }).click();
  await expect(row(page, "Maestro Drazzuk 2")).toHaveAttribute("aria-current", "true");
  await expect(row(page, "Maestro Drazzuk")).toHaveCount(0);
  await expect(showAll(page)).toHaveText("Show all (2)");
  await expect(showAll(page)).toHaveAttribute("aria-expanded", "false");

  await showAll(page).click();
  await expect(row(page, "Maestro Drazzuk")).toBeVisible();
  const hide = sidebar(page).getByRole("button", { name: "Show selected only" });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await hide.click();
  await expect(row(page, "Maestro Drazzuk")).toHaveCount(0);

  // Picking another monster collapses the list onto it.
  await showAll(page).click();
  await row(page, "Maestro Drazzuk").click();
  await expect(row(page, "Maestro Drazzuk")).toHaveAttribute("aria-current", "true");
  await expect(row(page, "Maestro Drazzuk 2")).toHaveCount(0);
});

test("deleting a tracker asks first: cancelling keeps it, confirming removes it", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  await sidebar(page).getByRole("button", { name: "Duplicate Maestro Drazzuk" }).click();
  await expect.poll(() => savedNames(page)).toEqual(["Maestro Drazzuk", "Maestro Drazzuk 2"]);
  await showAll(page).click();

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

test("the party is edited in the sidebar; players this turn and the battlefield are their own panels", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  const party = sidebar(page).getByRole("region", { name: "Party" });

  // A new player opens for editing; Done closes it to a one-line summary with an Edit button.
  await party.getByRole("button", { name: "Add player" }).click();
  await party.getByLabel("Name").fill("Ann");
  await party.getByLabel("Class").fill("Fighter");
  await party.getByRole("button", { name: "Done" }).click();
  await expect(party.getByLabel("Name")).toBeHidden();
  await expect(party.getByText("Melee · Fighter")).toBeVisible();

  await party.getByRole("button", { name: "Edit Ann" }).click();
  await party.getByLabel("AC").fill("18");
  await party.getByRole("button", { name: "Done" }).click();
  await expect(party.getByText("Melee · Fighter · AC 18")).toBeVisible();

  const players = page.getByRole("region", { name: "Players this turn" });
  await expect(players.getByText("Ann")).toBeVisible();
  await expect(players.getByRole("combobox", { name: "HP", exact: true })).toBeVisible();
  await expect(players.getByRole("combobox", { name: "Cover", exact: true })).toBeVisible();
  await expect(players.getByRole("checkbox", { name: "Hit you" })).toBeVisible();

  // Zone is a one-tap strip.
  const zone = players.getByRole("group", { name: "Zone" });
  await zone.getByRole("button", { name: "Near" }).click();
  await expect(zone.getByRole("button", { name: "Near" })).toHaveAttribute("aria-pressed", "true");
  await expect(zone.getByRole("button", { name: "Engaged" })).toHaveAttribute("aria-pressed", "false");

  // A picked condition becomes a chip and leaves the dropdown, which goes back to "Pick one"; tapping the chip removes it.
  const conditions = players.getByRole("combobox", { name: "Conditions" });
  await conditions.selectOption("prone");
  await expect(conditions).toHaveValue("");
  await expect(conditions.getByRole("option", { name: "Prone" })).toHaveCount(0);
  // The dropdown stays narrow and the chip sits beside it, inside the player's box.
  const row = players.getByRole("article", { name: "Ann" });
  const [selectBox, chipBox, rowBox] = await Promise.all([
    conditions.boundingBox(),
    players.getByRole("button", { name: "Remove Prone" }).boundingBox(),
    row.boundingBox(),
  ]);
  if (!selectBox || !chipBox || !rowBox) throw new Error("conditions layout: an element has no box");
  expect(selectBox.width).toBeLessThan(100);
  expect(chipBox.x).toBeGreaterThan(selectBox.x + selectBox.width);
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
  expect(chipBox.width).toBeGreaterThan(40);
  await players.getByRole("button", { name: "Remove Prone" }).click();
  await expect(players.getByRole("button", { name: "Remove Prone" })).toHaveCount(0);
  await expect(conditions.getByRole("option", { name: "Prone" })).toHaveCount(1);

  // Collapsing keeps line 1 and hides the rest.
  const toggle = players.getByRole("button", { name: /^Ann/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(zone).toBeHidden();
  await expect(players.getByRole("combobox", { name: "HP", exact: true })).toBeVisible();
  await expect(toggle).toContainText("Near");
  await toggle.click();

  const battlefield = page.getByRole("region", { name: "Battlefield" });
  await expect(battlefield.getByLabel("Allies present")).toBeVisible();
  await expect(battlefield.getByRole("button", { name: "Recommend" })).toBeVisible();

  // A bad number in a player row still blocks Recommend, though the row sits in another panel.
  await players.getByLabel("Exact ft.").fill("x");
  await battlefield.getByRole("button", { name: "Recommend" }).click();
  await expect(page.getByText("Recommending…")).toHaveCount(0);
});

test("at desktop width the sidebar is a column and the drawer button is hidden", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  await expect(page.getByRole("button", { name: "Trackers", exact: true })).toBeHidden();
  await expect(row(page, "Maestro Drazzuk")).toBeVisible();
});
