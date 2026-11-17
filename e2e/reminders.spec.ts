/**
 * T070: the reminders (legendary actions, reactions, lair actions) are part of the tracker's statblock
 * from round 1, and the legendary-actions counter sits in its Legendary Actions section.
 */
import { expect, test, type Page } from "@playwright/test";
import { STORAGE_KEY } from "@/app/useTrackers";
import { BRIARTHORN, TUNNEL_WASP, loadMonster, stored } from "./helpers";

const statblock = (page: Page, name: string) => page.getByRole("article", { name: `${name} statblock` });
/** A statblock section, found by its heading. */
const section = (page: Page, name: string, heading: string) =>
  statblock(page, name).locator("section", { has: page.getByRole("heading", { name: heading, exact: true }) });

/** Thornward Hex isn't in the SRD spell table, so Confirm stays disabled until the DM gives it a level. */
async function levelThornwardHex(page: Page) {
  await page.getByRole("listitem").filter({ hasText: "Thornward Hex" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel(/^Spell level/).fill("2");
}

test("a legendary monster's statblock shows its reminders from round 1, with a legendary counter that survives a reload", async ({ page }) => {
  await loadMonster(page, BRIARTHORN, "Briarthorn Hag", levelThornwardHex);
  const legendary = section(page, "Briarthorn Hag", "Legendary Actions");
  const reactions = section(page, "Briarthorn Hag", "Reactions");

  await expect(legendary).toBeVisible();
  await expect(legendary.getByText("3 / 3", { exact: true })).toBeVisible();
  await expect(legendary.getByText("Lash.", { exact: true })).toBeVisible();
  await expect(legendary.getByText("Grasping Roots.", { exact: true })).toBeVisible();
  await expect(reactions).toBeVisible();
  await expect(reactions.getByText("Bramble Shield.", { exact: true })).toBeVisible();

  await legendary.getByRole("button", { name: "Legendary actions: use one" }).click();
  await expect(legendary.getByText("2 / 3", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start turn" }).click();
  await expect(legendary.getByText("3 / 3", { exact: true })).toBeVisible();
  // Saving runs in an effect after each edit; wait for the new round to land before reloading.
  await expect.poll(() => stored(page, STORAGE_KEY)).toContain('"round":2');

  await page.reload();
  await expect(page.getByRole("heading", { name: "Briarthorn Hag" })).toBeVisible();
  await expect(legendary.getByText("3 / 3", { exact: true })).toBeVisible();
});

test("a general monster with no reactions has no reminder sections", async ({ page }) => {
  await loadMonster(page, TUNNEL_WASP, "Tunnel Wasp");
  await expect(statblock(page, "Tunnel Wasp")).toBeVisible();
  for (const heading of ["Reactions", "Legendary Actions", "Lair Actions"]) {
    await expect(section(page, "Tunnel Wasp", heading)).toHaveCount(0);
  }
});
