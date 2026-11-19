/**
 * T063: the encounter survives a reload, and an unreadable save starts the app empty with a warning.
 * T069: the settings (always shown above the statblock) save, survive a reload, and manual recharge skips the roll.
 * One turn per round: an applied round disables Recommend and offers Start turn beside it, and Undo takes the turn back.
 */
import { expect, test, type Page } from "@playwright/test";
import { CORRUPT_KEY, STORAGE_KEY } from "@/app/useTrackers";
import { apply, blankSituation, defaultPlayerTurn, suggestTemperament } from "@/lib/encounter/state";
import { StoreSchema, serialize } from "@/lib/encounter/storage";
import { MAESTRO, loadMonster, stored } from "./helpers";

async function savedStore(page: Page) {
  const text = await stored(page, STORAGE_KEY);
  if (text === null) throw new Error("savedStore: nothing saved yet");
  return StoreSchema.parse(JSON.parse(text));
}

/**
 * Gives the saved tracker one player and one applied turn (Discordant Strike, so its recharge is
 * spent), through the real `apply`, then reloads. Skips the decide request, which needs Jev.
 */
async function addAppliedTurn(page: Page) {
  const store = await savedStore(page);
  const [tracker] = store.trackers;
  if (!tracker) throw new Error("addAppliedTurn: no tracker saved");
  const situation = { ...blankSituation(), players: [defaultPlayerTurn("p1")] };
  const played = apply(
    { ...tracker, roster: [{ id: "p1", name: "Ann", role: "melee", class: "Fighter" }], situation },
    {
      moveBefore: "closeIn",
      action: { key: "act_discordant_strike", name: "Discordant Strike", abilityId: "act_discordant_strike", targetIds: ["p1"] },
      bonusAction: null,
      moveAfter: "hold",
      situation,
      recommended: true,
    },
  );
  const saved = serialize({ ...store, trackers: [played] });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, saved] as const);
  await page.reload();
}

test("encounter edits and turn results survive a reload", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  await addAppliedTurn(page);
  await expect(page.getByText("Discordant Strike → Ann")).toBeVisible();

  // Round 1's turn is applied, so the Battlefield panel disables Recommend and offers Start turn beside it.
  const battlefield = page.getByRole("region", { name: "Battlefield" });
  await expect(page.getByText("Round 1's turn is applied. Record its result in the turn log.")).toBeVisible();
  await expect(battlefield.getByRole("button", { name: "Recommend" })).toBeDisabled();
  const appliedTip = battlefield.getByRole("tooltip");
  await expect(appliedTip).toBeHidden();
  // Forced: the disabled button lets the pointer through to its wrapper, which shows the tip.
  await battlefield.getByRole("button", { name: "Recommend" }).hover({ force: true });
  await expect(appliedTip).toHaveText("Round 1's turn is applied. Start turn to move on, or undo it in the turn log.");
  await battlefield.getByRole("button", { name: "Start turn" }).click();
  await expect(page.getByText("Discordant Strike: rolled")).toBeVisible();
  await expect(battlefield.getByRole("button", { name: "Recommend" })).toBeEnabled();
  await expect(battlefield.getByRole("button", { name: "Start turn" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Undo/ })).toHaveCount(0);
  await page.getByLabel("HP", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Level 3: use one" }).click();
  await page.getByRole("button", { name: "Hit", exact: true }).click();
  await page.getByLabel("Note", { exact: true }).fill("Shield went up");
  // Saving runs in an effect after each edit; wait for the last one to land before reloading.
  await expect.poll(() => stored(page, STORAGE_KEY)).toContain("Shield went up");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Maestro Drazzuk" })).toBeVisible();
  await expect(page.getByText("Round 2", { exact: true })).toBeVisible();
  await expect(page.getByLabel("HP", { exact: true })).toHaveValue("100");
  await expect(page.getByText("2 / 3", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Hit", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Shield went up");
});

test("Undo takes back this round's applied turn and its recharge, and Recommend comes back", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  await addAppliedTurn(page);
  await expect(page.getByRole("button", { name: "Spent", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo round 1's turn" }).click();
  await expect(page.getByText("Discordant Strike → Ann")).toHaveCount(0);
  await expect(page.getByText("No turns yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Available", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Battlefield" }).getByRole("button", { name: "Recommend" })).toBeEnabled();
  await expect.poll(async () => (await savedStore(page)).trackers[0]?.log).toEqual([]);
});

test("settings are saved, survive a reload, and manual recharge skips the roll", async ({ page }) => {
  await loadMonster(page, MAESTRO, "Maestro Drazzuk");
  const int = (await savedStore(page)).trackers[0]?.reviewed.intScore;
  if (int === undefined) throw new Error("no tracker saved");
  const suggested = suggestTemperament(int);
  const other = suggested === "genius" ? "feral" : "genius";

  // Settings start collapsed above the statblock, so the statblock shows higher up.
  const settings = page.getByRole("region", { name: "Settings" });
  const openSettings = () => settings.locator("summary").click();
  await expect(settings).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Temperament", exact: true })).toBeHidden();
  await openSettings();
  // By role, not getByLabel: the wrapping <label>'s text includes every option's text.
  const temperament = page.getByRole("combobox", { name: "Temperament", exact: true });
  const marked = temperament.locator("option", { hasText: `(suggested for INT ${int})` });
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveAttribute("value", suggested);
  await expect(temperament).toHaveValue(suggested);

  await temperament.selectOption(other);
  await page.getByLabel("Morale", { exact: true }).fill("15");
  const manual = page.getByRole("group", { name: "Recharge mode" }).getByRole("button", { name: "Manual" });
  await manual.click();
  await expect
    .poll(async () => (await savedStore(page)).trackers[0]?.settings)
    .toEqual({ temperament: other, morale: 15, rechargeMode: "manual" });

  await page.reload();
  await openSettings();
  await expect(temperament).toHaveValue(other);
  await expect(page.getByLabel("Morale", { exact: true })).toHaveValue("15");
  await expect(manual).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Available", exact: true }).click();
  await expect(page.getByRole("button", { name: "Spent", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start turn" }).click();
  await expect(page.getByText("Recharge is manual")).toBeVisible();
  await expect(page.getByText("Discordant Strike: rolled")).toHaveCount(0);
});

test("an unreadable save shows the storage warning and an empty app", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "{not json"), STORAGE_KEY);
  await page.reload();

  await expect(page.getByRole("alert").filter({ hasText: "Saved trackers were unreadable" })).toBeVisible();
  await expect(page.getByText("No trackers yet.")).toBeVisible();
  expect(await stored(page, CORRUPT_KEY)).toBe("{not json");
});
