/** T063: the encounter survives a reload, and an unreadable save starts the app empty with a warning. */
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { CORRUPT_KEY, STORAGE_KEY } from "@/app/useTrackers";
import { apply, blankSituation, defaultPlayerTurn } from "@/lib/encounter/state";
import { StoreSchema, serialize } from "@/lib/encounter/storage";

const MAESTRO = fileURLToPath(new URL("../fixtures/monsters/MaestroDrazzuk.CR10.2014.json", import.meta.url));

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** Upload → fix screen → review screen → tracker, as a DM would. */
async function loadMonster(page: Page, file: string, name: string) {
  await page.goto("/");
  await page.getByLabel("Upload a statblock JSON").setInputFiles(file);
  await page.getByRole("button", { name: "Check monster" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Confirm and create tracker" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect.poll(() => stored(page, STORAGE_KEY)).toContain(name);
}

/**
 * Gives the saved tracker one player and one applied turn (Discordant Strike, so its recharge is
 * spent), through the real `apply`, then reloads. Skips the decide request, which needs Jev.
 */
async function addAppliedTurn(page: Page) {
  const text = await stored(page, STORAGE_KEY);
  if (text === null) throw new Error("addAppliedTurn: nothing saved yet");
  const store = StoreSchema.parse(JSON.parse(text));
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

  await page.getByRole("button", { name: "Start turn" }).click();
  await expect(page.getByText("Discordant Strike: rolled")).toBeVisible();
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

test("an unreadable save shows the storage warning and an empty app", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "{not json"), STORAGE_KEY);
  await page.reload();

  await expect(page.getByRole("alert").filter({ hasText: "Saved trackers were unreadable" })).toBeVisible();
  await expect(page.getByText("No trackers yet.")).toBeVisible();
  expect(await stored(page, CORRUPT_KEY)).toBe("{not json");
});
