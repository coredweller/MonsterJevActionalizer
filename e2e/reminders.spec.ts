/** T070: reminder cards show for the selected tracker from round 1, follow its state, and are read-only. */
import { expect, test, type Page } from "@playwright/test";
import { STORAGE_KEY } from "@/app/useTrackers";
import { BRIARTHORN, TUNNEL_WASP, loadMonster, stored } from "./helpers";

const reminders = (page: Page) => page.getByRole("region", { name: "Reminders" });

/** Thornward Hex isn't in the SRD spell table, so Confirm stays disabled until the DM gives it a level. */
async function levelThornwardHex(page: Page) {
  await page.getByRole("listitem").filter({ hasText: "Thornward Hex" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel(/^Spell level/).fill("2");
}

test("a legendary monster's reminders show from round 1, follow the legendary counter, and survive a reload", async ({ page }) => {
  await loadMonster(page, BRIARTHORN, "Briarthorn Hag", levelThornwardHex);
  const card = reminders(page);

  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "Legendary actions" })).toBeVisible();
  await expect(card.getByText("3 / 3 left", { exact: true })).toBeVisible();
  await expect(card.getByText("Lash", { exact: true })).toBeVisible();
  await expect(card.getByText("Grasping Roots", { exact: true })).toBeVisible();
  await expect(card.getByRole("heading", { name: "Reactions" })).toBeVisible();
  await expect(card.getByText("Bramble Shield", { exact: true })).toBeVisible();
  await expect(card.getByRole("button")).toHaveCount(0);

  await page.getByRole("button", { name: "Legendary actions: use one" }).click();
  await expect(card.getByText("2 / 3 left", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start turn" }).click();
  await expect(card.getByText("3 / 3 left", { exact: true })).toBeVisible();
  // Saving runs in an effect after each edit; wait for the new round to land before reloading.
  await expect.poll(() => stored(page, STORAGE_KEY)).toContain('"round":2');

  await page.reload();
  await expect(page.getByRole("heading", { name: "Briarthorn Hag" })).toBeVisible();
  await expect(reminders(page)).toBeVisible();
  await expect(reminders(page).getByText("3 / 3 left", { exact: true })).toBeVisible();
});

test("a general monster with no reactions has no reminders", async ({ page }) => {
  await loadMonster(page, TUNNEL_WASP, "Tunnel Wasp");
  await expect(reminders(page)).toHaveCount(0);
});
